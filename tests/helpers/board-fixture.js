// Shared fixture for the Board / Hierarchy / bulk tests. "Today" is Tuesday 2026-11-10 (local noon),
// pinned with fake timers that only fake Date, so waitFor and the search debounce keep real timers.
import { makeTask, ME } from './fixtures.js';
import { DISPLAY_TO_V3 } from '@/lib/vocab.js';

export const NOW = new Date(2026, 10, 10, 12, 0, 0);
export const OT = 'OT1';
export { ME };

/** A task entity with a consistent v3Status; defaults to a Pending task of mine. */
export const T = (o = {}) => {
  const status = o.status || 'Pending';
  const other = o.owner === OT;
  const { owner: _owner, ...rest } = o;
  return makeTask({
    status,
    v3Status: DISPLAY_TO_V3[status],
    ownerCode: other ? OT : ME,
    assignedTo: other ? 'Olive Other' : 'Me Myself',
    ...rest,
  });
};

/**
 * Named tasks for the filter tests (all in scope under Everyone). The table in tests/board-model.test.mjs
 * is the same idea, hand-counted; here the cards are what is asserted.
 *   Alpha    Proj A  Ops    Olive Other           P1  due 1 Nov (late)    created 10 Nov  Pending      other, #12, contact "Zed Contact"
 *   Bravo    Proj B  Sales  Me Myself, Olive O.   P2  due 10 Nov (today)  created 9 Nov   In Progress  me + co-owner OT1
 *   Charlie  Proj A  Sales  (nobody)              --  due 12 Nov          created 2 Nov   Pending      unowned
 *   Delta    Proj B  Ops    Pat Third             P3  no date             created 15 Oct  Completed    closedAt 9 Nov
 *   Echo     --      --     Me Myself             P1  due 14 Nov          created 1 Jul   On Hold      me, stored tag "Priority"
 *   Foxtrot  --      --     Pat Third             P2  due 13 Nov          no created      Dropped      stored tag "Fox"
 */
export const NAMED = () => [
  T({ id: 'n1', task: 'Alpha', project: 'Proj A', category: 'Ops', priority: 'P1', nextFollowUp: '2026-11-01', createdAt: '2026-11-10T09:00:00', owner: OT, legacyTaskId: 12, contactName: 'Zed Contact' }),
  T({ id: 'n2', task: 'Bravo', project: 'Proj B', category: 'Sales', priority: 'P2', nextFollowUp: '2026-11-10', createdAt: '2026-11-09T08:00:00', status: 'In Progress', coOwnerCodes: [OT], assignedTo: 'Me Myself, Olive Other' }),
  T({ id: 'n3', task: 'Charlie', project: 'Proj A', category: 'Sales', priority: '', nextFollowUp: '2026-11-12', createdAt: '2026-11-02T10:00:00', ownerCode: '', assignedTo: '' }),
  T({ id: 'n4', task: 'Delta', project: 'Proj B', category: 'Ops', priority: 'P3', nextFollowUp: '', createdAt: '2026-10-15T10:00:00', status: 'Completed', closedAt: '2026-11-09T10:00:00', ownerCode: 'PT3', assignedTo: 'Pat Third' }),
  T({ id: 'n5', task: 'Echo', priority: 'P1', nextFollowUp: '2026-11-14', createdAt: '2026-07-01T10:00:00', status: 'On Hold', tags: ['Priority'] }),
  T({ id: 'n6', task: 'Foxtrot', priority: 'P2', nextFollowUp: '2026-11-13', createdAt: '', status: 'Dropped', tags: ['Fox'], ownerCode: 'PT3', assignedTo: 'Pat Third' }),
];
