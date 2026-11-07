import { TaskViewModal } from '@/features/tasks/TaskViewRoute.jsx';

// The task viewer over whatever page opened it (the real URL is /work/tasks/<id>).
export default function Page() {
  return <TaskViewModal />;
}
