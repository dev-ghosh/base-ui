'use client';

import { useAccess } from '../hooks/useAccess.js';

/**
 * Shown under the status bar when the user can read but not write. A silently missing
 * button reads as a broken app, so the banner says why (applyAccessMode in the old
 * access.js). Not shown when rie_my_access failed: access is null then, as before.
 */
export default function ReadOnlyBanner() {
  const { canWrite, access } = useAccess();
  if (canWrite || !access) return null;
  return <div id="ro-bar">View only. You can read everything here but not change it.</div>;
}
