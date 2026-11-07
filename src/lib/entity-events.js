// The entity_events audit trail. Port of writeEntityEvent in rie-dashboard2/js/db.js.
// Callers fire and forget (`.catch(() => {})`): the audit row must never fail the write it describes.
import { store } from '../store/store.js';
import { sbInsert } from './rest.js';

export async function writeEntityEvent(entityId, eventType, fields = {}) {
  const actor = store.getState().currentUser || 'RIE-Auto';
  return sbInsert('entity_events', {
    entity_id: entityId,
    event_type: eventType,
    actor,
    source: 'frontend',
    field_name: fields.fieldName || null,
    old_value: fields.oldValue !== undefined ? String(fields.oldValue) : null,
    new_value: fields.newValue !== undefined ? String(fields.newValue) : null,
    notes: fields.notes || null,
  });
}
