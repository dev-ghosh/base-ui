'use client';

import { useParams, useRouter } from 'next/navigation';
import InitiativeViewer from './InitiativeViewer.jsx';

/** /work/initiatives/[id] intercepted into the @modal slot, over the page that opened it: closing goes back. */
export function InitiativeViewModal() {
  const router = useRouter();
  const { id } = useParams() ?? {};
  return <InitiativeViewer id={id} onClose={() => router.back()} />;
}

/** /work/initiatives/[id] on a direct visit (a shared link, a refresh): the same viewer inside the page
 *  frame. There is nothing to go back to, so closing leaves for the Initiatives list. */
export function InitiativeViewPage() {
  const router = useRouter();
  const { id } = useParams() ?? {};
  return <InitiativeViewer id={id} framed onClose={() => router.push('/work/initiatives')} />;
}
