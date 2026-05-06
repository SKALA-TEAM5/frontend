import { apiFetch } from './api-client';
import type { DevUserRole } from './dev-user';

export type BackendRoleCode = 'system_admin' | 'admin' | 'user' | 'agent';

export interface BackendUserProfile {
  id: number;
  employeeNo: string;
  realName: string;
  roleCode: BackendRoleCode;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  user: BackendUserProfile;
}

export const toAppRole = (roleCode: BackendRoleCode): DevUserRole => {
  if (roleCode === 'user') return 'project_manager';
  return 'she_manager';
};

export const toBackendRoleCode = (role: DevUserRole): BackendRoleCode => {
  if (role === 'project_manager') return 'user';
  return 'admin';
};

export const login = async (employeeNo: string, password: string) => {
  const response = await apiFetch<AuthResponse>('/auth/login', {
    method: 'POST',
    skipAuthRefresh: true,
    body: {
      employeeNo,
      password,
    },
  });
  return response.data;
};

export const signup = async (employeeNo: string, realName: string, password: string, role: DevUserRole) => {
  const response = await apiFetch<AuthResponse>('/auth/signup', {
    method: 'POST',
    skipAuthRefresh: true,
    body: {
      employeeNo,
      realName,
      password,
      roleCode: toBackendRoleCode(role),
    },
  });
  return response.data;
};

export const getMe = async () => {
  const response = await apiFetch<AuthResponse>('/users/me');
  return response.data;
};

export const logout = async () => {
  await apiFetch<null>('/auth/logout', {
    method: 'POST',
    skipAuthRefresh: true,
  });
};
