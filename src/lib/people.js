// Thin readers over the store. The owner vocabulary is DATA (public.people),
// never a constant. There is no setter: the data loader does
// `store.setState({ people, coOwners })`.
import { store } from '../store/store.js';

/** public.people rows, or [] until the loader has run. */
export function getPeople() {
  return store.getState().people;
}

/** entity_id -> [person_code] for ACTIVE entity_owners rows other than the primary owner. */
export function getCoOwners() {
  return store.getState().coOwners;
}
