/* mappers.js — row <-> app-object mappers and the people helpers, ported from
 * rie-dashboard2/js/db.js. Pure: the only outside reads are the people list and
 * co-owner map (src/lib/people.js) and the signed-in user's display name
 * (store.currentUser, used for created_by/updated_by on writes). The REST
 * wrappers that also lived in db.js are not here.
 *
 * Relative imports with explicit .js extensions: plain Node must be able to
 * import this file in tests.
 */
import { store } from '../store/store.js';
import { getPeople, getCoOwners } from './people.js';

// v3 status normalisation helpers live in vocab.js; re-exported so existing
// call sites that took them from the data module keep working.
export { V3_TO_DISPLAY, DISPLAY_TO_V3, OPEN_STATUSES } from './vocab.js';
import { V3_TO_DISPLAY, DISPLAY_TO_V3 } from './vocab.js';

// The signed-in user's display name (the old state.currentUser).
const currentUser = () => store.getState().currentUser;

/* ── people: the owner vocabulary is DATA, never a constant here ────────────
 * Until 2026-09-11 this file carried a six-entry name<->code map. Anyone not in
 * it (every new colleague) was written as owner_code NULL, and a multi-person
 * assignment ("Akhilesh, Vrishabh") missed the map entirely and was saved
 * unowned. Both are the same bug the Matrix work removed for companies and
 * functions: vocabulary in source. The vocabulary is public.people, loaded into
 * state.people before any task row is mapped. */

export function personName(code) {
  if (!code) return '';
  const p = (getPeople() || []).find(x => x.code === code);
  return p ? (p.display_name || p.displayName || code) : code;
}

export function personCode(name) {
  const n = (name || '').trim().toLowerCase();
  if (!n) return '';
  const p = (getPeople() || []).find(x =>
    (x.display_name || x.displayName || '').toLowerCase() === n || (x.code || '').toLowerCase() === n);
  return p ? p.code : '';
}

/** Internal, unarchived people: what the assignee picker offers. */
export function internalPeople() {
  return (getPeople() || [])
    .filter(p => p.is_internal !== false && !p.archived_at)
    .slice()
    .sort((a, b) => (a.display_name || a.code).localeCompare(b.display_name || b.code));
}

/**
 * Names for an owner/assignee picker or filter: every onboarded person (from
 * public.people, so someone added in Manage access appears with no deploy),
 * plus any free-text name already on a record so old values stay selectable.
 * Until 2026-10-19 the Pipeline lists were a hardcoded three-name array.
 */
/**
 * Every person on a task, by display name: the owner first, then co-owners.
 * rowToEntity builds assignedTo as "Owner, Co-owner, …". A shared task belongs
 * to EACH of them; grouping on the whole string invented a combined
 * "Akhilesh Suthar, Rohit Kadian" person and took the task off Rohit's own
 * line (Team workload, Matrix pivot), 2026-10-19.
 */
export function assigneesOf(t) {
  return (t?.assignedTo || '').split(',').map(s => s.trim()).filter(Boolean);
}

export function peopleNames(extra = []) {
  const names = internalPeople().map(p => p.display_name || p.code);
  const seen = new Set(names.map(n => n.toLowerCase()));
  for (const x of extra) {
    const n = (x || '').trim();
    if (n && !seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); names.push(n); }
  }
  return names.sort((a, b) => a.localeCompare(b));
}

export function rowToHistory(r) {
  return {
    id:        r.id,
    contactId: r.contact_id,
    type:      r.type || 'note',
    notes:     r.notes || '',
    createdBy: r.created_by || '',
    createdAt: r.created_at || '',
  };
}

export function rowToLeadHistory(r) {
  return {
    id:        r.id,
    leadId:    r.lead_id,
    type:      r.type || 'note',
    notes:     r.notes || '',
    createdBy: r.created_by || '',
    createdAt: r.created_at || '',
  };
}

