'use client';

import { useParams, useRouter } from 'next/navigation';
import Modal from './Modal.jsx';

/**
 * Stand-in for a screen a later task builds. Shows the page title (and the record id
 * for a viewer route) inside the page frame (`.tp.active`). It is replaced, not extended:
 * each feature task swaps its page.jsx for the real screen.
 */
export default function PagePlaceholder({ title }) {
  const { id } = useParams() ?? {};
  return (
    <div className="tp active" data-route-placeholder="">
      <div style={{ padding: '20px' }}>
        <h2>{title}</h2>
        {id != null && <p>{String(id)}</p>}
      </div>
    </div>
  );
}

/**
 * Stand-in for a record viewer rendered as an intercepting route in the @modal slot
 * (spec C7(c)): the same box over the page, with a real URL behind it. Closing it goes
 * back, which is what dismisses an intercepted route.
 */
export function ModalPlaceholder({ title }) {
  const router = useRouter();
  const { id } = useParams() ?? {};
  return (
    <Modal open title={title} onClose={() => router.back()}>
      {id != null && <p>{String(id)}</p>}
    </Modal>
  );
}
