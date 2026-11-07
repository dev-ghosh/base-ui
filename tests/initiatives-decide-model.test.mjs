/**
 * Pure logic of the Initiatives and Decide surfaces. Run with: node tests/initiatives-decide-model.test.mjs
 */
import { idInScope, entityInScope, mineSet } from '../src/lib/scope.js';
import { ageWords, headline, partition, decideCounts, metaLine, WEEK } from '../src/lib/decide.js';
import { myShare, groupInitiatives, healthExplain, sortChildren, isClosed } from '../src/features/work/initiatives/model.js';

let bad = 0;
const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL') + '  ' + m); if (!c) bad++; };

const ME = 'ME1';
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const off = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

// ── scope ids ──
const tasks = [{ id: 't1', ownerCode: ME, coOwnerCodes: [] }, { id: 't2', ownerCode: 'OT1', coOwnerCodes: [] }];
const links = [{ parentId: 'w1', childId: 't1' }, { parentId: 'i1', childId: 'w1' }, { parentId: 'i2', childId: 't2' }];
const mine = mineSet(tasks, links, ME);
check(idInScope('t1', 'mine', mine) && idInScope('i1', 'mine', mine) && !idInScope('i2', 'mine', mine), 'mine = my tasks and the workstreams/initiatives holding them');
check(!idInScope('i1', 'team', mine) && idInScope('i2', 'team', mine), 'team = the rest');
check(idInScope(null, 'mine', mine) && idInScope('', 'team', mine) && idInScope('zzz', 'everyone', mine), 'a decision with no entity is in every scope; everyone sees all');
check(entityInScope({ id: 'i9', ownerCode: ME }, 'mine', ME, mine) && !entityInScope({ id: 'i9', ownerCode: ME }, 'team', ME, mine), 'an initiative I own is mine');
check(!entityInScope({ id: 'i9', ownerCode: '' }, 'mine', null, new Set()), 'no person code: nothing is mine (an empty owner is not "me")');

// ── decide helpers ──
check(['today', '3d', '2w', '3mo', '2y'].join() === [ageWords(0), ageWords(3), ageWords(14), ageWords(95), ageWords(800)].join(), 'ageWords');
check(headline({ question: 'SERVICE DOWN — check the queue' }) === 'check the queue', 'headline strips the shouted lead-in');
check(headline({ question: '', recommended_action: 'Do it', signal_code: 'X' }) === 'Do it', 'headline falls back to the recommended action');
check(metaLine({ company: 'Acme', func: 'Ops', entity_title: 'A long entity title that keeps going well past the limit' }).endsWith('…'), 'metaLine shortens a long entity title');
const rows = Array.from({ length: 8 }, (_, n) => ({ id: 'd' + n, kind: n < 7 ? 'business' : 'system', entity_id: n === 0 ? 't1' : n === 1 ? 't2' : null }));
const p = partition(rows, 'business', 'everyone', mine);
check(p.week.length === WEEK && p.later.length === 2 && p.list.length === 7, 'this week is the first five, the rest is Later');
check(JSON.stringify(decideCounts(rows, 'mine', mine)) === '{"business":6,"system":1}', 'counts follow the scope (a row about someone else\'s task drops out of Mine)');

// ── initiatives ──
const now = new Date();
const mk = (o) => ({ id: 'x', title: 'T', status: 'in_progress', ownerCode: '', health: 'green', activeChildren: 1, overdueChildren: 0, ...o });
const fireTasks = [{ id: 't1', ownerCode: ME, status: 'In Progress', priority: 'P1', nextFollowUp: off(-2) }, { id: 't3', ownerCode: ME, status: 'Pending', priority: 'P2', nextFollowUp: off(3) }, { id: 't4', ownerCode: ME, status: 'Completed', priority: 'P1', nextFollowUp: off(-9) }];
const fireLinks = [{ parentId: 'iA', childId: 'w1' }, { parentId: 'w1', childId: 't1' }, { parentId: 'iA', childId: 't3' }, { parentId: 'iA', childId: 't4' }];
const s = myShare({ id: 'iA' }, { tasks: fireTasks, links: fireLinks, me: ME, now });
check(s.mine === 2 && s.dueSoon === 2 && s.fire === true, 'myShare: live tasks only, two levels down, my overdue P1 is fire');
check(myShare({ id: 'iA' }, { tasks: fireTasks, links: fireLinks, me: null, now }).fire === false, 'myShare with no person is empty');
const noFire = myShare({ id: 'iA' }, { tasks: [{ ...fireTasks[0], priority: 'P2' }], links: fireLinks, me: ME, now });
check(noFire.mine === 1 && noFire.fire === false, 'overdue alone is not fire');

const g = groupInitiatives([
  mk({ id: 'a', health: 'red' }), mk({ id: 'b' }), mk({ id: 'c', activeChildren: 0 }), mk({ id: 'iA' }), mk({ id: 'd', status: 'completed' }),
  mk({ id: 'e', health: 'red', ownerCode: ME }),
], { tasks: fireTasks, links: fireLinks, me: ME, now });
const ids = (k) => g.groups.find((x) => x.key === k).items.map((x) => x.i.id).join();
check(ids('attention') === 'e,a,iA', 'needs attention: red or holding my fire, mine first');
check(ids('moving') === 'b' && ids('quiet') === 'c', 'moving vs quiet by active children');
check(g.open.length === 5 && g.shut.length === 1 && isClosed('dropped') && isClosed('archived') && !isClosed('on_hold'), 'closed are split out');
check(healthExplain({ progressScore: 0.5, momentumScore: 0.25, expectedWindowDays: 7, daysSinceActivity: 2 }) === 'progress 0.50 · momentum 0.25 · child due within a week — expect activity every 7d · last update 2.0d ago', 'healthExplain copy');
check(healthExplain({ expectedWindowDays: null }) === 'no active children — momentum N/A', 'healthExplain with no children');
check(sortChildren([{ id: 1, status: 'on_hold', priority: 'P1' }, { id: 2, status: 'pending', priority: 'P3' }, { id: 3, status: 'pending', priority: 'P1' }]).map((c) => c.id).join() === '3,2,1', 'children: on hold last, then by priority');

process.exit(bad ? 1 : 0);
