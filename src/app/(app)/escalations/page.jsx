import { redirect } from 'next/navigation';

// /escalations is an index route: it redirects to the default sub-view (docs/route-inventory.md section 12.1).
// TODO(Task 13): choose /escalations/waiting when something waits on the user, else /escalations/open
// (the old default, decided after the data loads). Until then every visit lands on "All open".
export default function Page() {
  redirect('/escalations/open');
}
