import { InitiativeViewModal } from '@/features/work/initiatives/InitiativeViewRoute.jsx';

// The initiative viewer (mo-entity-det) over whatever page opened it; the real URL is /work/initiatives/<id>.
export default function Page() {
  return <InitiativeViewModal />;
}
