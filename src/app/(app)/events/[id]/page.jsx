import { EventViewPage } from '@/features/events/EventViewRoute.jsx';

// Direct visit (a shared link or a refresh): the viewer inside the page frame. A soft navigation from any
// screen is intercepted by @modal/(.)events/[id] instead.
export default function Page() {
  return <EventViewPage />;
}
