export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function csrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function ensureCsrf() {
  if (!csrfToken()) await fetch("/api/csrf", { credentials: "same-origin" });
}

async function request(method, path, body, { form = false, retried = false } = {}) {
  const headers = { Accept: "application/json" };
  if (method !== "GET") {
    await ensureCsrf();
    headers["X-XSRF-TOKEN"] = csrfToken() || "";
  }
  if (body && !form) headers["Content-Type"] = "application/json";

  const res = await fetch(path, {
    method,
    headers,
    credentials: "same-origin",
    body: form ? body : body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && path !== "/api/session") {
    window.dispatchEvent(new CustomEvent("cw:signed-out"));
  }
  if (!res.ok) {
    let message = "Something went wrong. Try again.";
    try {
      const data = await res.json();
      if (data && data.error) message = data.error;
    } catch {}
    // A rotated or expired CSRF token: fetch a fresh one and retry once.
    if (res.status === 403 && method !== "GET" && !retried) {
      await fetch("/api/csrf", { credentials: "same-origin" });
      return request(method, path, body, { form, retried: true });
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return null;
  return (res.headers.get("content-type") || "").includes("json") ? res.json() : res;
}

export const api = {
  get: (path) => request("GET", path),
  post: (path, body) => request("POST", path, body),
  form: (path, formData) => request("POST", path, formData, { form: true }),
  del: (path) => request("DELETE", path),
};
