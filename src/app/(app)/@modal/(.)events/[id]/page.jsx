import { EventViewModal } from '@/features/events/EventViewRoute.jsx';

// The event viewer (mo-edet) over whatever page opened it; the real URL is /events/<id>.
export default function Page() {
  return <EventViewModal />;
}
