'use client';

import { useModal } from '../hooks/useModal.js';

/**
 * The old `.mo` / `.mb` modal. Opened and closed with useModal(id) (the `.open` class),
 * or controlled with `open` + `onClose` (the @modal intercepting routes use that: the
 * route being rendered is what makes them open).
 *
 *   <Modal id="mo-del" title="Confirm delete">...</Modal>
 *
 * The backdrop closes it, as the old document-level click handler did, unless
 * `dismissible={false}` (mo-user, mo-triage). The title bar is always present (as in the old markup); the body is mounted only while open.
 * Size: `wide` is `.mb-lg`; `maxWidth` is the old inline max-width on `.mb`.
 */
export default function Modal({ id, title, open: openProp, onClose, dismissible = true, wide = false, maxWidth, className, children }) {
  const m = useModal(id ?? '');
  const open = openProp ?? m.open;
  const close = onClose ?? m.hide;

  return (
    <div
      className={'mo' + (open ? ' open' : '')}
      id={id}
      onClick={(e) => { if (dismissible && e.target === e.currentTarget) close(); }}
    >
      <div
        className={'mb' + (wide ? ' mb-lg' : '') + (className ? ' ' + className : '')}
        style={maxWidth ? { maxWidth } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
      >
        {title != null && (
          <div className="mh">
            <div className="mti">{title}</div>
            <button type="button" className="mx" onClick={close} aria-label="Close">✕</button>
          </div>
        )}
        {open && children}
      </div>
    </div>
  );
}
