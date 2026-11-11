# Spec 03: Live updates and the edge

## Live updates
- `GET /api/events` is a server-sent event stream per signed-in browser, grouped by tenant.
- Events carry only type, control code, actor and time. Browsers refetch through the normal API.
- Sent after the transaction commits. Heartbeat every 25 seconds. Single instance; several instances would
  fan out through Postgres `LISTEN/NOTIFY`.

## Edge (Cloudflare Worker)
- Serves the static app with a strict CSP: `script-src 'self'`, `style-src 'self'`, no inline code.
- Proxies `/api/*` to Railway, adding `X-Edge-Auth` (Wrangler secret) and `X-Client-IP`.
- With `EDGE_SECRET` set, the API refuses `/api/*` without the matching header (constant-time compare).
  `/healthz` stays open for the platform health check.
- Rate limits per client IP: sign-in 10 a minute, API 300 a minute. Server-side throttle behind it:
  5 failures per IP and email, 30 per IP, per 15 minutes; never locks the account itself.
- `edge/waf-rules.json`: zone WAF custom rules, applied when the Worker runs on a custom domain.

## Acceptance (tests)
- `EdgeLockdownTest`, `A07AuthenticationFailuresTest`, `A02SecurityMisconfigurationTest`.
