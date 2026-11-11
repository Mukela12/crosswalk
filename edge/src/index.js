// Crosswalk edge Worker.
//
// - Serves the vanilla JS app from static assets with a strict CSP (no inline script or style).
// - Proxies /api/* to the Spring API on Railway, adding X-Edge-Auth so the origin can refuse
//   anything that skipped the edge, and X-Client-IP so the origin rate-limits real clients.
// - Rate-limits sign-in per client IP before it reaches the origin.
// - Streams responses (server-sent events included) without buffering them.

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const PAGE_HEADERS = {
  "Content-Security-Policy": CSP,
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
};

const API_METHODS = new Set(["GET", "POST", "DELETE"]);
const MAX_BODY_BYTES = 3 * 1024 * 1024;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return proxyApi(request, env, url);
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json(405, { error: "Method not allowed" }, { Allow: "GET, HEAD" });
    }
    const asset = await env.ASSETS.fetch(request);
    const response = new Response(asset.body, asset);
    for (const [name, value] of Object.entries(PAGE_HEADERS)) response.headers.set(name, value);
    if (url.pathname.startsWith("/fonts/")) {
      response.headers.set("Cache-Control", "public, max-age=31536000, immutable");
    }
    return response;
  },
};

async function proxyApi(request, env, url) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";

  if (!API_METHODS.has(request.method)) {
    return json(405, { error: "Method not allowed" }, { Allow: [...API_METHODS].join(", ") });
  }
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) {
    return json(413, { error: "Files can be up to 2 MB" });
  }

  const limiter = request.method === "POST" && url.pathname === "/api/session" ? env.LOGIN_LIMITER : env.API_LIMITER;
  const { success } = await limiter.limit({ key: ip });
  if (!success) {
    console.log(JSON.stringify({ event: "rate_limited", path: url.pathname, method: request.method }));
    return json(429, { error: "Too many requests. Try again in a minute." }, { "Retry-After": "60" });
  }

  const headers = new Headers(request.headers);
  // Never trust these from the client: the Worker sets them.
  headers.set("X-Edge-Auth", env.EDGE_SECRET);
  headers.set("X-Client-IP", ip);
  headers.set("X-Forwarded-Proto", "https");
  headers.delete("X-Forwarded-For");

  const target = new URL(url.pathname + url.search, env.ORIGIN_URL);
  let upstream;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" ? undefined : request.body,
      redirect: "manual",
    });
  } catch (error) {
    console.error(JSON.stringify({ event: "origin_unreachable", message: String(error) }));
    return json(502, { error: "The service is unavailable. Try again shortly." });
  }

  const response = new Response(upstream.body, upstream);
  response.headers.delete("Server");
  response.headers.delete("X-Powered-By");
  response.headers.set("Strict-Transport-Security", PAGE_HEADERS["Strict-Transport-Security"]);
  return response;
}

function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
  });
}
