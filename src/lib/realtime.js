import { sbUrl, sbKey, getStorage, SESSION_KEY } from './config.js';

// Resolved at connect time so a missing env var throws from initRealtime, not
// at import. WebSocket and localStorage are looked up on globalThis per call so
// the module is importable (and testable with a fake socket) in plain Node.
const wsUrl = () => sbUrl().replace('https://', 'wss://').replace('http://', 'ws://');
// Compatibility and derived queues remain subscribed until every write path is
// authoritative enough for the client to distinguish an echo from a gap.
const TABLES = ['contacts', 'tasks', 'events', 'event_guests', 'entities', 'decision_queue', 'cleanup_queue', 'leads', 'lead_history', 'escalations'];

let socket = null;
let reconnectTimer = null;
let reconnectDelay = 2000;
let onChangeFn = null;
let hasConnected = false;
let lastToken = null;

function send(msg) {
  if (socket?.readyState === globalThis.WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

/** The signed-in user's JWT, or the anon key. Realtime enforces RLS with
 *  whatever token the channel was authorised with, so joining as anon on an
 *  RLS-protected table yields a channel that receives nothing, silently. */
function authToken() {
  try {
    const raw = getStorage()?.getItem(SESSION_KEY);
    const t = raw && JSON.parse(raw).accessToken;
    if (t) return t;
  } catch { /* fall through */ }
  return sbKey();
}

/**
 * Join one channel per table.
 *
 * Two things here are load-bearing and were both missing until 2026-09-07,
 * which is why realtime had never delivered a single change for any table this
 * app actually reads:
 *
 *   1. `config.postgres_changes` — without the binding the server joins the
 *      channel happily and sends no database changes at all. The join even
 *      replies `status: "ok"`. The only hint is a separate `system` frame.
 *   2. `access_token` — RLS is on. A channel authorised with the anon key sees
 *      nothing on entities, contacts or tasks.
 *
 * The server must also be publishing the table
 * (supabase/migrations/20260907_realtime_publication.sql); if it is not, it
 * answers with a `system` error frame, which onmessage now surfaces instead of
 * dropping.
 */
function subscribe() {
  lastToken = authToken();
  TABLES.forEach((table, i) => {
    send({
      topic: `realtime:public:${table}`,
      event: 'phx_join',
      payload: {
        config: {
          postgres_changes: [{ event: '*', schema: 'public', table }],
          broadcast: { self: false },
          presence: { key: '' },
        },
        access_token: lastToken,
      },
      ref: String(i + 1),
    });
  });
}

/**
 * Re-authorise every channel after a token refresh. A JWT that expires on an
 * open socket does not close it; the subscription just stops delivering, which
 * looks exactly like "nothing is happening".
 */
function refreshChannelAuth() {
  const token = authToken();
  if (token === lastToken) return;
  lastToken = token;
  for (const table of TABLES) {
    send({
      topic: `realtime:public:${table}`,
      event: 'access_token',
      payload: { access_token: token },
      ref: null,
    });
  }
}

function connect() {
  if (socket && socket.readyState < globalThis.WebSocket.CLOSING) return;

  socket = new globalThis.WebSocket(`${wsUrl()}/realtime/v1/websocket?apikey=${sbKey()}&vsn=1.0.0`);

  socket.onopen = () => {
    const isReconnect = hasConnected;
    hasConnected = true;
    reconnectDelay = 2000;
    subscribe();
    if (isReconnect) onChangeFn?.({ type: 'resync', reason: 'reconnect' });
    // keepalive heartbeat every 30 s
    const hb = setInterval(() => {
      if (socket?.readyState !== globalThis.WebSocket.OPEN) { clearInterval(hb); return; }
      send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: null });
      // Cheap place to notice the JWT rotated under us.
      refreshChannelAuth();
    }, 30000);
  };

  socket.onmessage = evt => {
    try {
      const msg = JSON.parse(evt.data);
      // A rejected subscription arrives as a `system` frame, not as an error on
      // the join. Surfacing it is the difference between "realtime is broken"
      // and four years of assuming it works.
      if (msg.event === 'system' && msg.payload?.status === 'error') {
        console.warn('[realtime] subscription refused:', msg.payload?.message || msg.topic);
        onChangeFn?.({ type: 'error', topic: msg.topic, message: msg.payload?.message || '' });
        return;
      }
      if (msg.event === 'postgres_changes' || msg.event === 'INSERT' || msg.event === 'UPDATE' || msg.event === 'DELETE') {
        const data = msg.payload?.data || msg.payload || {};
        const table = data.table || msg.topic?.split(':').pop() || '';
        const eventType = data.eventType || data.type || msg.event;
        onChangeFn?.({
          table,
          eventType: String(eventType).toUpperCase(),
          new: data.new || data.record || null,
          old: data.old || data.old_record || null,
        });
      }
    } catch { /* ignore malformed frames */ }
  };

  socket.onclose = () => {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => { reconnectDelay = Math.min(reconnectDelay * 2, 30000); connect(); }, reconnectDelay);
  };

  socket.onerror = () => socket.close();
}

export function initRealtime(onChange) {
  onChangeFn = onChange;
  connect();
}

export function destroyRealtime() {
  clearTimeout(reconnectTimer);
  hasConnected = false;
  lastToken = null;
  if (socket) { socket.onclose = null; socket.close(); socket = null; }
}
