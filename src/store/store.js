// Central app store. Replaces the old mutable `state` singleton (rie-dashboard2/js/state.js).
// No DOM/window access here: this module must stay importable in Node.
//
// UI-only keys of the old state (views, filters, sort, pagination, bulk selection,
// in-flight edit ids, drag state, form buffers) are NOT here: they are route
// segments, search params or component state in the Next.js app.

export function createStore(initial) {
  let state = initial;
  const listeners = new Set();

  return {
    getState: () => state,
    setState(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...next };
      for (const fn of [...listeners]) fn();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

export function createInitialState() {
  return {
    // v2 tables
    contacts: [],
    events: [],
    guests: [],

    // populated from entities WHERE tier='task' (rowToEntity mapper).
    // Writes go to the tasks table; trg_tasks_sync_entities mirrors to entities.
    tasks: [],

    // v3 hierarchy (populated in loadData alongside tasks)
    workstreams: [], // entities where tier='workstream'
    actions: [], // entities where tier='action'
    entityLinks: [], // [{parentId, childId}] from entity_links where link_type='contains'

    // Work scope: 'mine' | 'team' | 'everyone'. Resolved against the signed-in
    // person; null means "not chosen this session, read storage".
    workScope: null,

    // v3 entity model
    entities: [], // ALL tiers (initiative/workstream/task/action)
    fronts: [], // fronts enum
    people: [], // people enum (public.people): the owner vocabulary. Never hardcode it.
    // entity_id -> [person_code] for ACTIVE entity_owners rows other than the
    // primary owner. Built in loadData before tasks are mapped, read by rowToEntity.
    coOwners: new Map(),

    // v3 initiative/workstream views (populated in loadData)
    initiatives: [], // v_initiative_heartbeat rows
    candidates: [], // v_opening_move_candidates rows

    // v3 decision & cleanup queues
    decisions: [], // decision_queue WHERE status='pending'
    cleanups: [], // cleanup_queue WHERE status='pending'

    // leads tab data (pipeline of applications & ongoing conversations)
    leads: [],

    // current user (display name for created_by/updated_by)
    // From rie_my_access(): {email, display_name, role, can_write, is_admin}.
    // null until it resolves, which means "not known yet", never "denied".
    access: null,
    currentUser: null,
    session: null,
  };
}

export const store = createStore(createInitialState());
