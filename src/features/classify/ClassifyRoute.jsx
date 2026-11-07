'use client';

import { useRouter } from 'next/navigation';
import TodayPage from '../today/TodayPage.jsx';
import ClassifyOverlay from './ClassifyOverlay.jsx';

/** /today/classify intercepted into the @modal slot, over /today: closing goes back. */
export function ClassifyModalRoute() {
  const router = useRouter();
  return <ClassifyOverlay onClose={() => router.back()} />;
}

/** /today/classify on a direct visit: Today underneath, the overlay over it, closing lands on /today. */
export function ClassifyPageRoute() {
  const router = useRouter();
  return (
    <>
      <TodayPage />
      <ClassifyOverlay onClose={() => router.replace('/today')} />
    </>
  );
}
