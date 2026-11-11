-- Reference data: frameworks, their requirements, and the shared control library.
-- Read-only to the application role.
create table framework (
    id      smallint primary key,
    code    text not null unique,
    name    text not null,
    version text not null
);

create table requirement (
    id           integer primary key,
    framework_id smallint not null references framework (id),
    ref          text not null,
    title        text not null,
    unique (framework_id, ref)
);

create table control (
    id          integer primary key,
    code        text not null unique,
    domain      text not null,
    title       text not null,
    description text not null
);

create table control_requirement (
    control_id     integer not null references control (id),
    requirement_id integer not null references requirement (id),
    primary key (control_id, requirement_id)
);

-- Sample artifact names used by the demo seeder only.
create table control_sample_evidence (
    control_id integer not null references control (id),
    ord        smallint not null,
    title      text not null,
    primary key (control_id, ord)
);

-- Tenant data. Every table below carries tenant_id and is protected by row-level security.
create table tenant (
    id       uuid primary key,
    name     text not null,
    industry text not null
);

create table tenant_framework (
    tenant_id    uuid not null references tenant (id),
    framework_id smallint not null references framework (id),
    primary key (tenant_id, framework_id)
);

create table app_user (
    id            uuid primary key,
    tenant_id     uuid not null references tenant (id),
    email         text not null unique check (email = lower(email)),
    password_hash text not null,
    display_name  text not null,
    role          text not null check (role in ('LEAD', 'AUDITOR'))
);

create table evidence (
    id           uuid primary key default gen_random_uuid(),
    tenant_id    uuid not null references tenant (id),
    control_id   integer not null references control (id),
    title        text not null check (char_length(title) between 1 and 120),
    kind         text not null check (kind in ('FILE', 'LINK')),
    url          text check (url is null or url like 'https://%'),
    file_name    text,
    content_type text,
    size_bytes   integer,
    collected_on date not null,
    expires_on   date not null check (expires_on > collected_on),
    created_by   uuid references app_user (id),
    created_at   timestamptz not null default now(),
    check ((kind = 'LINK' and url is not null and file_name is null)
        or (kind = 'FILE' and url is null and file_name is not null))
);
create index evidence_tenant_control on evidence (tenant_id, control_id);

create table evidence_file (
    evidence_id uuid primary key references evidence (id) on delete cascade,
    tenant_id   uuid not null references tenant (id),
    bytes       bytea not null
);

create table audit_event (
    id           bigint generated always as identity primary key,
    tenant_id    uuid not null references tenant (id),
    actor_id     uuid,
    actor_name   text not null,
    action       text not null,
    control_code text,
    detail       text,
    at           timestamptz not null default now()
);
create index audit_event_tenant_at on audit_event (tenant_id, at desc);

-- The audit trail is append-only for everyone, including the schema owner.
create function audit_event_append_only() returns trigger
    language plpgsql as
$$
begin
    raise exception 'audit_event is append-only';
end;
$$;

create trigger audit_event_no_update_or_delete
    before update or delete on audit_event
    for each row execute function audit_event_append_only();
