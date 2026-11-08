import { Suspense } from 'react';
import EventsScreen from '@/features/events/EventsScreen.jsx';

// The filters live in the URL (useSearchParams), which needs a Suspense boundary so the rest of the tree can
// still be prerendered. `.tp.active` is the old `#tab-events` page frame.
export default function Page() {
  return (
    <div className="tp active" id="tab-events">
      <Suspense fallback={null}>
        <EventsScreen />
      </Suspense>
    </div>
  );
}
