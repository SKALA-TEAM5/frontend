import { C } from './theme';
import type { AppUser } from './permissions';

export type ProjectStatus =
  | 'draft'
  | 'upload_completed'
  | 'approved'
  | 'supplement_required'
  | 'supplement_uploaded'

export type ActionRequestStatusCode = 'open' | 'in_progress' | 'resolved' | 'closed';
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
    statusCode: ActionRequestStatusCode;
    dueDate: string;
    requestedAt: string;
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
  draft: { label: '임시저장', color: C.g600, bg: C.g100 },
  upload_completed: { label: '업로드 완료', color: C.primary, bg: C.bg },
  approved: { label: '승인', color: C.ok, bg: '#F4FBF6' },
  supplement_required: { label: '보완 요청', color: C.danger, bg: C.dangerBg },
  supplement_uploaded: { label: '보완 완료', color: C.ok, bg: '#F4FBF6' },
};

export const PROJECT_STATUS_META: Record<ProjectStatusCode, { label: string; color: string; bg: string }> = {
  active: { label: '진행 중', color: C.primary, bg: C.bg },
  completed: { label: '완료', color: C.ok, bg: '#F4FBF6' },
  suspended: { label: '중단', color: C.g600, bg: C.g100 },
};

export const ACTION_REQUEST_STATUS_META: Record<ActionRequestStatusCode, { label: string; color: string; bg: string }> = {
  open: { label: '미착수', color: C.danger, bg: C.dangerBg },
  in_progress: { label: '조치 중', color: C.warn, bg: C.warnBg },
  resolved: { label: '조치 완료', color: C.ok, bg: '#F4FBF6' },
  closed: { label: '종결', color: C.g600, bg: C.g100 },
};

export const ACTION_REQUEST_STATUS_STEPS: ActionRequestStatusCode[] = ['open', 'in_progress', 'resolved', 'closed'];

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
    managers: ['전체', ...Array.from(new Set(projects.map((project) => project.manager).filter(Boolean)))],
    statuses: ['전체', ...Array.from(new Set(projects.map((project) => STATUS_META[project.status].label)))],
  };
};

export const getProjectById = (_projectId: string, _user: AppUser = CURRENT_USER) => EMPTY_PROJECT;

export const getMonthlyUsageStatements = (_projectId: string): MonthlyUsageStatementSummary[] => [];
