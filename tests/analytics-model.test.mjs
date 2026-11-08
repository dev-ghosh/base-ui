// Analytics screen model: filters as search params, the remembered tab, delta line, chart scale, money.
// Expected values are worked out by hand from rie-dashboard2/js/analytics.js.
import {
  ANALYTICS_TAB_KEY, tabOrDefault, parseAnalyticsParams, serializeAnalyticsParams, mergeAnalyticsParams,
  isFiltered, periodLabel, money, pct, deltaInfo, chartScale,
} from '../src/features/analytics/model.js';

let bad = 0;
const check = (c, m) => { console.log((c ? '  ok  ' : '  FAIL') + '  ' + m); if (!c) bad++; };
const same = (a, b, m) => { const ok = JSON.stringify(a) === JSON.stringify(b); check(ok, m + (ok ? '' : '  got ' + JSON.stringify(a))); };

check(ANALYTICS_TAB_KEY === 'rie_an_tab', 'the old localStorage key');
same(['areas', 'people', 'pipeline', 'overview'].map(tabOrDefault), ['areas', 'people', 'pipeline', 'overview'], 'the four tabs are kept');
same([null, '', 'x', 'tasks'].map(tabOrDefault), ['overview', 'overview', 'overview', 'overview'], 'unknown tab values mean overview');

same(parseAnalyticsParams(''), { range: '30', company: 'ALL', person: 'ALL' }, 'defaults');
same(parseAnalyticsParams('range=ALL&company=Acme&person=Asha+Rao'), { range: 'ALL', company: 'Acme', person: 'Asha Rao' }, 'all three');
same(parseAnalyticsParams('range=5').range, '30', 'an unknown range is the default');
same(['7', '30', '90', 'ALL'].map((r) => parseAnalyticsParams('range=' + r).range), ['7', '30', '90', 'ALL'], 'the four ranges');
check(serializeAnalyticsParams({ range: '30', company: 'ALL', person: 'ALL' }) === '', 'defaults are not written');
check(serializeAnalyticsParams({ range: '7', company: 'No company', person: 'Ben Cole' }) === 'range=7&company=No+company&person=Ben+Cole', 'non-defaults are written');
check(mergeAnalyticsParams('x=1&range=7&person=A', { range: '30', company: 'B', person: 'ALL' }) === 'x=1&company=B', 'merge keeps other params, replaces ours');
check(isFiltered({ range: '30', company: 'ALL', person: 'ALL' }) === false && isFiltered({ range: '90', company: 'ALL', person: 'ALL' }) === true, 'isFiltered');
check(periodLabel('ALL') === 'all time' && periodLabel('7') === 'last 7 days', 'period label');

check(money(0) === '' && money(null) === '' && money(350000) === '₹3,50,000' && money('250000') === '₹2,50,000', 'money: empty for none, Indian grouping');
check(pct(1, 3) === 33 && pct(2, 3) === 67 && pct(5, 0) === 0, 'pct rounds, 0 for no total');

check(deltaInfo(5, null) === null, 'no previous period (ALL): no delta');
same(deltaInfo(3, 0), { cls: 'up', text: 'new vs previous period' }, 'from zero to something');
same(deltaInfo(0, 0), { cls: '', text: 'same as previous period' }, 'zero to zero');
same(deltaInfo(3, 1), { cls: 'up', text: '+200% vs previous period' }, 'up');
same(deltaInfo(1, 4), { cls: 'down', text: '-75% vs previous period' }, 'down');
same(deltaInfo(4, 4), { cls: '', text: 'same as previous period' }, 'same');
same(deltaInfo(1004, 1000), { cls: '', text: 'same as previous period' }, 'a change under 0.5% is "same"');

same(chartScale([{ created: 0, completed: 0 }]), { top: 4, ticks: [4, 3, 2, 1, 0] }, 'chart scale: at least 4');
same(chartScale([{ created: 5, completed: 9 }]), { top: 12, ticks: [12, 9, 6, 3, 0] }, 'chart scale: next multiple of 4');
same(chartScale([{ created: 2, completed: 1 }, { created: 4, completed: 0 }]), { top: 4, ticks: [4, 3, 2, 1, 0] }, 'chart scale: exactly 4');

process.exit(bad ? 1 : 0);
