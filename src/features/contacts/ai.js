/* ai.js — the three Claude edge functions Contacts can call, with the exact payloads the old app
 * sent (rie-dashboard2/js/contacts.js before commit ed67ca7 removed their buttons, and the functions'
 * own request types in supabase/functions/*).
 *
 *   nl-search         { query }                                  -> { contactIds: number[], explanation }
 *   enrich-contact    { contactId, name, org, linkedinUrl }      -> { bio, keyFacts[], suggestedCategory, suggestedNextStep }
 *   suggest-followup  { contactId }                              -> { suggestedNextStep, draftMessage, followUpDate, rationale }
 *
 * Pure: the payload builders take the contact; callEdgeFunction is passed in. Nothing in the current old
 * UI calls these (the "AI Actions" block of the contact viewer is empty), so nothing in the new UI does.
 */

export const NL_SEARCH_FN = 'nl-search';
export const ENRICH_FN = 'enrich-contact';
export const FOLLOWUP_FN = 'suggest-followup';

export const nlSearchPayload = (query) => ({ query });
export const enrichPayload = (c) => ({ contactId: c.id, name: c.name, org: c.org, linkedinUrl: c.linkedin });
export const followupPayload = (contactId) => ({ contactId });

/** The status-bar line after an NL search (nlSearch). */
export function nlSearchMessage(query, result) {
  const n = result?.contactIds?.length || 0;
  if (!n) return `No matches found: "${query}"`;
  const ids = new Set(result.contactIds);
  return `AI found ${ids.size} match${ids.size !== 1 ? 'es' : ''} · ${result.explanation || ''}`;
}
