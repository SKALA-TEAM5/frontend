export type UserRole = 'general' | 'project_manager' | 'she_manager';

export type Permission =
  | 'viewOwnProjects'
  | 'uploadEvidence'
  | 'viewProjectStatus'
  | 'runValidation'
  | 'requestReport'
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
  participants: string[];
}

const ROLE_LEVEL: Record<UserRole, number> = {
  general: 0,
  project_manager: 1,
  she_manager: 2,
};

const PERMISSION_MIN_ROLE: Record<Permission, UserRole> = {
  viewOwnProjects: 'general',
  uploadEvidence: 'general',
  viewProjectStatus: 'project_manager',
  runValidation: 'she_manager',
  requestReport: 'project_manager',
  reviewReport: 'she_manager',
  requestAction: 'she_manager',
  confirmFinalReport: 'she_manager',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  general: '일반 사용자',
  project_manager: '프로젝트 담당자',
  she_manager: 'SHE 담당자',
};

export const hasRoleAtLeast = (role: UserRole, minimumRole: UserRole) => ROLE_LEVEL[role] >= ROLE_LEVEL[minimumRole];

export const can = (user: AppUser, permission: Permission) => hasRoleAtLeast(user.role, PERMISSION_MIN_ROLE[permission]);

export const isProjectParticipant = (user: AppUser, project: ProjectAccessTarget) => project.participants.includes(user.name);

export const canAccessProject = (user: AppUser, project: ProjectAccessTarget) => {
  if (hasRoleAtLeast(user.role, 'she_manager')) return true;
  if (hasRoleAtLeast(user.role, 'project_manager')) return project.manager === user.name;
  return isProjectParticipant(user, project);
};
