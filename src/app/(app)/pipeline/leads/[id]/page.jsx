import { LeadViewPage } from '@/features/pipeline/LeadViewRoute.jsx';

// Direct visit (a shared link or a refresh): the viewer inside the page frame. A soft navigation from any
// screen is intercepted by @modal/(.)pipeline/leads/[id] instead.
export default function Page() {
  return <LeadViewPage />;
}
