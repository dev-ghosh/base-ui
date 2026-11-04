/* vocab.js — the status vocabulary, and nothing else.
 *
 * Extracted from db.js so that pure logic (js/queue.js) can import it without
 * dragging in config.js, which reads `document` at module scope and therefore
 * cannot be imported by a Node test. A five-entry constant map should not be
 * the thing that makes the work queue untestable outside a browser.
 *
 * db.js re-exports both maps, so every existing import keeps working.
 */

/** Raw v3 status (what `entities.status` holds) to the label the UI shows. */
export const V3_TO_DISPLAY = {
  pending: 'Pending', in_progress: 'In Progress', on_hold: 'On Hold',
  completed: 'Completed', dropped: 'Dropped', blocked: 'On Hold',
  review: 'In Progress', superseded: 'Dropped', archived: 'Dropped',
};

/** The inverse, for writes. Note it is not a perfect inverse: several v3
 *  statuses collapse onto one label above, and this maps back to the canonical
 *  one. */
export const DISPLAY_TO_V3 = {
  'Pending': 'pending', 'In Progress': 'in_progress', 'On Hold': 'on_hold',
  'Completed': 'completed', 'Dropped': 'dropped',
};

/** The three statuses that mean "still on someone's plate". Matches the
 *  WHERE clause of v_task_queue; changing one without the other silently
 *  desynchronises Today from the database. */
export const OPEN_STATUSES = ['pending', 'in_progress', 'on_hold'];