export function rowToLead(r) {
  return {
    id:             r.id,
    title:          r.title || '',
    type:           r.type || 'Other',
    stage:          r.stage || 'Identified',
    org:            r.org || '',
    contactId:      r.contact_id || null,
    contactName:    r.contact_name || '',
    amount:         r.amount != null ? Number(r.amount) : null,
    deadline:       r.deadline || '',
    nextStep:       r.next_step || '',
    nextFollowUp:   r.next_follow_up || '',
    notes:          r.notes || '',
    outcome:        r.outcome || '',
    assignedTo:     r.assigned_to || '',
    priority:       r.priority || '',
    sourceTaskId:   r.source_task_id || null,
    stageChangedAt: r.stage_changed_at || '',
    createdBy:      r.created_by || '',
    createdAt:      r.created_at || '',
    updatedBy:      r.updated_by || '',
    updatedAt:      r.updated_at || '',
  };
}

export function leadToRow(l, isNew) {
  const amount = l.amount === '' || l.amount == null ? null : Number(l.amount);
  const row = {
    title:          l.title || '',
    type:           l.type || 'Other',
    stage:          l.stage || 'Identified',
    org:            l.org || '',
    contact_id:     l.contactId || null,
    contact_name:   l.contactName || '',
    amount:         Number.isNaN(amount) ? null : amount,
    deadline:       l.deadline || null,
    next_step:      l.nextStep || '',
    next_follow_up: l.nextFollowUp || null,
    notes:          l.notes || '',
    outcome:        l.outcome || '',
    assigned_to:    l.assignedTo || '',
    priority:       l.priority || null,
    source_task_id: l.sourceTaskId || null,
    updated_by:     currentUser() || 'unknown',
    updated_at:     new Date().toISOString(),
  };
  if (l.stageChangedAt) row.stage_changed_at = l.stageChangedAt;
  if (isNew) row.created_by = currentUser() || 'unknown';
  ['deadline', 'next_follow_up'].forEach(k => { if (row[k] === '') row[k] = null; });
  return row;
}


// Maps an entities row (any tier) to the app's task-compatible object.
// R6: id is now the entity UUID. legacyTaskId preserved for cascade-delete of mirrored tasks rows.
export function rowToEntity(r) {
  const extra = r.extra || {};
  return {
    entityId:      r.id,
    id:            String(r.id),               // always string — matches HTML onclick string params
    legacyTaskId:  r.legacy_task_id,
    tier:          r.tier || 'task',

    // v2-compatible task shape
    task:          r.title || '',
    project:       extra.legacy_proj || r.front_code || '',
    category:      extra.legacy_cat || '',
    status:        V3_TO_DISPLAY[r.status] || 'Pending',
    contactName:   extra.legacy_contact_name || '',
    contactOrg:    extra.legacy_contact_org  || '',
    contactId:     extra.legacy_pk ? Number(extra.legacy_pk) : null,
    contactNames:  [],
    contactIds:    [],
    nextFollowUp:  r.next_follow_up   || '',
    lastMtg:       extra.legacy_last_mtg || '',
    startDate:     extra.legacy_start_date || '',
    endDate:       r.target_date       || '',
    actionItem:    extra.legacy_action_item  || '',
    keyInputs:     extra.legacy_key_inputs   || '',
    // Display names for the primary owner and every active co-owner, joined the
    // way the Board and the Matrix have always filtered on. Falls back to the
    // legacy free-text string only when there is no real owner at all.
    assignedTo:    [r.owner_code, ...(getCoOwners()?.get(r.id) || [])]
                     .filter(Boolean).map(personName).join(', ')
                   || extra.legacy_assigned_to || '',
    priority:      r.priority || '',
    createdBy:     r.created_by  || '',
    createdAt:     r.created_at  || '',
    updatedBy:     r.updated_by  || '',
    updatedAt:     r.updated_at  || '',
    snapshotAt:    '',
    tags:          extra.manual_tags || [],

    // v3 extras — available to new components
    frontCode:       r.front_code        || '',
    ownerCode:       r.owner_code        || '',
    coOwnerCodes:    (getCoOwners()?.get(r.id) || []).slice(),
    intent:          r.intent            || '',
    outcomeDefinition: r.outcome_definition || '',
    outcome:         r.outcome           || null,
    outcomeSummary:  r.outcome_summary   || '',
    canonicalTopic:  r.canonical_topic   || '',
    v3Status:        r.status            || 'pending',
    closedAt:        r.closed_at         || '',
    archivedAt:      r.archived_at       || '',
    version:         r.version           || 1,
    successCriteria: Array.isArray(r.success_criteria) ? r.success_criteria : [],
    recurrenceRule:  r.recurrence_rule   || extra.legacy_recurrence_rule || '',
    leadId:          r.lead_id           || null,

    // RIE v2 two-level filter model (see js/matrix.js). These MUST be mapped
    // here: the matrix reads state.tasks, which is built from rowToEntity.
    company:         r.company           || '',   // Level 1, canonical
    func:            r.func              || '',   // Level 2, from task_functions
    funcReview:      !!r.func_review,
    funcReviewNote:  r.func_review_note  || '',

    extra,
  };
}

