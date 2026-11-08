'use client';

import { useEffect, useRef } from 'react';
import Modal from './Modal.jsx';
import { initialsOf, toneFor } from '../lib/ui-format.js';

/**
 * The small building blocks the newer pages share (Team, Expenses). JSX versions of the HTML
 * builders in rie-dashboard2/js/ui.js: badge(), avatar(), emptyCard(), field(), and the reusable
 * dialog (openDialog / closeDialog, element #mo-dyn).
 */

/** shadcn-style badge. tone: neutral | accent | success | warn | danger | info | outline */
export function Badge({ text, tone = 'neutral' }) {
  return <span className={`ui-badge ${tone}`}>{String(text ?? '')}</span>;
}

export function Avatar({ name, size = 36 }) {
  return (
    <span
      className="ui-av"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36), background: toneFor(name) }}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
}

/** An empty or error state card; `children` is the optional action (a button). */
export function EmptyCard({ title, text, children }) {
  return (
    <div className="empty-state">
      <div className="empty-ic">∅</div>
      <h2>{title}</h2>
      <p>{text}</p>
      {children}
    </div>
  );
}

/**
 * A labelled field (controlled). Give `options` ([value, label] pairs) for a select,
 * type="textarea" for a textarea, otherwise an input of `type`. `inputProps` are extra
 * attributes of the control (min, step, list, maxLength, ...).
 */
export function Field({ name, label, value, onChange, type = 'text', options = null, placeholder = '', required = false, hint = '', inputProps = {} }) {
  const id = `f-${name}`;
  const common = { id, name, className: 'ui-input', value: value ?? '', onChange: (e) => onChange(e.target.value), ...inputProps };
  let control;
  if (options) {
    control = (
      <select {...common}>
        {options.map(([v, l]) => <option key={String(v ?? '')} value={String(v ?? '')}>{l}</option>)}
      </select>
    );
  } else if (type === 'textarea') {
    control = <textarea {...common} rows={3} placeholder={placeholder} />;
  } else {
    control = <input {...common} type={type} placeholder={placeholder} required={required} />;
  }
  return (
    <div className="ui-field">
      <label htmlFor={id}>{label}{required ? <> <i>*</i></> : null}</label>
      {control}
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

/**
 * The one reusable dialog (#mo-dyn): title bar, scrolling body, footer buttons. `wide` is the
 * 640px box, otherwise 480px. The first field is focused when the dialog opens or its content
 * changes (`contentKey`), as openDialog() did.
 */
export function Dialog({ open, title, wide = false, onClose, footer = null, contentKey = '', children }) {
  return (
    <Modal id="mo-dyn" open={open} title={title} wide={wide} maxWidth={wide ? '640px' : '480px'} onClose={onClose}>
      <DialogBody key={contentKey}>{children}</DialogBody>
      {footer ? <div className="mf">{footer}</div> : null}
    </Modal>
  );
}

function DialogBody({ children }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.querySelector('input:not([type=hidden]),select,textarea')?.focus({ preventScroll: true });
  }, []);
  return <div className="dlg-body" ref={ref}>{children}</div>;
}
