'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { closeSidebarIfMobile, openSidebar } from '../../lib/sidebar.js';
import { STEPS, closeTour, nextTourStep, prevTourStep, tourStore } from './tour.js';

/** Where the card goes: beside the target, else under or over it, else centred. Old paintStep(). */
function cardPosition(rect, cw, ch, vw, vh) {
  let top;
  let left;
  if (rect) {
    left = rect.left + rect.width + 16;
    top = rect.top;
    if (left + cw > vw - 12) { left = Math.max(12, Math.min(rect.left, vw - cw - 12)); top = rect.bottom + 14; }
    if (top + ch > vh - 12) top = Math.max(12, rect.top - ch - 14);
  } else {
    left = (vw - cw) / 2;
    top = Math.max(12, (vh - ch) / 2);
  }
  return { left: Math.max(12, left), top: Math.max(12, top) };
}

function TourRoot({ step }) {
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  const cardRef = useRef(null);
  const [placed, setPlaced] = useState({ measured: false, rect: null });
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const cw = Math.min(340, (typeof window === 'undefined' ? 340 : window.innerWidth) - 24);

  // Keys: Esc leaves, the arrows (and Enter) walk.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') closeTour();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); nextTourStep(); }
      else if (e.key === 'ArrowLeft') prevTourStep();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // The menu is closed again when the tour ends (a drawer on a phone).
  useEffect(() => () => closeSidebarIfMobile(), []);

  // Sidebar items are only on screen when the menu is open; on a phone it has to be opened for the step
  // and closed again for the others. Then find the real control (and again when the window changes).
  useEffect(() => {
    setPlaced({ measured: false, rect: null });
    if (s.nav) openSidebar(); else closeSidebarIfMobile();
    const measure = () => {
      const el = s.target ? document.querySelector(s.target) : null;
      const r = el && el.offsetParent !== null ? el.getBoundingClientRect() : null;
      const ok = r && r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
      setPlaced({
        measured: true,
        rect: ok ? { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom } : null,
      });
    };
    // Wait for the sidebar's slide-in before measuring.
    const t = setTimeout(measure, s.nav ? 260 : 30);
    window.addEventListener('resize', measure);
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); };
  }, [step, s]);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    setPos(cardPosition(placed.rect, cw, card.offsetHeight, window.innerWidth, window.innerHeight));
    if (placed.measured) document.getElementById('tour-next')?.focus({ preventScroll: true });
  }, [placed, cw, step]);

  const pad = 6;
  const r = placed.rect;
  return (
    <div id="tour-root" role="dialog" aria-modal="true" aria-label="Guided tour">
      <div
        className={'tour-hole' + (r ? '' : ' none')} id="tour-hole"
        style={r ? { top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 } : undefined}
      />
      <div className="tour-card" id="tour-card" ref={cardRef} style={{ width: cw, left: pos.left, top: pos.top }}>
        <div className="tour-prog">
          <span>Step {step + 1} of {STEPS.length}</span>
          <div className="tour-bar"><i style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}></i></div>
        </div>
        <h3>{s.title}</h3>
        <p>{s.text}</p>
        {s.target && placed.measured && !r ? <p className="tour-miss">This control is hidden on this screen size or for your role.</p> : null}
        <div className="tour-actions">
          <button type="button" className="btn b-gh b-sm" onClick={closeTour}>{last ? 'Close' : 'Skip'}</button>
          <span className="sp"></span>
          {step > 0 ? <button type="button" className="btn b-ol b-sm" onClick={prevTourStep}>Back</button> : null}
          <button type="button" className="btn b-pr b-sm" id="tour-next" onClick={nextTourStep}>{last ? 'Done' : 'Next'}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * The guided tour (old #tour-root): a dimmed page with a hole around the real control and a card that
 * says what it is. An overlay (component state, no route); started by Help, Profile > Security and the
 * first-run offer. It only highlights: it changes nothing in the app.
 */
export default function TourOverlay() {
  const { open, step } = useSyncExternalStore(tourStore.subscribe, tourStore.getState, tourStore.getState);
  return open ? <TourRoot step={step} /> : null;
}
