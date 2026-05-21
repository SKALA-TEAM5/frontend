import { apiFetch } from './api-client';
import type { BackendRoleCode, BackendUserProfile } from './auth-api';
import { PROJECT_STATUS_CODE, normalizeProjectStatus, type ActionRequestStatusCode, type NewProjectInput, type ProjectStatus, type ProjectStatusCode, type ProjectSummary } from './project-data';

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
  latestUsageStatementStatusCode: string | null;
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

export interface ProjectActionRequest {
  id: number;
  projectId: number;
  usageStatementId: number | null;
  usageStatementItemId: number | null;
  requestedByUserId: number;
  assigneeUserId: number | null;
  title: string;
  reason: string | null;
  statusCode: ActionRequestStatusCode | string;
  dueDate: string | null;
  createdAt: string | null;
}

export interface CreateActionRequestInput {
  title: string;
  reason?: string;
  assigneeUserId: number;
  usageStatementId?: number;
  usageStatementItemId?: number;
  dueDate?: string;
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

export interface UpdateProjectInput {
  contractNumber?: string;
  constructionName?: string;
  constructionCompany?: string;
  representative?: string;
  client?: string;
  constructionAmount?: string;
  appropriatedAmount?: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  projectStatusCode?: ProjectStatusCode;
}

const statusToUiStatus = (status: ProjectStatusCode, _hasActionRequest = false, _latestUsageStatementStatusCode?: string | null): ProjectStatus => normalizeProjectStatus(status);

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

const emptyProjectBase = (id: number, name: string, status: ProjectStatusCode, hasActionRequest = false, latestUsageStatementStatusCode?: string | null): ProjectSummary => ({
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
  status: statusToUiStatus(status, hasActionRequest, latestUsageStatementStatusCode),
  hasUploads: false,
  hasActionRequest,
  uncheckedMatchedFileCount: 0,
  reportReady: status === PROJECT_STATUS_CODE.COMPLETED || hasActionRequest,
  recentActivity: '',
  participants: [],
});

export const projectCardToSummary = (project: ProjectCardResponse): ProjectSummary => ({
  ...emptyProjectBase(project.id, project.projectName, project.status, project.hasActionRequest, project.latestUsageStatementStatusCode),
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
      status: PROJECT_STATUS_CODE.ACTIVE,
    },
  });
  return projectDetailToSummary(response.data.project);
};

export const updateProject = async (projectId: string, input: UpdateProjectInput) => {
  const response = await apiFetch<ProjectDetailDataResponse>(`/projects/${projectId}`, {
    method: 'PATCH',
    body: {
      contractNo: input.contractNumber,
      constructionCompany: input.constructionCompany,
      projectName: input.constructionName,
      siteLocation: input.location,
      representativeName: input.representative,
      contractAmount: input.constructionAmount == null ? undefined : Number(input.constructionAmount),
      constructionStartDate: input.startDate,
      constructionEndDate: input.endDate,
      clientName: input.client,
      appropriatedAmount: input.appropriatedAmount == null ? undefined : Number(input.appropriatedAmount),
      status: input.projectStatusCode,
    },
  });
  return projectDetailToSummary(response.data.project);
};

export const deleteProject = async (projectId: string) => {
  await apiFetch<null>(`/projects/${projectId}`, {
    method: 'DELETE',
  });
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

export const listActionRequests = async (projectId: string) => {
  const response = await apiFetch<ProjectActionRequest[]>(`/projects/${projectId}/action-requests`);
  return response.data || [];
};

export const createActionRequest = async (projectId: string, input: CreateActionRequestInput) => {
  const response = await apiFetch<ProjectActionRequest>(`/projects/${projectId}/action-requests`, {
    method: 'POST',
    body: {
      title: input.title,
      reason: input.reason,
      assigneeUserId: input.assigneeUserId,
      usageStatementId: input.usageStatementId,
      usageStatementItemId: input.usageStatementItemId,
      dueDate: input.dueDate,
    },
  });
  return response.data;
};

export const updateActionRequestStatus = async (projectId: string, actionRequestId: number, statusCode: ActionRequestStatusCode) => {
  const response = await apiFetch<ProjectActionRequest>(`/projects/${projectId}/action-requests/${actionRequestId}/status`, {
    method: 'PATCH',
    body: { statusCode },
  });
  return response.data;
};
