// The first-run pointer to the guided tour: a toast, never a takeover. Port of offerTourOnce() in
// rie-dashboard2/js/app.js (it needs the toast, which is why it waited for Task 13). Called after each
// successful load; it fires once per browser session and not at all once the tour has been finished.
//
// Plain JS with relative imports: importable in Node.
import { showToast } from '../notifications/toasts.js';
import { isTourCompleted, startTour } from './tour.js';

export const TOUR_OFFERED_KEY = 'rie_tour_offered';   // sessionStorage: offered already in this session
export const TOUR_OFFER_DELAY_MS = 2500;

let timer = null;

export function offerTourOnce() {
  let offered = false;
  try { offered = !!globalThis.sessionStorage?.getItem(TOUR_OFFERED_KEY); } catch { /* blocked */ }
  if (isTourCompleted() || offered) return;
  try { globalThis.sessionStorage?.setItem(TOUR_OFFERED_KEY, '1'); } catch { /* private mode */ }
  clearTimeout(timer);
  timer = setTimeout(() => showToast({
    title: 'New to BASE?',
    message: 'Take the 2-minute tour. Tap here to start.',
    onClick: () => startTour(true),
  }), TOUR_OFFER_DELAY_MS);
}

/** Sign-out: a pending offer must not appear for the next person (or on the sign-in page). */
export function cancelTourOffer() {
  clearTimeout(timer);
  timer = null;
}
