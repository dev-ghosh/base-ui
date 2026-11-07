import { ContactViewPage } from '@/features/contacts/ContactViewRoute.jsx';

// Direct visit (a shared link or a refresh): the viewer inside the page frame. A soft navigation from any
// screen is intercepted by @modal/(.)contacts/people/[id] instead.
export default function Page() {
  return <ContactViewPage />;
}
