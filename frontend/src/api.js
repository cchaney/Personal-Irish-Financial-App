async function req(method, url, body, isForm) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    if (isForm) opts.body = body;
    else { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  }
  const r = await fetch(url, opts);
  if (!r.ok) {
    let msg = `Request failed (${r.status})`;
    try { const j = await r.json(); msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail); } catch {}
    throw new Error(msg);
  }
  const ct = r.headers.get("content-type") || "";
  return ct.includes("application/json") ? r.json() : r.text();
}
const qs = (o) => {
  o = o || {};
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => v !== undefined && v !== null && v !== "" && p.set(k, v));
  const s = p.toString();
  return s ? `?${s}` : "";
};
export const api = {
  get: (u, q) => req("GET", u + qs(q)),
  post: (u, b) => req("POST", u, b ?? {}),
  put: (u, b) => req("PUT", u, b),
  patch: (u, b) => req("PATCH", u, b),
  del: (u) => req("DELETE", u),
  form: (u, fd) => req("POST", u, fd, true),
};
