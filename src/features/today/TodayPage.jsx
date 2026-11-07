'use client';

import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '../../store/useStore.js';
import { useTaskActions } from '../tasks/hooks/useTaskActions.js';
import { personName } from '../../lib/mappers.js';
import {
  SHOW, decisionAge, decisionQuestion, decisionSubject, todayHref, weekShape,
} from '../../lib/today.js';
import QueueRow from './QueueRow.jsx';
import TeamSection from './TeamSection.jsx';
import { useQueue } from './hooks/useQueue.js';
import { useTodayKeys } from './hooks/useTodayKeys.js';

/** A titled group that does not exist at zero (the old section()). */
function Section({ title, count, action, children }) {
  if (!count) return null;
  return (
    <section className="td-sec">
      <div className="td-h"><h2>{title}</h2><span className="td-count">{count}</span>{action}</div>
      {children}
    </section>
  );
}

/**
 * Today: the queue that replaces the Home dashboard. It answers "what do I do now?" and
 * nothing else (port of renderToday in the old today.js). Groups, in order: Decide, Do now
 * (my overdue P1), Also overdue, Due next, Classify, then the collapsed Team section.
 * Five rows per group at most: "Triage N" is the way into the rest.
 */
export default function TodayPage() {
  const router = useRouter();
  const q = useQueue();
  useStore((s) => s.people);                    // owner names re-render with the people list
  const tasks = useStore((s) => s.tasks);
  const currentUser = useStore((s) => s.currentUser);
  const { markDone, pushWeek } = useTaskActions();
  const bodyRef = useRef(null);

  const goto = (kind, value) => router.push(todayHref(kind, value));
  const openTask = (id) => router.push(`/work/tasks/${id}`);
  const onRowKey = useTodayKeys({ containerRef: bodyRef, onOpen: openTask, onDone: markDone, onPushWeek: pushWeek });
  const row = (t, i) => (
    <QueueRow key={t.id} task={t} index={i} onOpen={openTask} onDone={markDone} onPushWeek={pushWeek} onKeyDown={onRowKey} />
  );

  /* Decide. The question IS the content. Newest first: the queue is oldest-first everywhere
   * else, which meant the three shown here were always the three most stale. */
  const decisions = [...q.decisions].sort((a, b) => String(b.raisedAt || '').localeCompare(String(a.raisedAt || '')));
  const rest = q.overdue.filter((t) => t.priority !== 'P1');
  const toClassify = q.toClassify.length;

  const nothingOfMine = !q.overdue.length && !q.dueSoon.length && !q.undated.length;
  const clearLine = (!q.overdue.length && !q.dueSoon.length && !q.decisions.length)
    ? (!q.me ? 'Your sign-in is not linked to a person yet. An admin can fix that under Account → Manage access.'
      : nothingOfMine ? 'Nothing is assigned to you yet. The team’s work is below, and everything else is under Work.'
      : `Nothing due and nothing overdue.${q.undated.length ? ` ${q.undated.length} of your tasks have no date.` : ''}`)
    : null;

  const shape = q.me ? weekShape(q, tasks) : null;

  return (
    <div className="tp active" id="tab-home">
      <div className="td-wrap" id="today-body" ref={bodyRef}>
        <div className="td-head">
          <h1>Today</h1>
          <span className="td-sub">
            {personName(q.me) || q.me || currentUser || ''} · {new Date().toLocaleDateString(undefined,
              { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
          {shape ? (
            <span className="td-shape">
              {shape.mineOpen} open · {shape.dueWeek} due this week{shape.closedToday ? <> · <b>{shape.closedToday} closed today</b></> : null}
            </span>
          ) : null}
        </div>

        {clearLine ? <p className="td-clear">{clearLine}</p> : null}

        <Section
          title="Decide"
          count={decisions.length}
          action={<button type="button" className="td-act" onClick={() => goto('decisions')}>Review all</button>}
        >
          {decisions.slice(0, 3).map((x) => (
            <button type="button" className="td-row td-decide" key={x.id} onClick={() => goto('decisions')}>
              <span className="td-title">{decisionQuestion(x)}</span>
              <span className="td-meta">{decisionSubject(x, tasks)}</span>
              <span className="td-due">{decisionAge(x)}</span>
            </button>
          ))}
        </Section>

        <Section title="Do now" count={q.p1Overdue.length}>
          {q.p1Overdue.slice(0, SHOW).map(row)}
        </Section>

        <Section
          title="Also overdue"
          count={rest.length}
          action={<button type="button" className="td-act td-act-pr" onClick={() => router.push('/today/triage')}>Triage {q.overdue.length}</button>}
        >
          {rest.slice(0, SHOW).map(row)}
        </Section>

        <Section title="Due next" count={q.dueSoon.length}>
          {q.dueSoon.slice(0, SHOW).map(row)}
        </Section>

        {/* Classify. A task with no function is invisible to the Matrix, and the only thing
            that ever clears the backlog is being asked. It disappears at zero. */}
        <Section
          title="Classify"
          count={toClassify}
          action={<button type="button" className="td-act td-act-pr" onClick={() => router.push('/today/classify')}>Classify {toClassify}</button>}
        >
          <p className="td-clear" style={{ margin: 0 }}>
            These tasks have no company or function, or were filed on thin evidence. Until they do, they are missing from the Matrix.
          </p>
        </Section>

        <TeamSection
          team={q.team}
          unowned={q.unowned}
          open={!(q.overdue.length && !nothingOfMine)}
          onOwner={(code) => goto('owner', personName(code) || code)}
          onUnowned={() => goto('unowned')}
        />
      </div>
    </div>
  );
}
