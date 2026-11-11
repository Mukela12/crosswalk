# Spec 01: Tenancy and data access

## Goal
A company sees only its own evidence, scope, users and audit trail, and that holds even if application code
has a bug.

## Rules
- Tenant tables: `tenant`, `tenant_framework`, `app_user`, `evidence`, `evidence_file`, `audit_event`.
  Each has row-level security with policy `tenant_isolation` comparing its tenant column to `app_tenant()`.
- `app_tenant()` reads `app.tenant_id`, set with `set_config(..., true)` (transaction-local) at the start of
  every transaction from the signed-in user. Unset means null, and every policy matches nothing.
- The API connects as `crosswalk_app`. Migrations and the demo seeder connect as the schema owner.
- Sign-in is the one cross-tenant read: `auth_lookup(email)`, a `SECURITY DEFINER` function the app role may
  execute. The app role can't select `password_hash` directly.
- Another tenant's row is reported as 404, never 403, so ids can't be probed.

## Acceptance (tests)
- `DatabaseGuardrailsTest`: no tenant sees zero rows; a tenant can't read or insert another's rows; the app role
  can't read hashes, disable RLS or edit audit rows.
- `A01BrokenAccessControlTest`: cross-tenant download, delete and report export fail; extra form fields can't
  change tenant or author.
