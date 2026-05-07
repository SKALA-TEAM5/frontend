import { apiFetch } from './api-client';
import type { BackendRoleCode, BackendUserProfile } from './auth-api';
import type { NewProjectInput, ProjectStatus, ProjectStatusCode, ProjectSummary } from './project-data';

export interface ProjectAssignee {
  userId: number;
  employeeNo: string;
  realName: string;
  roleCode: BackendRoleCode;
  assignedAt: string;
  assignedByUserId: number | null;
}

interface ProjectListResponse {
  page: number;
  size: number;
  totalCount: number;
  totalPages: number;
  items: ProjectCardResponse[];
}

interface ProjectCardResponse {
  id: number;
  projectName: string;
  assigneeNames: string[];
  assigneeCount: number;
  contractNo: string | null;
  constructionStartDate: string | null;
  constructionEndDate: string | null;
  latestCumulativeProgressRate: number | string | null;
  status: ProjectStatusCode;
  hasActionRequest: boolean;
  uncheckedMatchedFileCount: number;
}

interface ProjectDetailDataResponse {
  project: ProjectDetailResponse;
}

interface ProjectDetailResponse {
  id: number;
  contractNo: string | null;
  constructionCompany: string;
  projectName: string;
  siteLocation: string;
  representativeName: string | null;
  contractAmount: number | string;
  constructionStartDate: string;
  constructionEndDate: string;
  clientName: string | null;
  appropriatedAmount: number | string;
  status: ProjectStatusCode;
  assignees: ProjectAssignee[];
  uncheckedMatchedFileCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ProjectAssigneeListResponse {
  projectId: number;
  assignees: ProjectAssignee[];
}

interface UserListResponse {
  items: BackendUserProfile[];
}

interface ArchiveMarkCheckedResponse {
  projectId: number;
  checkedLinkCount: number;
}

export interface ProjectListParams {
  keyword?: string;
  projectName?: string;
  contractNo?: string;
  assigneeUserId?: number;
  status?: ProjectStatusCode;
  page?: number;
  size?: number;
}

const statusToUiStatus = (status: ProjectStatusCode, hasActionRequest = false): ProjectStatus => {
  if (hasActionRequest) return 'action_required';
  if (status === 'completed') return 'completed';
  if (status === 'suspended') return 'upload_pending';
  return 'under_review';
};

const formatDate = (value?: string | null) => value?.replace(/-/g, '/') || '';
const formatPeriod = (start?: string | null, end?: string | null) => {
  const startText = formatDate(start);
  const endText = formatDate(end);
  if (!startText && !endText) return '';
  return `${startText}${startText || endText ? '~' : ''}${endText}`;
};

const formatMoney = (value?: number | string | null) => {
  if (value == null || value === '') return '';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString('ko-KR') : String(value);
};

const progressText = (value?: number | string | null) => {
  if (value == null || value === '') return '0%';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${Math.round(numeric)}%` : `${value}%`;
};

const managerText = (names: string[]) => names.filter(Boolean).join(', ');

const emptyProjectBase = (id: number, name: string, status: ProjectStatusCode, hasActionRequest = false): ProjectSummary => ({
  id: String(id),
  contractNumber: '',
  name,
  constructionCompany: '',
  representative: '',
  client: '',
  constructionName: name,
  constructionAmount: '',
  manager: '',
  period: '',
  location: '',
  progressRate: '0%',
  settlementRound: '1차',
  plannedAmount: '',
  accumulatedAmount: '0',
  usageRate: '0%',
  projectStatusCode: status,
  status: statusToUiStatus(status, hasActionRequest),
  hasUploads: false,
  hasActionRequest,
  uncheckedMatchedFileCount: 0,
  reportReady: status === 'completed',
  recentActivity: '',
  participants: [],
});

export const projectCardToSummary = (project: ProjectCardResponse): ProjectSummary => ({
  ...emptyProjectBase(project.id, project.projectName, project.status, project.hasActionRequest),
  contractNumber: project.contractNo || '',
  manager: managerText(project.assigneeNames || []),
  period: formatPeriod(project.constructionStartDate, project.constructionEndDate),
  progressRate: progressText(project.latestCumulativeProgressRate),
  participants: project.assigneeNames || [],
  uncheckedMatchedFileCount: project.uncheckedMatchedFileCount || 0,
});

export const projectDetailToSummary = (project: ProjectDetailResponse): ProjectSummary => {
  const assignees = project.assignees || [];
  const assigneeNames = assignees.map((assignee) => assignee.realName).filter(Boolean);
  return {
    ...emptyProjectBase(project.id, project.projectName, project.status, false),
    contractNumber: project.contractNo || '',
    constructionCompany: project.constructionCompany || '',
    representative: project.representativeName || '',
    client: project.clientName || '',
    constructionAmount: formatMoney(project.contractAmount),
    manager: managerText(assigneeNames),
    period: formatPeriod(project.constructionStartDate, project.constructionEndDate),
    location: project.siteLocation || '',
    plannedAmount: formatMoney(project.appropriatedAmount),
    recentActivity: project.updatedAt ? `프로젝트 정보가 ${project.updatedAt.slice(0, 10)}에 갱신되었습니다.` : '',
    participants: assigneeNames,
    assigneeUserIds: assignees.map((assignee) => assignee.userId),
    uncheckedMatchedFileCount: project.uncheckedMatchedFileCount || 0,
  };
};

const buildQuery = (params: ProjectListParams = {}) => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === '') return;
    searchParams.set(key, String(value));
  });
  return searchParams.toString();
};

export const listProjects = async (params: ProjectListParams = {}) => {
  const query = buildQuery({ page: 1, size: 10, ...params });
  const response = await apiFetch<ProjectListResponse>(`/projects${query ? `?${query}` : ''}`);
  return response.data.items.map(projectCardToSummary);
};

export const getProject = async (projectId: string) => {
  const response = await apiFetch<ProjectDetailDataResponse>(`/projects/${projectId}`);
  return projectDetailToSummary(response.data.project);
};

export const createProject = async (input: NewProjectInput) => {
  const response = await apiFetch<ProjectDetailDataResponse>('/projects', {
    method: 'POST',
    body: {
      contractNo: input.contractNumber,
      constructionCompany: input.constructionCompany,
      projectName: input.constructionName,
      siteLocation: input.location,
      representativeName: input.representative,
      contractAmount: Number(input.constructionAmount),
      constructionStartDate: input.startDate,
      constructionEndDate: input.endDate,
      clientName: input.client,
      appropriatedAmount: Number(input.appropriatedAmount || input.constructionAmount),
      status: 'active',
    },
  });
  return projectDetailToSummary(response.data.project);
};

export const deleteProject = async (projectId: string) => {
  await apiFetch<null>(`/projects/${projectId}`, {
    method: 'DELETE',
  });
};

export const listProjectAssignees = async (projectId: string) => {
  const response = await apiFetch<ProjectAssigneeListResponse>(`/projects/${projectId}/assignees`);
  return response.data.assignees;
};

export const replaceProjectAssignees = async (projectId: string, assigneeUserIds: number[]) => {
  const response = await apiFetch<ProjectAssigneeListResponse>(`/projects/${projectId}/assignees`, {
    method: 'PUT',
    body: { assigneeUserIds },
  });
  return response.data.assignees;
};

export const listProjectManagerCandidates = async () => {
  const response = await apiFetch<UserListResponse>('/users?roleCode=user');
  return response.data.items;
};

export const markArchiveChecked = async (projectId: string) => {
  const response = await apiFetch<ArchiveMarkCheckedResponse>(`/projects/${projectId}/archive/mark-checked`, {
    method: 'POST',
  });
  return response.data;
};
