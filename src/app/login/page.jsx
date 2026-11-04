import { Suspense } from 'react';
import LoginForm from '@/features/auth/LoginForm.jsx';

export const metadata = { title: 'Sign in · BASE' };

// LoginForm reads ?error= with useSearchParams, which needs a Suspense boundary
// so the rest of the page can still be prerendered.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
