// The boot splash's state. Port of sp() and hideSplash() in rie-dashboard2/js/utils.js.
// The <Splash> component owns the 450 ms fade-out; this is only the shared state.
import { createStore } from '../store/store.js';

const INITIAL = { msg: 'Initialising…', hidden: false };

export const splashStore = createStore(INITIAL);

/** Set the line under the spinner. */
export function sp(msg) {
  splashStore.setState({ msg });
}

/** Show the splash again (the old sign-in path did this before loading data). */
export function showSplash(msg) {
  splashStore.setState(msg === undefined ? { hidden: false } : { hidden: false, msg });
}

export function hideSplash() {
  splashStore.setState({ hidden: true });
}

export function resetSplash() {
  splashStore.setState(INITIAL);
}
