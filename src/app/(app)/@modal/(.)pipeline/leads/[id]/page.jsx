import { LeadViewModal } from '@/features/pipeline/LeadViewRoute.jsx';

// The lead viewer (mo-ldet) over whatever page opened it; the real URL is /pipeline/leads/<id>.
export default function Page() {
  return <LeadViewModal />;
}
