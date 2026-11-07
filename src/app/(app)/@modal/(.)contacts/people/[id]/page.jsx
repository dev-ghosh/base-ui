import { ContactViewModal } from '@/features/contacts/ContactViewRoute.jsx';

// The contact viewer (mo-det) over whatever page opened it; the real URL is /contacts/people/<id>.
export default function Page() {
  return <ContactViewModal />;
}
