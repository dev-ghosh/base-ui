'use client';

import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cellInk, statusColor, STATUSES } from './model.js';

/** Composition bar: only selected statuses get a segment; unselected ones are omitted, not zeroed. */
export function CompositionBar({ segments, theme }) {
  return (
    <div className="mx-bar" aria-hidden="true">
      {segments.map((seg) => (
        <i key={seg.status} style={{ flex: seg.n, background: statusColor(seg.status, theme) }} title={`${seg.status}: ${seg.n}`}></i>
      ))}
    </div>
  );
}

/**
 * Always renders a line so every cell in a row has identical height (spec 7.6).
 * Colour rule for the whole Work tab: red only where a task is P1, overdue AND mine; overdue
 * alone is amber (Matrix audit 2026-08-20, P1).
 */
function RiskLine({ data }) {
  const ink = cellInk();
  if (!data.od && !data.p1) return <div className="mx-risk">&nbsp;</div>;
  return (
    <div className="mx-risk">
      {data.od ? <span style={{ color: data.fire ? ink.crit : ink.warn }}>{data.od} od</span> : null}
      {data.p1 ? <span style={{ color: ink.risk }}>{data.p1} P1</span> : null}
    </div>
  );
}

// No heat fill (the old comment): the count, the risk line and the composition bar carry the volume.
function Cell({ model, company, func, theme, onDrill, onTip }) {
  const data = model.cellData(company, func);
  if (data.state === 'inactive') {
    return <td className="mx-cell inactive" title={`Not an active function for ${company}`}><span aria-hidden="true">&mdash;</span></td>;
  }
  if (data.state === 'zero') return <td className="mx-cell zero"><span>0</span></td>;
  const ink = cellInk();
  return (
    <td className="mx-cell">
      <button
        type="button"
        onClick={(e) => onDrill(company, func, 'cell', e.currentTarget)}
        aria-label={`${company}, ${func}: ${data.n} tasks, ${data.od} overdue, ${data.p1} P1`}
        onMouseMove={(e) => onTip({ x: e.clientX, y: e.clientY, company, func })}
        onMouseLeave={() => onTip(null)}
      >
        {data.review ? <span className="mx-revdot" title="Contains tasks needing review"></span> : null}
        <span className="mx-n" style={{ color: ink.ink }}>{data.n}</span>
        <RiskLine data={data} />
        <CompositionBar segments={data.composition} theme={theme} />
      </button>
    </td>
  );
}

// Totals carry no heat fill: they are on a different scale and shading them would imply a
// comparison that does not exist (spec 7.6).
function TotalCell({ data, company, func, theme, onDrill }) {
  if (data.state === 'zero') return <td className="mx-cell zero mx-total"><span>0</span></td>;
  const ink = cellInk();
  return (
    <td className="mx-cell mx-total">
      <button type="button" onClick={(e) => onDrill(company, func, 'cell', e.currentTarget)} aria-label={`Total ${data.n} tasks`}>
        <span className="mx-n" style={{ color: ink.ink }}>{data.n}</span>
        <RiskLine data={data} />
        <CompositionBar segments={data.composition} theme={theme} />
      </button>
    </td>
  );
}

/** The matrix itself: functions x companies, a total row and a total column. */
export default function MatrixGrid({ model, theme, onDrill, onTip, onReset }) {
  const { funcs, companies, grid } = model;
  return (
    <div className="mx-gridwrap">
      <table className="mx-grid">
        <thead>
          <tr>
            <th className="mx-corner" scope="col">Function</th>
            {companies.map((c) => (
              <th key={c} scope="col" className="mx-ch"><button type="button" onClick={(e) => onDrill(c, '', 'cell', e.currentTarget)}>{c}</button></th>
            ))}
            <th scope="col" className="mx-ch mx-total"><button type="button" onClick={(e) => onDrill('', '', 'cell', e.currentTarget)}>All</button></th>
          </tr>
        </thead>
        <tbody>
          {funcs.map((fr) => (
            <tr key={fr.func}>
              <th scope="row" className="mx-rh">
                <button type="button" onClick={(e) => onDrill('', fr.func, 'cell', e.currentTarget)}>
                  <span className="mx-rh-n">{fr.func}</span>
                  <span className="mx-rh-d" title={fr.definition}>{fr.definition}</span>
                </button>
              </th>
              {companies.map((c) => <Cell key={c} model={model} company={c} func={fr.func} theme={theme} onDrill={onDrill} onTip={onTip} />)}
              <TotalCell data={grid.rowTotal(fr.func)} company="" func={fr.func} theme={theme} onDrill={onDrill} />
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="mx-rh mx-total">
              <button type="button" onClick={(e) => onDrill('', '', 'cell', e.currentTarget)}><span className="mx-rh-n">All functions</span></button>
            </th>
            {companies.map((c) => <TotalCell key={c} data={grid.colTotal(c)} company={c} func="" theme={theme} onDrill={onDrill} />)}
            <TotalCell data={grid.grand()} company="" func="" theme={theme} onDrill={onDrill} />
          </tr>
        </tfoot>
      </table>
      <EmptyNote model={model} onReset={onReset} />
    </div>
  );
}

// The empty grid is itself informative, so it is never hidden (spec 7.10). But an all-zero grid
// has two very different causes; name which one it is.
function EmptyNote({ model, onReset }) {
  if (model.emptyKind === 'nomatch') {
    return <div className="mx-empty">No tasks match these filters. <a href="#" onClick={(e) => { e.preventDefault(); onReset(); }}>Reset</a></div>;
  }
  if (model.emptyKind === 'untagged') {
    const n = model.rows.length;
    return (
      <div className="mx-empty">
        {n} {n === 1 ? 'task matches' : 'tasks match'} these filters, but none carry a company and function yet, so no cell can hold them. Open the <strong>Untagged</strong> tile above to classify them.
      </div>
    );
  }
  return null;
}

/**
 * The hover tooltip (spec 7.6, #mx-tip): the status split and overdue count for a cell, kept
 * inside the window. Always mounted (hidden) so it can be positioned from its own size.
 */
export function Tip({ tip, model, theme }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !tip) return;
    const pad = 14, w = el.offsetWidth, h = el.offsetHeight;
    let x = tip.x + pad, y = tip.y + pad;
    if (x + w > window.innerWidth - 8) x = tip.x - w - pad;
    if (y + h > window.innerHeight - 8) y = tip.y - h - pad;
    el.style.left = Math.max(8, x) + 'px';
    el.style.top = Math.max(8, y) + 'px';
  });
  if (typeof document === 'undefined') return null;

  const tasks = tip ? model.at(tip.company, tip.func) : [];
  const overdue = tasks.filter(model.isOverdue);
  return createPortal(
    <div id="mx-tip" ref={ref} style={{ display: tip ? 'block' : 'none' }}>
      {tip ? (
        <>
          <div className="mx-tip-t">{tip.company} &middot; {tip.func}</div>
          {STATUSES.filter((s) => model.statuses.has(s)).map((s) => (
            <div key={s}><i style={{ background: statusColor(s, theme) }}></i>{s}<b>{tasks.filter((t) => t.status === s).length}</b></div>
          ))}
          <hr />
          <div className="od">Overdue<b>{overdue.length}</b></div>
        </>
      ) : null}
    </div>,
    document.body,
  );
}
