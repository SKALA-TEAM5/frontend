'use client';

import { useEffect, useState } from 'react';
import type { AppUser, UserRole } from './permissions';

const DEV_USER_STORAGE_KEY = 'sananbee.dev.role';
const APP_USER_STORAGE_KEY = 'sananbee.current.user';

export const DEV_USERS: Record<Extract<UserRole, 'project_manager' | 'she_manager'>, AppUser> = {
  project_manager: {
    id: '',
    name: '',
    role: 'project_manager',
  },
  she_manager: {
    id: '',
    name: '',
    role: 'she_manager',
  },
};

export type DevUserRole = keyof typeof DEV_USERS;

const isDevUserRole = (value: string | null): value is DevUserRole =>
  value === 'project_manager' || value === 'she_manager';

const isAppUser = (value: unknown): value is AppUser => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AppUser>;
  return typeof candidate.id === 'string'
    && typeof candidate.name === 'string'
    && (candidate.role === 'project_manager' || candidate.role === 'she_manager');
};

const readStoredRole = (): DevUserRole => {
  if (typeof window === 'undefined') return 'she_manager';
  const storedRole = window.localStorage.getItem(DEV_USER_STORAGE_KEY);
  return isDevUserRole(storedRole) ? storedRole : 'she_manager';
};

const readStoredUser = (): AppUser => {
  if (typeof window === 'undefined') return DEV_USERS.she_manager;
  try {
    const storedUser = JSON.parse(window.localStorage.getItem(APP_USER_STORAGE_KEY) || 'null');
    if (isAppUser(storedUser)) return storedUser;
  } catch {
    window.localStorage.removeItem(APP_USER_STORAGE_KEY);
  }
  return DEV_USERS[readStoredRole()];
};

export const useCurrentUser = () => {
  const [role, setRole] = useState<DevUserRole>('she_manager');
  const [user, setUser] = useState<AppUser>(DEV_USERS.she_manager);

  useEffect(() => {
    const storedUser = readStoredUser();
    setRole(storedUser.role);
    setUser(storedUser);
  }, []);

  const setCurrentUser = (nextUser: AppUser) => {
    window.localStorage.setItem(DEV_USER_STORAGE_KEY, nextUser.role);
    window.localStorage.setItem(APP_USER_STORAGE_KEY, JSON.stringify(nextUser));
    setRole(nextUser.role);
    setUser(nextUser);
  };

  const setCurrentRole = (nextRole: DevUserRole, nextUser?: Partial<Pick<AppUser, 'id' | 'name'>>) => {
    setCurrentUser({
      ...DEV_USERS[nextRole],
      ...nextUser,
      role: nextRole,
    });
  };

  const clearCurrentUser = () => {
    window.localStorage.removeItem(DEV_USER_STORAGE_KEY);
    window.localStorage.removeItem(APP_USER_STORAGE_KEY);
    setRole('she_manager');
    setUser(DEV_USERS.she_manager);
  };

  return {
    user,
    role,
    setCurrentRole,
    setCurrentUser,
    clearCurrentUser,
  };
};
