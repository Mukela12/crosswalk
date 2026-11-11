-- The API connects as crosswalk_app: not the owner, not a superuser, no BYPASSRLS.
-- Its password is set in afterMigrate.sql from the APP_DB_PASSWORD placeholder.
do
$$
begin
    if not exists (select 1 from pg_roles where rolname = 'crosswalk_app') then
        create role crosswalk_app login nosuperuser nocreatedb nocreaterole nobypassrls;
    end if;
end;
$$;

grant usage on schema public to crosswalk_app;

grant select on framework, requirement, control, control_requirement to crosswalk_app;
grant select on tenant, tenant_framework to crosswalk_app;
-- No password_hash: the app role can't read hashes. Sign-in goes through auth_lookup().
grant select (id, tenant_id, email, display_name, role) on app_user to crosswalk_app;
grant select, insert, delete on evidence, evidence_file to crosswalk_app;
-- Audit rows can be written and read, never changed.
grant select, insert on audit_event to crosswalk_app;
grant usage on sequence audit_event_id_seq to crosswalk_app;

-- The tenant for the current transaction, set by the API with set_config(..., true).
-- Unset means null, and every policy below then matches nothing (fail closed).
create function app_tenant() returns uuid
    language sql stable as
$$
select nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

alter table tenant enable row level security;
alter table tenant_framework enable row level security;
alter table app_user enable row level security;
alter table evidence enable row level security;
alter table evidence_file enable row level security;
alter table audit_event enable row level security;

create policy tenant_isolation on tenant
    using (id = app_tenant());
create policy tenant_isolation on tenant_framework
    using (tenant_id = app_tenant());
create policy tenant_isolation on app_user
    using (tenant_id = app_tenant());
create policy tenant_isolation on evidence
    using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy tenant_isolation on evidence_file
    using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy tenant_isolation on audit_event
    using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());

-- The one cross-tenant read in the system: find a user by email at sign-in.
create function auth_lookup(p_email text)
    returns table
            (
                id            uuid,
                tenant_id     uuid,
                tenant_name   text,
                industry      text,
                email         text,
                password_hash text,
                display_name  text,
                role          text
            )
    language sql
    stable
    security definer
    set search_path = pg_catalog, public
as
$$
select u.id, u.tenant_id, t.name, t.industry, u.email, u.password_hash, u.display_name, u.role
from public.app_user u
         join public.tenant t on t.id = u.tenant_id
where u.email = lower(p_email)
$$;

revoke all on function auth_lookup(text) from public;
grant execute on function auth_lookup(text) to crosswalk_app;
