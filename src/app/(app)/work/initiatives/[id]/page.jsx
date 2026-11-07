import { InitiativeViewPage } from '@/features/work/initiatives/InitiativeViewRoute.jsx';

// Direct visit (a shared link or a refresh): the viewer inside the page frame. A soft
// navigation from any screen is intercepted by @modal/(.)work/initiatives/[id] instead.
export default function Page() {
  return <InitiativeViewPage />;
}
