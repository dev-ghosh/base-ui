'use client';

import { useRouter } from 'next/navigation';
import { fmtD } from '../../lib/format.js';

const COLUMNS = [
  ['Name', 'name', 180], ['Organisation', 'org', 160], ['Category', 'category', 120],
  ['Last Met', 'lastMtg', 120], ['Next Step', 'nextStep', 200],
];

/**
 * The contact table (`#ctbl-wrap`, renderContactTable): a select-all box, then five sortable columns
 * (the header click is `sortBy`; the arrow shows the live sort, nothing shows for the default priority
 * sort). Clicking a row opens the contact (/contacts/people/<id>); the checkbox cell does not.
 */
export default function ContactTable({ rows, sort, onSort, bulk, onScroll }) {
  const router = useRouter();
  const arrow = (col) => (sort.col === col ? (sort.dir === 1 ? '↑' : '↓') : '↕');
  return (
    <div className="ctbl-wrap" id="ctbl-wrap" onScroll={onScroll}>
      <table className="ctbl">
        <thead>
          <tr>
            <th style={{ width: 36 }}>
              <input
                type="checkbox" title="Select all on page" checked={bulk.allVisible}
                onChange={bulk.toggleAll} onClick={(e) => e.stopPropagation()}
              />
            </th>
            {COLUMNS.map(([label, col, w]) => (
              <th key={col} style={{ width: w }} className={sort.col === col ? 'sorted' : ''} onClick={() => onSort(col)}>
                {label} <span className="sort-arrow">{arrow(col)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody id="ctbody">
          {rows.length ? rows.map((c) => {
            const checked = bulk.isSelected(c.id);
            return (
              <tr key={c.id} className={'clickable' + (checked ? ' bulk-sel' : '')} onClick={() => router.push(`/contacts/people/${c.id}`)}>
                <td onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={checked} onChange={() => bulk.toggle(c.id)} />
                </td>
                <td style={{ fontWeight: 600 }}>{c.name || '—'}</td>
                <td style={{ color: 'var(--txm)' }}>{c.org || '—'}</td>
                <td style={{ color: 'var(--txm)' }}>{c.category || '—'}</td>
                <td style={{ color: 'var(--txm)' }}>{fmtD(c.lastMtg) || '—'}</td>
                <td style={{ color: 'var(--txm)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.nextStep || ''}>{c.nextStep || '—'}</td>
              </tr>
            );
          }) : (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--txd)', padding: 30 }}>No contacts match</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
