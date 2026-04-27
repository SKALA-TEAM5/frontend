'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentUser } from '../lib/dev-user';

export default function Page() {
  const router = useRouter();
  const { user } = useCurrentUser();

  useEffect(() => {
    router.replace(user.role === 'project_manager' ? '/projects' : '/dashboard');
  }, [router, user.role]);

  return null;
}
