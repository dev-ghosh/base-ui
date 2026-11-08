'use client';

import { useSelectedLayoutSegment } from 'next/navigation';
import EscalationsScreen from '@/features/escalations/EscalationsScreen.jsx';
import { VIEW_KEYS } from '@/features/escalations/model.js';

/**
 * The Escalations frame. The screen (header, the four tabs, the cards, the reporting lines) lives here,
 * not in the four sub-view pages, so switching tabs keeps the page in place. `.tp.active` is the old
 * `#tab-escalations` page frame, `#escalations-root` its root.
 */
export default function EscalationsLayout({ children }) {
  const segment = useSelectedLayoutSegment();
  // At /escalations itself (no sub-view yet) only the index page renders: it forwards to the right one.
  if (!VIEW_KEYS.includes(segment)) return children;
  return (
    <>
      <div className="tp active" id="tab-escalations">
        <div id="escalations-root"><EscalationsScreen view={segment} /></div>
      </div>
      {children}
    </>
  );
}