// Maps an initiative heartbeat view row.
export function rowToHeartbeat(r) {
  return {
    id:             r.id,
    title:          r.title            || '',
    status:         r.status           || '',
    priority:       r.priority         || '',
    ownerCode:      r.owner_code       || '',
    frontCode:      r.front_code       || '',
    canonicalTopic: r.canonical_topic  || '',
    activeChildren: r.active_children  ?? 0,
    overdueChildren: r.overdue_children ?? 0,
    dueTodayChildren: r.due_today_children ?? 0,
    closedChildren: r.closed_children  ?? 0,
    lastChildActivity: r.last_child_activity || '',
    expectedWindowDays: r.expected_window_days ?? null,
    daysSinceActivity:  r.days_since_activity  != null ? Number(r.days_since_activity)  : null,
    progressScore:  r.progress_score  != null ? Number(r.progress_score)  : null,
    momentumScore:  r.momentum_score  != null ? Number(r.momentum_score)  : null,
    health:         r.health           || 'green',
    nextFollowUp:   r.target_date      || '',
  };
}

// Maps an opening-move candidates view row.
export function rowToCandidate(r) {
  return {
    entityId:       r.id,
    id:             r.id,
    title:          r.title            || '',
    tier:           r.tier             || 'task',
    status:         r.status           || '',
    priority:       r.priority         || '',
    ownerCode:      r.owner_code       || '',
    nextFollowUp:   r.next_follow_up   || '',
    canonicalTopic: r.canonical_topic  || '',
    daysOverdue:    r.days_overdue     ?? 0,
    score:          r.score            ?? 0,
  };
}

// Maps a decision_queue row.
export function rowToDecision(r) {
  return {
    id:               r.id,
    entityId:         r.entity_id,
    relatedEntityIds: r.related_entity_ids || [],
    signalCode:       r.signal_code       || '',
    question:         r.question          || '',
    recommendedAction: r.recommended_action || '',
    candidatePayload: r.candidate_payload || {},
    confidence:       r.confidence        ?? 0,
    status:           r.status            || 'pending',
    raisedAt:         r.raised_at         || '',
    expiresAt:        r.expires_at        || '',
  };
}

// Maps a cleanup_queue row.
export function rowToCleanup(r) {
  return {
    id:               r.id,
    entityAId:        r.entity_a_id,
    entityBId:        r.entity_b_id,
    similarityScore:  r.similarity_score  ?? 0,
    sharedKeywords:   r.shared_keywords   || [],
    sameFront:        r.same_front        || false,
    sameOwner:        r.same_owner        || false,
    sameContact:      r.same_contact      || false,
    recommendedAction: r.recommended_action || '',
    confidence:       r.confidence        || 'low',
    signalSource:     r.signal_source     || '',
    status:           r.status            || 'pending',
    raisedAt:         r.raised_at         || '',
  };
}

// Maps an entity_events audit row.
export function rowToEntityEvent(r) {
  return {
    id:        r.id,
    entityId:  r.entity_id,
    eventType: r.event_type || '',
    fieldName: r.field_name || '',
    oldValue:  r.old_value  || '',
    newValue:  r.new_value  || '',
    actor:     r.actor      || '',
    source:    r.source     || '',
    notes:     r.notes      || '',
    createdAt: r.created_at || '',
  };
}

