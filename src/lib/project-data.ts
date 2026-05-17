import { C } from './theme';
import type { AppUser } from './permissions';

export type ProjectStatus =
  | 'draft'
  | 'upload_completed'
  | 'supplement_required'
  | 'review_completed'

export type ProjectStatusCode = 'active' | 'completed' | 'suspended';

export interface ProjectSummary {
  id: string;
  contractNumber: string;
  name: string;
  constructionCompany: string;
  representative: string;
  client: string;
  constructionName: string;
  constructionAmount: string;
  manager: string;
  period: string;
  location: string;
  progressRate: string;
  settlementRound: string;
  plannedAmount: string;
  accumulatedAmount: string;
  usageRate: string;
  projectStatusCode: ProjectStatusCode;
  status: ProjectStatus;
  hasUploads: boolean;
  hasActionRequest: boolean;
  uncheckedMatchedFileCount: number;
  actionRequestDetails?: {
    title: string;
    reason: string;
    assignee: string;
    dueDate: string;
    requestedAt: string;
    month?: string;
  };
  reportReady: boolean;
  recentActivity: string;
  participants: string[];
  assigneeUserIds?: number[];
}

export interface MonthlyUsageStatementSummary {
  month: string;
  label: string;
  sourceFileName: string;
  revisionNo: number;
  documentWrittenDate: string;
  uploadedAt: string;
  uploadedBy: string;
  parseStatus: string;
  validationStatus: string;
  currentAmount: string;
  cumulativeAmount: string;
  evidenceCount: number;
  issueCount: number;
}

export interface NewProjectInput {
  contractNumber: string;
  constructionName: string;
  constructionCompany: string;
  representative: string;
  client: string;
  constructionAmount: string;
  appropriatedAmount: string;
  manager: string;
  startDate: string;
  endDate: string;
  location: string;
  usageStatementFileName?: string;
}

export const CURRENT_USER: AppUser = {
  id: '',
  name: '',
  role: 'she_manager',
};

export const EMPTY_PROJECT: ProjectSummary = {
  id: '',
  contractNumber: '',
  name: '',
  constructionCompany: '',
  representative: '',
  client: '',
  constructionName: '',
  constructionAmount: '',
  manager: '',
  period: '',
  location: '',
  progressRate: '',
  settlementRound: '',
  plannedAmount: '',
  accumulatedAmount: '',
  usageRate: '',
  projectStatusCode: 'active',
  status: 'draft',
  hasUploads: false,
  hasActionRequest: false,
  uncheckedMatchedFileCount: 0,
  reportReady: false,
  recentActivity: '',
  participants: [],
};

export const STATUS_META: Record<ProjectStatus, { label: string; color: string; bg: string }> = {
  draft: { label: '업로드 중', color: C.g600, bg: C.g100 },
  upload_completed: { label: '업로드 완료', color: C.primary, bg: C.bg },
  supplement_required: { label: '보완 요청', color: C.danger, bg: C.dangerBg },
  review_completed: { label: '검토 완료', color: C.ok, bg: '#F4FBF6' },
};

export const normalizeProjectStatus = (value?: string | null): ProjectStatus => {
  if (value === 'review_completed' || value === 'upload_completed' || value === 'supplement_required' || value === 'draft') return value;
  if (value === 'approved') return 'review_completed';
  if (value === 'supplement_uploaded') return 'upload_completed';
  return 'draft';
};

export const PROJECT_STATUS_META: Record<ProjectStatusCode, { label: string; color: string; bg: string }> = {
  active: { label: '진행 중', color: C.primary, bg: C.bg },
  completed: { label: '완료', color: C.ok, bg: '#F4FBF6' },
  suspended: { label: '중단', color: C.g600, bg: C.g100 },
};

const splitManagerNames = (value: string) =>
  value.split(',').map((manager) => manager.trim()).filter(Boolean);

export const getProjectManagers = (project: ProjectSummary) => splitManagerNames(project.manager);

export const getDashboardCountsFromProjects = (projects: ProjectSummary[]) => ({
  myProjects: projects.length,
  active: projects.filter((project) => project.projectStatusCode === 'active').length,
  completed: projects.filter((project) => project.projectStatusCode === 'completed').length,
  suspended: projects.filter((project) => project.projectStatusCode === 'suspended').length,
});

export const getSheFilterOptionsFromProjects = (projects: ProjectSummary[]) => {
  return {
    managers: ['전체', ...Array.from(new Set(projects.flatMap((project) => getProjectManagers(project))))],
    statuses: ['전체', ...Object.values(STATUS_META).map((meta) => meta.label)],
  };
};

export const getProjectById = (_projectId: string, _user: AppUser = CURRENT_USER) => EMPTY_PROJECT;

export const getMonthlyUsageStatements = (_projectId: string): MonthlyUsageStatementSummary[] => [];
