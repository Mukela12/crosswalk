// Server-sent events from /api/events. Each event only names what changed; views refetch
// through the normal API, so the server applies permissions to everything shown.
let source = null;
let state = "connecting";
const stateListeners = new Set();

function setState(next) {
  state = next;
  stateListeners.forEach((fn) => fn(state));
}

export function onLiveState(fn) {
  stateListeners.add(fn);
  fn(state);
  return () => stateListeners.delete(fn);
}

export function connectLive() {
  disconnectLive();
  setState("connecting");
  source = new EventSource("/api/events");
  source.onopen = () => setState("live");
  source.onerror = () => setState(source && source.readyState === EventSource.CLOSED ? "offline" : "connecting");
  source.addEventListener("change", (event) => {
    let detail;
    try { detail = JSON.parse(event.data); } catch { return; }
    window.dispatchEvent(new CustomEvent("cw:change", { detail }));
  });
}

export function disconnectLive() {
  if (source) source.close();
  source = null;
}
