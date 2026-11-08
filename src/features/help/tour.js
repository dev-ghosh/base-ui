// The guided tour: its steps and its state. Port of STEPS / startTour / closeTour / nextTourStep /
// prevTourStep / isTourCompleted in rie-dashboard2/js/help.js. The tour changes nothing in the app: it only
// highlights real controls (TourOverlay.jsx does the drawing and the menu open/close).
//
// Pure state module (no DOM): importable in Node.
import { createStore } from '../../store/store.js';

export const TOUR_SEEN_KEY = 'rie_tour_v2_seen';

/** `target` is a CSS selector of the real control; `nav` says the step points into the side menu. */
export const STEPS = [
  { title: 'Welcome to BASE', text: 'This is a two-minute walk through the controls you will use every day. Nothing here changes your data. Use the arrow keys or the buttons, and press Esc to leave at any time.' },
  { target: '#menu-btn', title: 'The menu', text: 'Everything lives behind this button. Click it to open or close the navigation. On a phone it slides in over the page.', nav: false },
  { target: '[data-nav="home"]', title: 'Today', text: 'Start here. Your ranked queue of what needs you: decisions, overdue P1 work, and what is due next.', nav: true },
  { target: '[data-nav="tasks"]', title: 'Work', text: 'All tasks by company and function. Matrix, Board, Hierarchy and more. It opens on Mine, so you see your own work first.', nav: true },
  { target: '[data-nav="leads"]', title: 'Pipeline', text: 'Investors, grants, tenders and pitches, moving through stages.', nav: true },
  { target: '[data-nav="escalations"]', title: 'Escalations', text: 'Stuck on something? Hand it to the person who can unblock it. They are alerted, and every step is recorded.', nav: true },
  { target: '#notif-btn', title: 'Alerts', text: 'Only what is assigned to you: overdue and upcoming tasks, new tasks, and escalations waiting on you. The number is what you have not read yet.', nav: false },
  { target: '#search-btn', title: 'Search', text: 'Find any task, person or lead. Press Ctrl+K (⌘K on a Mac) from anywhere.', nav: false },
  { target: '#new-btn', title: 'Create anything', text: 'Tasks, contacts, leads and events are all created from here.', nav: false },
  { target: '#user-chip', title: 'You', text: 'Your profile, notification settings, theme and sign-in options. Choose which alerts also reach your e-mail.', nav: false },
  { target: '[data-nav="help"]', title: 'Help & tools', text: 'A guide to every tool, with step-by-step instructions and shortcuts. You can retake this tour from there.', nav: true },
];

/** { open, step }: the overlay renders while `open`. */
export const tourStore = createStore({ open: false, step: 0 });

export function isTourCompleted() {
  try { return globalThis.localStorage?.getItem(TOUR_SEEN_KEY) === '1'; } catch { return false; }
}

/** Start the tour at step 1. Without `force`, a tour that has been finished before is not started. */
export function startTour(force = false) {
  if (!force && isTourCompleted()) return;
  tourStore.setState({ open: true, step: 0 });
}
export const replayTour = () => startTour(true);

/** Close it (Skip, Close, Done, Esc) and remember that it has been seen. */
export function closeTour() {
  tourStore.setState({ open: false, step: 0 });
  try { globalThis.localStorage?.setItem(TOUR_SEEN_KEY, '1'); } catch { /* private mode */ }
}

/** The last step's Next is "Done": it closes. */
export function nextTourStep() {
  const { open, step } = tourStore.getState();
  if (!open) return;
  if (step >= STEPS.length - 1) closeTour(); else tourStore.setState({ step: step + 1 });
}
export function prevTourStep() {
  const { open, step } = tourStore.getState();
  if (open && step > 0) tourStore.setState({ step: step - 1 });
}