// Maps an entity_lineage row.
export function rowToLineage(r) {
  return {
    id:                   r.id,
    sourceId:             r.source_id,
    derivedId:            r.derived_id,
    event:                r.event                  || '',
    sourceTierAtEvent:    r.source_tier_at_event   || '',
    derivedTierAtEvent:   r.derived_tier_at_event  || '',
    reason:               r.reason                 || '',
    createdAt:            r.created_at             || '',
    createdBy:            r.created_by             || '',
  };
}

export function rowToContact(r) {
  return {
    id: r.id,
    name:        r.n || '',
    org:         r.o || '',
    designation: r.d || '',
    category:    r.cat || '',
    priority:    r.abc || '',
    priorityFull: r.abc_full || '',
    location:    r.loc || '',
    email:       r.e || '',
    phone:       r.p || '',
    linkedin:    r.li || '',
    source:      r.src || '',
    poc2Email:   r.poc_e || '',
    poc2Phone:   r.poc_p || '',
    assignedTo:  r.at || '',
    project:     r.proj || '',
    intro:       r.intro || '',
    introDate:   r.intro_date || '',
    lastMtg:     r.last_mtg || '',
    lastAgenda:  r.last_agenda || '',
    nextFollowUp: r.next_follow_up || '',
    nextStep:    r.ns || '',
    keyInputs:   r.key_inputs || '',
    actionItem:  r.action_item || '',
    status:      r.cur_status || '',
    workStatus:  r.work_status || '',
    remarks:     r.rem || '',
    remarks2:    r.rem2 || '',
    birthday:    r.bday || '',
    interests:   r.int || '',
    score:       r.sc || 0,
    warmthMode:  r.wm || '',
    createdBy:   r.created_by || '',
    updatedBy:   r.updated_by || '',
    createdAt:   r.created_at || '',
    updatedAt:   r.updated_at || '',
    tags:        Array.isArray(r.tags) ? r.tags : [],
  };
}

export function rowToTask(r) {
  return {
    id:           r.id,
    task:         r.task || '',
    project:      r.proj || '',
    category:     r.cat || '',
    status:       r.status || 'Pending',
    contactName:  r.contact_name || '',
    contactOrg:   r.contact_org || '',
    contactId:    r.pk || null,
    contactNames: r.contact_names || [],
    contactIds:   r.contact_ids || [],
    nextFollowUp: r.next_follow_up || '',
    lastMtg:      r.last_mtg || '',
    startDate:    r.start_date || '',
    endDate:      r.end_date || '',
    actionItem:   r.action_item || '',
    keyInputs:    r.key_inputs || '',
    assignedTo:   r.assigned_to || '',
    priority:     r.priority || '',
    createdBy:    r.created_by || '',
    createdAt:    r.created_at || '',
    updatedBy:    r.updated_by || '',
    updatedAt:    r.updated_at || '',
    snapshotAt:      r.snapshot_at || '',
    recurrenceRule:  r.recurrence_rule || '',
    tags:            Array.isArray(r.tags) ? r.tags : [],
  };
}

export function rowToEvent(r) {
  return {
    id:          r.id,
    title:       r.title || '',
    type:        r.type || 'Other',
    date:        r.date || '',
    time:        r.time || '',
    venue:       r.venue || '',
    description: r.description || '',
    status:      r.status || 'Draft',
    createdBy:   r.created_by || '',
    createdAt:   r.created_at || '',
  };
}

export function rowToGuest(r) {
  return {
    id:             r.id,
    eventId:        r.event_id,
    contactId:      r.contact_id || null,
    name:           r.name || '',
    email:          r.email || '',
    phone:          r.phone || '',
    rsvp:           r.rsvp || 'Pending',
    plusOne:        r.plus_one || 0,
    inviteSentAt:   r.invite_sent_at || '',
    rsvpUpdatedAt:  r.rsvp_updated_at || '',
    notes:          r.notes || '',
  };
}


