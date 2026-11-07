// A small, hand-countable Matrix fixture shared by the node and the React tests: a registry,
// and nine tasks, with "today" pinned to 2026-11-10 so nothing depends on the clock.
// The expected numbers in the tests are worked out BY HAND from the old matrix.js rules
// (see the comments in matrix-model.test.mjs), never read back from the implementation.
export const NOW = new Date('2026-11-10T12:00:00Z');
export const TODAY = '2026-11-10';
export const ME = 'ME1';
export const OT = 'OT1';

export const REGISTRY = [
  { company: 'Acme', func: 'Ops',   active: true,  sort_order: 1, definition: 'Keep the lights on' },
  { company: 'Acme', func: 'Sales', active: true,  sort_order: 2, definition: 'Win business' },
  { company: 'Acme', func: 'Legal', active: false, sort_order: 3, definition: 'Contracts' },
  { company: 'Beta', func: 'Ops',   active: true,  sort_order: 1, definition: 'Keep the lights on' },
  { company: 'Beta', func: 'Sales', active: false, sort_order: 2, definition: 'Win business' },
  { company: 'Beta', func: 'Legal', active: true,  sort_order: 3, definition: 'Contracts' },
  // retired everywhere: not a column at all
  { company: 'Acme', func: 'Old',   active: false, sort_order: 9, definition: '' },
  { company: 'Beta', func: 'Old',   active: false, sort_order: 9, definition: '' },
];

const base = { tier: 'task', archivedAt: '', contactName: '', contactOrg: '', actionItem: '', keyInputs: '', funcReview: false, funcReviewNote: '', coOwnerCodes: [] };

export const TASKS = [
  { ...base, id: 'A1', task: 'Alpha one', company: 'Acme', func: 'Ops', status: 'Pending', priority: 'P1', nextFollowUp: '2026-11-01', ownerCode: ME, assignedTo: 'Me Myself' },
  { ...base, id: 'A2', task: 'Alpha two', company: 'Acme', func: 'Ops', status: 'In Progress', priority: 'P2', nextFollowUp: '2026-11-12', ownerCode: OT, coOwnerCodes: ['T3'], assignedTo: 'Olive Other, Pat Third', contactOrg: 'Zed Corp' },
  { ...base, id: 'A3', task: 'Alpha three', company: 'Acme', func: 'Ops', status: 'Completed', priority: 'P3', nextFollowUp: '2026-10-01', ownerCode: ME, assignedTo: 'Me Myself' },
  { ...base, id: 'A4', task: 'Alpha four', company: 'Acme', func: 'Sales', status: 'On Hold', priority: 'P1', nextFollowUp: '2026-11-02', ownerCode: OT, assignedTo: 'Olive Other' },
  { ...base, id: 'B1', task: 'Beta one', company: 'Beta', func: 'Ops', status: 'Pending', priority: 'P2', nextFollowUp: '', ownerCode: '', assignedTo: '' },
  { ...base, id: 'B2', task: 'Beta two', company: 'Beta', func: 'Legal', status: 'Pending', priority: 'P2', nextFollowUp: '2026-11-15', ownerCode: ME, assignedTo: 'Me Myself', funcReview: true, funcReviewNote: 'Thin evidence' },
  { ...base, id: 'U1', task: 'Unsorted one', company: 'Acme', func: '', status: 'Pending', priority: 'P2', nextFollowUp: '2026-11-05', ownerCode: OT, assignedTo: 'Olive Other' },
  { ...base, id: 'U2', task: 'Unsorted two', company: 'Beta', func: 'Sales', status: 'In Progress', priority: '', nextFollowUp: '', ownerCode: ME, assignedTo: 'Me Myself' },
  { ...base, id: 'D1', task: 'Dropped one', company: 'Acme', func: 'Sales', status: 'Dropped', priority: 'P2', nextFollowUp: '', ownerCode: OT, assignedTo: 'Olive Other' },
];
