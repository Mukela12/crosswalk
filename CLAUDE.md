# Crosswalk: rules for Claude Code in this repo

Crosswalk is a multi-tenant GRC app. A control maps to requirements in several frameworks, so one piece of
evidence counts toward all of them. Read `specs/` before changing a module; the spec is the contract, and the
attack tests in `api/src/test/java/dev/crosswalk/attacks` are its proof.

## Security invariants (never break these)

1. **Tenancy lives in the database.** Every tenant table has `tenant_id`, row-level security enabled and a
   `tenant_isolation` policy using `app_tenant()`. Queries never filter on `tenant_id` themselves.
   A new tenant table needs all three plus a test in `DatabaseGuardrailsTest`.
2. **The tenant comes from the session only.** It is set once per transaction in
   `TenantScopedTransactionManager`. Never read a tenant, user or role from request input.
3. **Database access happens inside `@Transactional` service methods.** Outside a transaction no tenant is
   set and RLS returns nothing. That is the intended fail-closed behaviour, not a bug to work around.
4. **The API runs as `crosswalk_app`:** not the owner, no `BYPASSRLS`, no `UPDATE`/`DELETE` on `audit_event`,
   no read on `app_user.password_hash`. Grants only change in a new migration, with a guardrail test.
5. **Every state-changing endpoint** needs CSRF (Spring Security default), a role check (`@PreAuthorize`),
   an audit row in the same transaction, and an attack test proving the refusal.
6. **Uploads:** type from magic bytes, 2 MB cap, rebuilt file name, served as an attachment with
   `nosniff` and a sandbox CSP.
7. **Front end:** build DOM with `h()` from `web/js/dom.js`. No `innerHTML`, no inline scripts or styles
   (the CSP blocks them), links from users must be `https://`.
8. **Errors** leave as `{"error": "..."}` written for people. No stack traces, SQL or class names.
9. **Secrets** live in Railway variables and Wrangler secrets. Never in the repo, logs or test output.

## Workflow

1. Update or write the spec in `specs/` first.
2. Write the attack test that should fail, then the code.
3. `cd api && ./mvnw verify` must pass (needs Postgres; see README). Paste the summary in the PR.
4. UI changes: check light and dark, and 375px width.

## Style

- No em dashes in UI copy or docs. Commas, periods, colons.
- UI copy: one label per thing, no explanatory sentences under buttons, no notes about how the code works.
- Colour in the UI is for control status only.
