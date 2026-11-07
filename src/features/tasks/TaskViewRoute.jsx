'use client';

import { useParams, useRouter } from 'next/navigation';
import TaskViewer from './TaskViewer.jsx';

/** /work/tasks/[id] intercepted into the @modal slot, over the page that opened it: closing goes back. */
export function TaskViewModal() {
  const router = useRouter();
  const { id } = useParams() ?? {};
  return <TaskViewer id={id} onClose={() => router.back()} />;
}

/** /work/tasks/[id] on a direct visit (a shared link, a refresh): the same viewer inside the page
 *  frame. There is nothing to go back to, so closing leaves for Work. */
export default function TaskViewPage() {
  const router = useRouter();
  const { id } = useParams() ?? {};
  return <TaskViewer id={id} framed onClose={() => router.push('/work')} />;
}
