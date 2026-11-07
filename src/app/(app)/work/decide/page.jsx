import { redirect } from 'next/navigation';

// /work/decide is an index route: it redirects to the default sub-view (docs/route-inventory.md section 12.1).
export default function Page() {
  redirect('/work/decide/business');
}
