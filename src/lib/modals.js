// Open/closed state of the always-available modals, by their old id (`mo-del`, `mo-tf`, ...).
// Port of openMo()/closeMo() in rie-dashboard2/js/utils.js, which toggled `.open` on
// `#mo-*`. Shared module state so a button anywhere can open a <Modal> rendered elsewhere.
//
// Record viewers are not here: they are intercepting routes in the @modal slot (C7).
import { createStore } from '../store/store.js';

export const modalStore = createStore({ open: {} });

export const isMoOpen = (id) => modalStore.getState().open[id] === true;

export function openMo(id) {
  modalStore.setState((s) => ({ open: { ...s.open, [id]: true } }));
}

export function closeMo(id) {
  if (!isMoOpen(id)) return;
  modalStore.setState((s) => ({ open: { ...s.open, [id]: false } }));
}

export function closeAllMo() {
  modalStore.setState({ open: {} });
}
