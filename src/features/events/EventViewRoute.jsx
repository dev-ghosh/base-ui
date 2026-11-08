'use client';

import { useParams, useRouter } from 'next/navigation';
import EventViewer from './EventViewer.jsx';

/** /events/[id] intercepted into the @modal slot, over the page that opened it: closing goes back. */
export function EventViewModal() {
  const router = useRouter();
  const { id } = useParams() ?? {};
  return <EventViewer id={id} onClose={() => router.back()} />;
}

/** /events/[id] on a direct visit (a shared link, a refresh): the same viewer inside the page frame. There
 *  is nothing to go back to, so closing leaves for Events. */
export function EventViewPage() {
  const router = useRouter();
  const { id } = useParams() ?? {};
  return <EventViewer id={id} framed onClose={() => router.push('/events')} />;
}
