'use client';

import { useParams, useRouter } from 'next/navigation';
import LeadViewer from './LeadViewer.jsx';

/** /pipeline/leads/[id] intercepted into the @modal slot, over the page that opened it: closing goes back. */
export function LeadViewModal() {
  const router = useRouter();
  const { id } = useParams() ?? {};
  return <LeadViewer id={id} onClose={() => router.back()} />;
}

/** /pipeline/leads/[id] on a direct visit (a shared link, a refresh): the same viewer inside the page
 *  frame. There is nothing to go back to, so closing leaves for the Pipeline. */
export function LeadViewPage() {
  const router = useRouter();
  const { id } = useParams() ?? {};
  return <LeadViewer id={id} framed onClose={() => router.push('/pipeline')} />;
}
