/*
 * JFINDX service worker — the offline shell (CLAUDE.md §4).
 *
 * What it caches, and why:
 *   - /_next/static/*, /icons/*, the manifest: immutable build assets →
 *     cache-first. This is the app itself.
 *   - Pages (and Next's client-navigation payloads) that a phone has opened:
 *     network-first, falling back to the last copy — so a survey opened once
 *     opens again in a camp with no signal.
 *
 * Organisation logos (the public `org-logos` storage folder, migration 0037)
 * are the ONE cross-origin thing kept, cache-first — so a survey opened at a
 * camp still shows its own logo with no signal. Public branding only.
 *
 * What it never caches: anything else cross-origin (the Supabase API — answers go
 * through the survey outbox in IndexedDB, not here), /api/*, and signed-in
 * surfaces (/build, /*\/dashboard, /access) — so no one else's session or a
 * stale dashboard ever lives in a phone's cache. Nothing here holds a
 * respondent's answers.
 */
const VERSION = "jfi-v2"; // v2: also keeps organisation logos for offline use
const PAGES = `${VERSION}-pages`;
const STATIC = `${VERSION}-static`;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(STATIC).then((c) => c.addAll(["/icons/icon-192.png", "/icons/icon-512.png"]).catch(() => undefined)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const NEVER = [/^\/api\//, /^\/build(\/|$)/, /^\/access(\/|$)/, /^\/[^/]+\/dashboard(\/|$)/, /^\/auth\//];

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

async function networkFirst(req) {
  const cache = await caches.open(PAGES);
  try {
    const res = await Promise.race([fetch(req), timeout(5000)]);
    if (res && res.ok && res.type === "basic") cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreVary: true });
    if (hit) return hit;
    if (req.mode === "navigate") {
      return new Response(
        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title>' +
          '<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.25rem;color:#22252b">' +
          "<h1 style=\"font-size:1.4rem\">You're offline.</h1><p style=\"line-height:1.5;color:#5b6270\">This page hasn't been opened on this phone before, so there's no copy to show. " +
          "Surveys you have opened once work with no signal — open this one again when you're connected.</p></body>",
        { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 },
      );
    }
    throw new Error("offline");
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

// A logo <img> is a no-cors request, so the response is "opaque" (status 0).
// That is still safe to keep and replay for an <img>; only cache real images.
async function logo(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    if (url.pathname.includes("/storage/v1/object/public/org-logos/")) e.respondWith(logo(req));
    return;
  }
  if (NEVER.some((r) => r.test(url.pathname))) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/icon-mark.svg") {
    e.respondWith(cacheFirst(req));
    return;
  }
  const isPage = req.mode === "navigate" || req.headers.get("RSC") === "1" || url.searchParams.has("_rsc");
  if (isPage || url.pathname.endsWith(".webmanifest")) {
    e.respondWith(networkFirst(req));
  }
});
