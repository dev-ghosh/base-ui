'use client';

import { ModalPlaceholder } from '@/components/PagePlaceholder.jsx';

// Placeholder for the record viewer shown over the page on a soft navigation to /work/initiatives/[id].
// A later task replaces it with the real viewer (the full-page twin renders on a direct visit).
export default function Page() {
  return <ModalPlaceholder title="Initiative" />;
}
