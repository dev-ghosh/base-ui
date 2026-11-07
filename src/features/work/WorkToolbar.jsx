'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * The Work toolbar (`.tbar`) is one row: the scope pill, the surface switcher, and whatever the
 * routed surface adds (the Board's Filters button and filter row). The frame owns the row, the
 * surface owns its controls, so a surface renders them with <WorkToolbar> and they land in the same
 * flex row (`.tbar-legacy` is display:contents in the old CSS precisely so they do).
 *
 * Rendered without a frame (a surface mounted alone, as in a test) the controls get a `.tbar` of
 * their own.
 */
const SlotContext = createContext(null);

export function ToolbarSlotProvider({ children }) {
  const [el, setEl] = useState(null);
  const value = useMemo(() => ({ el, setEl }), [el]);
  return <SlotContext.Provider value={value}>{children}</SlotContext.Provider>;
}

/** Where a surface's controls go: the end of the frame's `.tbar`. */
export function ToolbarSlot() {
  const ctx = useContext(SlotContext);
  return <span ref={ctx ? ctx.setEl : undefined} style={{ display: 'contents' }} data-work-toolbar-slot="" />;
}

export function WorkToolbar({ children }) {
  const ctx = useContext(SlotContext);
  if (!ctx) return <div className="tbar">{children}</div>;
  return ctx.el ? createPortal(children, ctx.el) : null;
}
