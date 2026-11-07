import TaskViewPage from '@/features/tasks/TaskViewRoute.jsx';

// Direct visit (a shared link or a refresh): the viewer inside the page frame. A soft
// navigation from any screen is intercepted by @modal/(.)work/tasks/[id] instead.
export default function Page() {
  return <TaskViewPage />;
}