export function contactToRow(c, isNew) {
  const row = {
    n: c.name || '', o: c.org || '', d: c.designation || '', cat: c.category || '',
    abc: c.priority || '', abc_full: c.priorityFull || '', loc: c.location || '',
    e: c.email || '', p: c.phone || '', li: c.linkedin || '', src: c.source || '',
    poc_e: c.poc2Email || '', poc_p: c.poc2Phone || '',
    at: c.assignedTo || '', proj: c.project || '',
    intro: c.intro || '', intro_date: c.introDate || null,
    last_mtg: c.lastMtg || null, last_agenda: c.lastAgenda || '',
    next_follow_up: c.nextFollowUp || null,
    ns: c.nextStep || '', key_inputs: c.keyInputs || '',
    action_item: c.actionItem || '', cur_status: c.status || '',
    work_status: c.workStatus || '',
    rem: c.remarks || '', rem2: c.remarks2 || '',
    bday: c.birthday || '', int: c.interests || '',
    updated_by: currentUser() || 'unknown',
    tags: Array.isArray(c.tags) ? c.tags : [],
  };
  if (isNew) row.created_by = currentUser() || 'unknown';
  ['intro_date', 'last_mtg', 'next_follow_up'].forEach(k => { if (row[k] === '') row[k] = null; });
  return row;
}

// Maps the app's task/entity object to an entities table row for R6 direct writes.
export function entityToRow(t, isNew) {
  const row = {
    title:          t.task        || '',
    tier:           t.tier        || 'task',
    status:         DISPLAY_TO_V3[t.status] || t.v3Status || 'pending',
    front_code:     t.frontCode   || null,
    // A person CODE from public.people, chosen in the form. Co-owners go to
    // entity_owners (see syncCoOwners in tasks.js), never into this column.
    owner_code:     t.ownerCode || personCode((t.assignedTo || '').split(',')[0]) || null,
    priority:       t.priority    || null,
    next_follow_up: t.nextFollowUp || null,
    target_date:    t.endDate     || null,
    recurrence_rule: t.recurrenceRule || null,
    company:        t.company || null,
    func:           t.func    || null,
    updated_by:     currentUser() || 'unknown',
    updated_at:     new Date().toISOString(),
    extra: {
      legacy_proj:         t.project     || null,
      legacy_cat:          t.category    || null,
      legacy_contact_name: t.contactName || null,
      legacy_contact_org:  t.contactOrg  || null,
      legacy_pk:           t.contactId   ? String(t.contactId) : null,
      legacy_last_mtg:     t.lastMtg     || null,
      legacy_start_date:   t.startDate   || null,
      legacy_action_item:  t.actionItem  || null,
      legacy_key_inputs:   t.keyInputs   || null,
      legacy_assigned_to:  t.assignedTo  || null,
      manual_tags:         Array.isArray(t.tags) ? t.tags : [],
    },
  };
  if (isNew) row.created_by = currentUser() || 'unknown';
  ['next_follow_up', 'target_date'].forEach(k => { if (row[k] === '') row[k] = null; });
  return row;
}

export function taskToRow(t, isNew) {
  const row = {
    task: t.task || '', proj: t.project || '', cat: t.category || '',
    status: t.status || 'Pending',
    contact_name: t.contactName || '', contact_org: t.contactOrg || '',
    pk: t.contactId || null,
    contact_ids: t.contactIds || [],
    contact_names: t.contactNames || [],
    next_follow_up: t.nextFollowUp || null, last_mtg: t.lastMtg || null,
    start_date: t.startDate || null, end_date: t.endDate || null,
    action_item: t.actionItem || '', key_inputs: t.keyInputs || '',
    assigned_to: t.assignedTo || '',
    priority: t.priority || null,
    recurrence_rule: t.recurrenceRule || null,
    updated_by: currentUser() || 'unknown',
    tags: Array.isArray(t.tags) ? t.tags : [],
  };
  if (isNew) row.created_by = currentUser() || 'unknown';
  ['next_follow_up', 'last_mtg', 'start_date', 'end_date'].forEach(k => { if (row[k] === '') row[k] = null; });
  if (row.recurrence_rule === '') row.recurrence_rule = null;
  return row;
}
