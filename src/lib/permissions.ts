export type UserRole = 'project_manager' | 'she_manager' | 'system_admin';

export type Permission =
  | 'viewOwnProjects'
  | 'uploadEvidence'
  | 'runValidation'
  | 'reviewReport'
  | 'requestAction'
  | 'confirmFinalReport';

export interface AppUser {
  id: string;
  name: string;
  role: UserRole;
}

export interface ProjectAccessTarget {
  manager: string;
  assigneeUserIds?: number[];
  sheManager?: string;
  sheManagerUserIds?: number[];
}

const ROLE_LEVEL: Record<UserRole, number> = {
  project_manager: 0,
  she_manager: 1,
  system_admin: 2,
};

const PERMISSION_MIN_ROLE: Record<Permission, UserRole> = {
  viewOwnProjects: 'project_manager',
  uploadEvidence: 'project_manager',
  runValidation: 'she_manager',
  reviewReport: 'she_manager',
  requestAction: 'she_manager',
  confirmFinalReport: 'she_manager',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  project_manager: '프로젝트 담당자',
  she_manager: 'SHE 담당자',
  system_admin: '시스템 관리자',
};

export const hasRoleAtLeast = (role: UserRole, minimumRole: UserRole) => ROLE_LEVEL[role] >= ROLE_LEVEL[minimumRole];

export const can = (user: AppUser, permission: Permission) => hasRoleAtLeast(user.role, PERMISSION_MIN_ROLE[permission]);

export const canAccessProject = (user: AppUser, project: ProjectAccessTarget) => {
  if (user.role === 'system_admin') return true;

  const userId = Number(user.id);
  if (user.role === 'she_manager') {
    const sheManagerNames = (project.sheManager || '').split(',').map((manager) => manager.trim()).filter(Boolean);
    return sheManagerNames.includes(user.name)
      || (Number.isFinite(userId) && Boolean(project.sheManagerUserIds?.includes(userId)));
  }

  const projectManagerNames = project.manager.split(',').map((manager) => manager.trim()).filter(Boolean);
  return projectManagerNames.includes(user.name)
    || (Number.isFinite(userId) && Boolean(project.assigneeUserIds?.includes(userId)));
};
