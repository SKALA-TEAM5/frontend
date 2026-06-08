import { apiFetch } from './api-client';
import { PROJECT_STATUS_CODE, normalizeProjectStatus, type ProjectStatusCode, type ProjectSummary } from './project-data';

export interface AdminDashboardSummary {
  totalProjects: number;
  reviewNeededProjects: number;
}

export interface AdminDashboardAiUsageTotal {
  totalInputTokens: number;
  totalOutputTokens: number;
  callCount: number;
  totalCostUsd: number | string;
}

export interface AdminDashboardAiUsageByUser {
  userId: number;
  userName: string;
  roleCode: string;
  inputTokens: number;
  outputTokens: number;
  callCount: number;
  costUsd: number | string;
}

export interface AdminDashboardAiUsageByProject {
  projectId: number;
  projectName: string;
  type: string;
  inputTokens: number;
  outputTokens: number;
  callCount: number;
  costUsd: number | string;
}

export interface AdminDashboardAiUsage {
  total: AdminDashboardAiUsageTotal;
  byAgent: {
    agentTypeCode: string;
    inputTokens: number;
    outputTokens: number;
    callCount: number;
    costUsd: number | string;
  }[];
  topUsers: AdminDashboardAiUsageByUser[];
  topProjects: AdminDashboardAiUsageByProject[];
}

export interface AdminDashboardSupplementAssignee {
  userId: number;
  userName: string;
  supplementCount: number;
}

export interface AdminDashboardResponse {
  summary: AdminDashboardSummary;
  aiUsage: AdminDashboardAiUsage;
  supplementAssignees: AdminDashboardSupplementAssignee[];
}

export interface AdminDashboardProjectListItem {
  id: number;
  projectName: string;
  contractNo: string | null;
  statusCode: ProjectStatusCode;
  constructionStartDate: string | null;
  constructionEndDate: string | null;
  progressRate: number | string | null;
  usageRate: number | string | null;
  assignees: string | null;
}

export interface AdminDashboardProjectListResponse {
  totalCount: number;
  items: AdminDashboardProjectListItem[];
}

const formatDate = (value?: string | null) => value?.replace(/-/g, '/') || '';
const formatPeriod = (start?: string | null, end?: string | null) => {
  const startText = formatDate(start);
  const endText = formatDate(end);
  if (!startText && !endText) return '';
  return `${startText}${startText || endText ? '~' : ''}${endText}`;
};

const percentText = (value?: number | string | null) => {
  if (value == null || value === '') return '0%';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${Math.round(numeric)}%` : `${value}%`;
};

const adminProjectToSummary = (project: AdminDashboardProjectListItem): ProjectSummary => {
  const status = Object.values(PROJECT_STATUS_CODE).includes(project.statusCode) ? project.statusCode : PROJECT_STATUS_CODE.ACTIVE;
  const assignees = (project.assignees || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  return {
    id: String(project.id),
    contractNumber: project.contractNo || '',
    name: project.projectName,
    constructionCompany: '',
    representative: '',
    client: '',
    constructionName: project.projectName,
    constructionAmount: '',
    manager: assignees.join(', '),
    period: formatPeriod(project.constructionStartDate, project.constructionEndDate),
    location: '',
    progressRate: percentText(project.progressRate),
    settlementRound: '1차',
    plannedAmount: '',
    accumulatedAmount: '0',
    usageRate: percentText(project.usageRate),
    projectStatusCode: status,
    status: normalizeProjectStatus(status),
    latestUsageStatementStatusCode: null,
    hasUploads: false,
    hasActionRequest: false,
    reportReady: status === PROJECT_STATUS_CODE.COMPLETED,
    recentActivity: '',
    participants: assignees,
  };
};

export const getAdminDashboard = async () => {
  const response = await apiFetch<AdminDashboardResponse>('/admin/dashboard');
  return response.data;
};

export const listAdminDashboardProjects = async () => {
  const response = await apiFetch<AdminDashboardProjectListResponse>('/admin/dashboard/projects?page=1&size=10');
  return response.data.items.map(adminProjectToSummary);
};
