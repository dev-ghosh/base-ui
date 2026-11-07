import { ClassifyPageRoute } from '@/features/classify/ClassifyRoute.jsx';

// Direct visit (or refresh) of /today/classify. A soft navigation from Today is intercepted by
// @modal/(.)today/classify instead.
export default function Page() {
  return <ClassifyPageRoute />;
}
