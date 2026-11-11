# Crosswalk

A multi-tenant compliance workspace where one control maps to every framework requirement it satisfies, so a single
piece of evidence counts toward SOC 2, ISO/IEC 27001:2022, the HIPAA Security Rule and PCI DSS 4.0.1 at once.

**Live:** https://crosswalk.mukela-j-katungu.workers.dev
One-click demo accounts on the sign-in page. Sample data resets every 6 hours.

## Try this

1. Sign in as **Nadia Brooks** (compliance lead, Ledgerly). Hover the dots across the top of the overview: each is a
   control, each line maps it to a framework. Hover a framework card to see every control feeding it.
2. Open a second window and sign in as **Tomas Lindqvist** (external auditor, same company).
3. As Nadia, open a control marked Missing and attach a file or link. The auditor's window updates live: pulses run
   down that control's lines and every framework it maps to moves at once.
4. Press <kbd>⌘K</kbd> (or <kbd>Ctrl K</kbd>) and type a requirement ref such as `8.4` or `164.312`.
5. Sign in as **Imani Mwale** (Kestrel Health): a different company, different frameworks, none of Ledgerly's data.

## Architecture

```
Browser: vanilla JS single-page app + HTML5 Canvas renderer (no framework, no build step)
   |
Cloudflare Worker: serves the app from static assets, strict CSP and security headers,
   |               per-IP rate limits, adds X-Edge-Auth + X-Client-IP, streams SSE
   | /api/*
Railway: Spring Boot 4.1 on Java 21 in Docker
   |       Spring Security 7 sessions + CSRF, Spring Data JPA, Flyway, server-sent events
   |
Postgres 16: row-level security per tenant, least-privilege app role, append-only audit trail
```

| Folder | What it holds |
| --- | --- |
| `api/` | Spring Boot API, Flyway migrations, Dockerfile, Railway config, the attack test suite |
| `web/` | The single-page app: `js/field.js` is the Canvas renderer, `js/dom.js` builds every node |
| `edge/` | Cloudflare Worker, Wrangler config, zone WAF rules for a custom domain |
| `specs/` | The spec each module is built and tested against, and the verified control mappings |
| `tools/` | Generates the reference-data migration from `specs/controls.json` |

## Security model

- **Tenancy is enforced by Postgres, not by query code.** Every tenant table has row-level security. The tenant is set
  once per transaction (`set_config('app.tenant_id', ..., true)`) in `TenantScopedTransactionManager`, from the
  session only. No query in the API filters on `tenant_id`; with no tenant set, every policy matches nothing.
- **Least privilege.** The API connects as `crosswalk_app`: not the owner, no `BYPASSRLS`, no access to password
  hashes, insert and select only on the audit trail. Migrations run as the owner.
- **Append-only audit.** A trigger refuses updates and deletes even for the owner. Evidence changes are recorded in
  the same transaction as the change; exports and sign-ins are recorded too.
- **Sessions.** HttpOnly, Secure, SameSite=Strict cookie; CSRF token on every write (sign-in included); new session id
  and CSRF token at sign-in; same answer for unknown email and wrong password.
- **Brute force.** 10 sign-ins a minute per IP at the edge; behind it, 5 failures per IP and email and 30 per IP per
  15 minutes on the server. The account itself is never locked, so nobody can lock a real user out.
- **Uploads.** Type from magic bytes, 2 MB cap, rebuilt file names, downloads served as attachments with `nosniff`
  and a sandbox CSP. Links must be `https://`.
- **Exports.** CSV cells that start with `= + - @` are prefixed so spreadsheets don't execute them.
- **Origin lockdown.** With `EDGE_SECRET` set, the API refuses any `/api` call without the Worker's header (constant-time
  comparison), so the edge can't be bypassed by calling Railway directly.
- **Front end.** CSP `script-src 'self'; style-src 'self'`, no inline code. Every node is built through DOM APIs;
  CI fails on `innerHTML`, `eval` and similar.

## Attack test suite

41 tests in `api/src/test/java/dev/crosswalk/attacks`, run against a real Postgres with row-level security on.
Each plays an attacker and expects a refusal.

| OWASP Top 10:2025 | What is attacked |
| --- | --- |
| A01 Broken Access Control | Cross-tenant download, delete, report export and reads; auditor writes; mass assignment of tenant and author; all routes signed out |
| A01 + A08 database guardrails | No tenant sees nothing; tenant A can't read or insert B's rows; app role can't read hashes, disable RLS or edit audit rows; owner can't edit audit rows |
| A02 Security Misconfiguration | Hardening headers; actuator locked down; origin refuses calls that skip the edge |
| A05 Injection | SQL payloads in search; stored script in titles; `javascript:` and `data:` links; spreadsheet formula injection |
| A06 Insecure Design | HTML disguised as PDF; oversized files; path traversal in names; download headers; evidence validation |
| A07 Authentication Failures | Account enumeration; brute force throttle; session fixation; missing and forged CSRF tokens; sign-out |
| A10 Mishandling of Exceptional Conditions | Errors leave as short JSON with no stack traces, SQL or class names |
| Product behaviour | One evidence item raises every framework its control maps to, and is audited |

CI (`.github/workflows`) runs the suite on every push and pull request, plus CodeQL for Java and JavaScript, a
check for unsafe DOM APIs, Dependabot for Maven, Docker and Actions, and a Claude security review on pull requests
when an `ANTHROPIC_API_KEY` secret is set. Actions are pinned to commit SHAs.

## How it is built

Claude Code does the drafting under the rules in `CLAUDE.md`; each module has a spec in `specs/`; the attack tests
are the acceptance criteria. A change is done when its spec is updated, its attack test exists and `./mvnw verify`
passes.

## Run locally

Needs JDK 21, Postgres 16 and Wrangler.

```bash
createdb crosswalk && createdb crosswalk_test
cd api && ./mvnw verify                  # the attack suite, against crosswalk_test
COOKIE_SECURE=false EDGE_SECRET=local-dev-secret ./mvnw spring-boot:run
cd ../edge && cp .dev.vars.example .dev.vars && wrangler dev   # http://localhost:8787
```

## Deploy

- **Railway:** a Postgres service and `crosswalk-api` built from `api/Dockerfile`, with `DB_URL`
  (`jdbc:postgresql://${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}`), `DB_OWNER_USER`,
  `DB_OWNER_PASSWORD`, `APP_DB_PASSWORD` and `EDGE_SECRET`. Health check: `/healthz`.
- **Cloudflare:** `wrangler deploy`, then `wrangler secret put EDGE_SECRET` with the same value.

## Known limits

- Live updates fan out in memory, so the API runs as one instance. More instances would fan out through Postgres
  `LISTEN/NOTIFY`.
- `edge/waf-rules.json` needs a custom domain on Cloudflare. On `workers.dev` the Worker's own rate limits and
  headers apply.
- The control library is a sample: 24 controls and 113 requirements, checked against the public sources listed in
  `specs/controls.json`. It isn't a substitute for an auditor's judgement.
- The demo accounts share one public password and shared sample data.

## Credits

IBM Plex (SIL Open Font License), Tabler Icons (MIT), Lordicon icons, lottie-web (MIT).
