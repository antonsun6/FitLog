// Minimal service worker — exists for PWA installability (some browsers'
// install criteria require an active SW with a fetch handler registered),
// not for offline support. This app needs a live connection to Supabase for
// almost everything (auth, logging, history), so an offline cache layer
// would mostly just risk serving stale/wrong data — out of scope per
// docs/PRD.md (PWA requirement is "installable", not "offline-capable").
// A pure network pass-through keeps behavior identical to no SW at all.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // No-op: let the browser handle every request normally.
});
