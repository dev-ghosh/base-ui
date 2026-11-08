// Which top-bar menu is open ('theme' | 'new' | 'user' | null). The Header owns the menus; this is
// the one shared state so other screens can open one (Help's "Open New" and "Open Export & sync" did
// `toggleNewMenu()` / `toggleUserMenu()` in the old app). Plain JS, no DOM.
import { createStore } from '../store/store.js';

export const menuStore = createStore({ menu: null });

export const setMenu = (menu) => menuStore.setState({ menu });
export const toggleHeaderMenu = (name) => menuStore.setState((s) => ({ menu: s.menu === name ? null : name }));
