'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { getTheme, setTheme, subscribeTheme } from '../lib/theme.js';

/**
 * { theme, setTheme(name) } for the four themes. The server renders "dark" (what the
 * root layout ships); the client reads the attribute the early script set.
 */
export function useTheme() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => 'dark');
  return useMemo(() => ({ theme, setTheme }), [theme]);
}
