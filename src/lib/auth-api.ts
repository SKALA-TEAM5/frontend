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

interface UserListResponse {
  items: BackendUserProfile[];
}

export interface UserListParams {
  roleCode?: BackendRoleCode;
  keyword?: string;
}

export interface CreateUserInput {
  employeeNo: string;
  realName: string;
  password: string;
  roleCode: BackendRoleCode;
}

export interface UpdateUserInput {
  realName?: string;
  password?: string;
  roleCode?: BackendRoleCode;
}

export const toAppRole = (roleCode: BackendRoleCode): DevUserRole => {
  if (roleCode === 'system_admin') return 'system_admin';
  if (roleCode === 'user') return 'project_manager';
  return 'she_manager';
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

export const listUsers = async (params: UserListParams = {}) => {
  const searchParams = new URLSearchParams();
  if (params.roleCode) searchParams.set('roleCode', params.roleCode);
  if (params.keyword) searchParams.set('keyword', params.keyword);
  const response = await apiFetch<UserListResponse>(`/users${searchParams.size ? `?${searchParams}` : ''}`);
  return response.data.items || [];
};

export const createUser = async (input: CreateUserInput) => {
  const response = await apiFetch<AuthResponse>('/users', {
    method: 'POST',
    body: {
      employeeNo: input.employeeNo,
      realName: input.realName,
      password: input.password,
      roleCode: input.roleCode,
    },
  });
  return response.data.user;
};

export const getUser = async (userId: number) => {
  const response = await apiFetch<AuthResponse>(`/users/${userId}`);
  return response.data.user;
};

export const updateUser = async (userId: number, input: UpdateUserInput) => {
  const response = await apiFetch<AuthResponse>(`/users/${userId}`, {
    method: 'PATCH',
    body: {
      realName: input.realName,
      password: input.password,
      roleCode: input.roleCode,
    },
  });
  return response.data.user;
};

export const deleteUser = async (userId: number) => {
  await apiFetch<null>(`/users/${userId}`, {
    method: 'DELETE',
  });
};
