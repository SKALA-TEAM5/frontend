'use client';

import { useEffect, useState } from 'react';
import type { AppUser, UserRole } from './permissions';

const DEV_USER_STORAGE_KEY = 'sananbee.dev.role';

export const DEV_USERS: Record<Extract<UserRole, 'project_manager' | 'she_manager'>, AppUser> = {
  project_manager: {
    id: 'user-kim',
    name: '김현장',
    role: 'project_manager',
  },
  she_manager: {
    id: 'user-hong',
    name: '홍길동',
    role: 'she_manager',
  },
};

export type DevUserRole = keyof typeof DEV_USERS;

const DEV_LOGIN_USERS: Record<string, { password: string; role: DevUserRole }> = {
  SHE001: { password: '1234', role: 'she_manager' },
  PM001: { password: '1234', role: 'project_manager' },
};

const isDevUserRole = (value: string | null): value is DevUserRole =>
  value === 'project_manager' || value === 'she_manager';

const readStoredRole = (): DevUserRole => {
  if (typeof window === 'undefined') return 'she_manager';
  const storedRole = window.localStorage.getItem(DEV_USER_STORAGE_KEY);
  return isDevUserRole(storedRole) ? storedRole : 'she_manager';
};

export const useCurrentUser = () => {
  const [role, setRole] = useState<DevUserRole>('she_manager');

  useEffect(() => {
    setRole(readStoredRole());
  }, []);

  const setCurrentRole = (nextRole: DevUserRole) => {
    window.localStorage.setItem(DEV_USER_STORAGE_KEY, nextRole);
    setRole(nextRole);
  };

  return {
    user: DEV_USERS[role],
    role,
    setCurrentRole,
  };
};

export const authenticateDevUser = (employeeNumber: string, password: string): DevUserRole | null => {
  const loginUser = DEV_LOGIN_USERS[employeeNumber.trim().toUpperCase()];
  if (!loginUser || loginUser.password !== password) return null;
  return loginUser.role;
};
