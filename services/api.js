'use client';

/** Single front-door for every server call the portal makes. */
export async function api(path, { method = 'GET', body, form } = {}) {
    const init = { method, credentials: 'same-origin', headers: {} };
    if (form) {
          init.body = form;
    } else if (body !== undefined) {
          init.headers['Content-Type'] = 'application/json';
          init.body = JSON.stringify(body);
    }
    const res = await fetch(path, init);
    let json = {};
    try { json = await res.json(); } catch { /* empty body */ }
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
}
