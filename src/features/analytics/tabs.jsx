'use client';

import { STALE_DAYS } from '../../lib/analytics.js';
import { Avatar, Badge, BarChart, Card, Delta, Kpi, Progress, TaskItem } from './blocks.jsx';
import { deltaInfo, money, pct } from './model.js';

/* The four tab bodies of the old analytics.js (overviewTab, peopleTab, areasTab, pipelineTab).
 * `d` is computeAnalytics(); `drill(key)` opens the tasks behind a number; `openTask(id)` opens the
 * task view; `go(path)` goes to another screen. */

const Empty = ({ children }) => <div className="shd-empty"><p>{children}</p></div>;
const Drill = ({ k, drill, ...kpi }) => <Kpi {...kpi} onOpen={() => drill(k)} title="Show these tasks" />;
/** The "vs previous period" line, or the period itself when there is no previous period. */
const deltaOr = (now, prev, fallback) => (deltaInfo(now, prev) ? <Delta now={now} prev={prev} /> : fallback);

export function OverviewTab({ d, periodLabel, drill, openTask }) {
  const mix = d.statusMix; const openN = d.open.length;
  const viewAll = (key, n) => <button type="button" className="shd-btn ghost" onClick={() => drill(key)}>View all {n}</button>;
  return (
    <>
      <div className="shd-kpis">
        <Drill drill={drill} k="open" label="Open now" value={openN} sub={`${d.p1.length} P1 · ${mix.inProgress} in progress`} icon="layers" />
        <Drill drill={drill} k="overdue" label="Overdue" value={d.overdue.length} sub={openN ? `${pct(d.overdue.length, openN)}% of open work` : 'nothing open'} icon="alert" tone={d.overdue.length ? 'warn' : ''} />
        <Drill drill={drill} k="week" label="Due this week" value={d.week.length} sub="next 7 days" icon="calendar" />
        <Drill drill={drill} k="done" label="Completed" value={d.done.length} sub={deltaOr(d.done.length, d.prevDone, periodLabel)} icon="check" tone="good" />
        <Drill drill={drill} k="created" label="New tasks" value={d.created.length} sub={deltaOr(d.created.length, d.prevCreated, periodLabel)} icon="plus" />
        <Drill drill={drill} k="stale" label="No movement" value={d.stale.length} sub={`open, untouched ${STALE_DAYS}+ days`} icon="pulse" tone={d.stale.length ? 'warn' : ''} />
      </div>

      <div className="shd-grid g-7-5">
        <Card title="Flow" desc="Created vs completed per week, last 8 weeks"><BarChart flow={d.flow} /></Card>
        <Card title="Needs attention" desc="Overdue, P1 first, then the longest late" action={d.attention.length > 6 ? viewAll('attention', d.attention.length) : null}>
          {d.attention.length
            ? <div className="shd-list">{d.attention.slice(0, 6).map((t) => <TaskItem key={t.id} task={t} onOpen={openTask} />)}</div>
            : <Empty>Nothing overdue.</Empty>}
        </Card>
      </div>

      <div className="shd-grid g-5-7">
        <Card title="Open work by status" desc={`${openN} open tasks`}>
          <div className="shd-stack">
            {[['In progress', mix.inProgress, 'info'], ['Pending', mix.pending, ''], ['On hold', mix.onHold, 'warn']].map(([l, v, tone]) => (
              <div className="shd-stack-r" key={l}>
                <span className="shd-stack-l">{l}</span><Progress value={pct(v, openN)} tone={tone} />
                <span className="shd-stack-v">{v}<small>{pct(v, openN)}%</small></span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Recently completed" desc={periodLabel} action={d.done.length > 6 ? viewAll('done', d.done.length) : null}>
          {d.done.length
            ? <div className="shd-list">{d.done.slice(0, 6).map((t) => <TaskItem key={t.id} task={t} onOpen={openTask} />)}</div>
            : <Empty>Nothing completed in this period yet.</Empty>}
        </Card>
      </div>
    </>
  );
}

const Zero = () => <span className="shd-muted">0</span>;

export function PeopleTab({ d, drill }) {
  if (!d.byPerson.length) return <Card title="People"><Empty>No assigned work in this view.</Empty></Card>;
  const max = Math.max(1, ...d.byPerson.map(([, s]) => s.open));
  return (
    <Card title="Who is carrying what" desc="Open work now; completed in the period. Click a row for their open tasks.">
      <div className="shd-table-wrap">
        <table className="shd-table">
          <thead>
            <tr><th>Person</th><th>Load</th><th className="r">Open</th><th className="r">In progress</th><th className="r">Overdue</th><th className="r">This week</th><th className="r">P1</th><th className="r">Done</th></tr>
          </thead>
          <tbody>
            {d.byPerson.map(([name, s]) => (
              <tr key={name} onClick={() => drill('person:' + name)} tabIndex={0}>
                <td><span className="shd-who"><Avatar name={name} /><span>{name}</span></span></td>
                <td className="shd-load"><Progress value={pct(s.open, max)} tone={s.overdue ? 'warn' : ''} /></td>
                <td className="r"><b>{s.open}</b></td><td className="r">{s.inProgress}</td>
                <td className="r">{s.overdue ? <Badge text={s.overdue} variant="warning" /> : <Zero />}</td>
                <td className="r">{s.week || <Zero />}</td>
                <td className="r">{s.p1 ? <Badge text={s.p1} variant="destructive" /> : <Zero />}</td>
                <td className="r">{s.done}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AreaRows({ rows, prefix, empty, drill }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  const max = Math.max(1, ...rows.map(([, s]) => s.open));
  return (
    <div className="shd-rows">
      {rows.map(([name, s]) => (
        <button type="button" className="shd-row" key={name} onClick={() => drill(prefix + name)}>
          <span className="shd-row-top">
            <span className="shd-row-n">{name}</span>
            <span className="shd-row-v">{s.overdue ? <Badge text={`${s.overdue} overdue`} variant="warning" /> : null}<b>{s.open}</b> open · {s.done} done</span>
          </span>
          <Progress value={pct(s.open, max)} tone={s.overdue ? 'warn' : ''} />
        </button>
      ))}
    </div>
  );
}

export function AreasTab({ d, drill }) {
  return (
    <div className="shd-grid g-6-6">
      <Card title="By company" desc="Open work and overdue; click for the tasks"><AreaRows rows={d.byCompany} prefix="company:" empty="No tasks in this view." drill={drill} /></Card>
      <Card title="By function" desc="Open work and overdue; click for the tasks"><AreaRows rows={d.byFunc} prefix="func:" empty="No tasks in this view." drill={drill} /></Card>
    </div>
  );
}

export function PipelineTab({ d, periodLabel, go }) {
  const value = d.leadOpen.reduce((a, l) => a + (Number(l.amount) || 0), 0);
  const maxN = Math.max(1, ...d.stages.map(([, s]) => s.n));
  return (
    <>
      <div className="shd-kpis four">
        <Kpi staticTile label="Open leads" value={d.leadOpen.length} sub={money(value) || 'no value recorded'} icon="funnel" />
        <Kpi staticTile tone="good" label="Won" value={d.won.length} sub={periodLabel} icon="check" />
        <Kpi staticTile label="Lost" value={d.lost.length} sub={periodLabel} icon="flag" />
        <Kpi label="Open escalations" value={d.escalations.length} sub="open the Escalations page" icon="arrowup" tone={d.escalations.length ? 'warn' : ''} onOpen={() => go('/escalations')} />
      </div>
      <Card
        title="Pipeline by stage" desc="Open leads and their value"
        action={<button type="button" className="shd-btn outline" onClick={() => go('/pipeline')}>Open Pipeline</button>}
      >
        {d.stages.length ? (
          <div className="shd-rows">
            {d.stages.map(([stage, s]) => (
              <div className="shd-row static" key={stage}>
                <span className="shd-row-top">
                  <span className="shd-row-n">{stage}</span>
                  <span className="shd-row-v"><b>{s.n}</b> lead{s.n === 1 ? '' : 's'}{s.value ? ' · ' + money(s.value) : ''}</span>
                </span>
                <Progress value={pct(s.n, maxN)} tone="info" />
              </div>
            ))}
          </div>
        ) : <Empty>No open leads.</Empty>}
      </Card>
    </>
  );
}
