'use client';

import { useParams, useRouter } from 'next/navigation';
import ContactViewer from './ContactViewer.jsx';

/** /contacts/people/[id] intercepted into the @modal slot, over the page that opened it: closing goes back. */
export function ContactViewModal() {
  const router = useRouter();
  const { id } = useParams() ?? {};
  return <ContactViewer id={id} onClose={() => router.back()} />;
}

/** /contacts/people/[id] on a direct visit (a shared link, a refresh): the same viewer inside the page
 *  frame. There is nothing to go back to, so closing leaves for the Contacts table. */
export function ContactViewPage() {
  const router = useRouter();
  const { id } = useParams() ?? {};
  return <ContactViewer id={id} framed onClose={() => router.push('/contacts/table')} />;
}
