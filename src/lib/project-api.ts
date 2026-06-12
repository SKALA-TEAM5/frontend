import { apiFetch } from './api-client';
import type { BackendRoleCode } from './auth-api';
import { PROJECT_STATUS_CODE, USAGE_WORKFLOW_STATUS, normalizeProjectStatus, type NewProjectInput, type ProjectStatus, type ProjectStatusCode, type ProjectSummary } from './project-data';

export interface ProjectAssignee {
  userId: number;
  employeeNo: string;
  realName: string;
  roleCode: BackendRoleCode | string;
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
  usageRate: number | string | null;
  status: ProjectStatusCode;
  needCheck?: boolean;
  hasActionRequest?: boolean;
  latestUsageStatementStatusCode: string | null;
  uncheckedMatchedFileCount?: number;
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
  createdAt: string;
  updatedAt: string;
}

interface ProjectAssigneeListResponse {
  projectId: number;
  assignees: ProjectAssignee[];
}

export interface ProjectAssigneeCandidate {
  userId: number;
  id: number;
  realName: string;
  roleCode: BackendRoleCode | string;
  employeeNo?: string;
}

interface AssigneeCandidatesResponse {
  candidates: Array<{
    userId: number;
    realName: string;
    roleCode: BackendRoleCode | string;
  }>;
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

const normalizeRoleCodeText = (roleCode?: string | null) => String(roleCode || '').trim().toLowerCase();
export const isProjectManagerRole = (roleCode?: string | null) => {
  const normalized = normalizeRoleCodeText(roleCode);
  return normalized === 'user' || normalized === 'project_manager' || normalized === 'project manager';
};
export const isSheManagerRole = (roleCode?: string | null) => {
  const normalized = normalizeRoleCodeText(roleCode);
  return normalized === 'admin' || normalized === 'she_manager' || normalized === 'she manager';
};

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
  latestUsageStatementStatusCode: latestUsageStatementStatusCode || null,
  hasUploads: Boolean(latestUsageStatementStatusCode),
  hasActionRequest,
  reportReady: status === PROJECT_STATUS_CODE.COMPLETED || hasActionRequest,
  recentActivity: '',
  participants: [],
  sheManager: '',
  sheManagers: [],
});

export const projectCardToSummary = (project: ProjectCardResponse): ProjectSummary => ({
  ...emptyProjectBase(
    project.id,
    project.projectName,
    project.status,
    Boolean(project.hasActionRequest) || project.latestUsageStatementStatusCode === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED,
    project.latestUsageStatementStatusCode,
  ),
  contractNumber: project.contractNo || '',
  manager: managerText(project.assigneeNames || []),
  period: formatPeriod(project.constructionStartDate, project.constructionEndDate),
  progressRate: progressText(project.latestCumulativeProgressRate),
  usageRate: progressText(project.usageRate),
  hasLegalReviewNeededMonth: Boolean(project.needCheck),
  participants: project.assigneeNames || [],
});

export const projectDetailToSummary = (project: ProjectDetailResponse): ProjectSummary => {
  const assignees = project.assignees || [];
  const projectManagerAssignees = assignees.filter((assignee) => isProjectManagerRole(assignee.roleCode));
  const sheManagerAssignees = assignees.filter((assignee) => isSheManagerRole(assignee.roleCode));
  const assigneeNames = projectManagerAssignees.map((assignee) => assignee.realName).filter(Boolean);
  const sheManagerNames = sheManagerAssignees.map((assignee) => assignee.realName).filter(Boolean);
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
    assigneeUserIds: projectManagerAssignees.map((assignee) => assignee.userId),
    sheManager: managerText(sheManagerNames),
    sheManagers: sheManagerNames,
    sheManagerUserIds: sheManagerAssignees.map((assignee) => assignee.userId),
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

export const listAssigneeCandidates = async (keyword?: string) => {
  const query = keyword?.trim() ? `?keyword=${encodeURIComponent(keyword.trim())}` : '';
  const response = await apiFetch<AssigneeCandidatesResponse>(`/projects/assignee-candidates${query}`);
  return (response.data.candidates || []).map((candidate): ProjectAssigneeCandidate => ({
    userId: candidate.userId,
    id: candidate.userId,
    realName: candidate.realName,
    roleCode: candidate.roleCode,
  }));
};

export const listProjectManagerCandidates = async () => {
  const candidates = await listAssigneeCandidates();
  return candidates.filter((candidate) => isProjectManagerRole(candidate.roleCode));
};

export const listSheManagerCandidates = async () => {
  const candidates = await listAssigneeCandidates();
  return candidates.filter((candidate) => isSheManagerRole(candidate.roleCode));
};
