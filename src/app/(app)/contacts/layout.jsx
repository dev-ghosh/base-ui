'use client';

import { Suspense } from 'react';
import { useSelectedLayoutSegment } from 'next/navigation';
import ContactsScreen from '@/features/contacts/ContactsScreen.jsx';

/**
 * The Contacts frame. The screen (filters, search bar, list) lives here, not in the table/cards pages, so
 * switching between the two sub-views keeps the bulk selection and the scroll position, and so it is
 * still there behind the contact viewer when that opens as an intercepted modal (the layout reads the
 * routed segment of its own `children` slot, which stays on table/cards under the modal; usePathname
 * would already say /contacts/people/<id>). A contact opened by its own URL (a direct visit to
 * /contacts/people/<id>) shows only the viewer. The screen reads the URL (filters are search params),
 * which needs a Suspense boundary so the rest of the tree can still be prerendered.
 */
export default function ContactsLayout({ children }) {
  const segment = useSelectedLayoutSegment();
  if (segment === 'people') return children;
  return (
    <>
      <Suspense fallback={null}>
        <ContactsScreen view={segment === 'cards' ? 'cards' : 'table'} />
      </Suspense>
      {children}
    </>
  );
}
