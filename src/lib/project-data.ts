import { C } from './theme';

export const PROJECT_STATUS = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  CLOSED: 'closed',
} as const;

export const USAGE_WORKFLOW_STATUS = {
  DRAFT: 'draft',
  UPLOAD_COMPLETED: 'upload_completed',
  SUPPLEMENT_REQUIRED: 'supplement_required',
  REVIEW_COMPLETED: 'review_completed',
} as const;

export const PROJECT_STATUS_CODE = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  SUSPENDED: 'suspended',
} as const;

export const AGENT_TYPE_CODE = {
  CLASSI: 'classi',
  SAFETY_DOC: 'safety-doc',
  LINK: 'link',
  VISION: 'vision',
  LEGAL: 'legal',
  REPORT: 'report',
  ORCHESTRATOR: 'orchestrator',
  VLM: 'vlm',
} as const;

export const AGENT_LOG_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  SUCCESS: 'success',
  FAIL: 'fail',
  CANCELED: 'canceled',
} as const;

export const FILE_STATUS_CODE = {
  DRAFT: 'draft',
  SUCCESS: 'success',
  FAIL: 'fail',
} as const;

export type ProjectStatus = typeof PROJECT_STATUS[keyof typeof PROJECT_STATUS];
export type UsageWorkflowStatus = typeof USAGE_WORKFLOW_STATUS[keyof typeof USAGE_WORKFLOW_STATUS];
export type ProjectStatusCode = typeof PROJECT_STATUS_CODE[keyof typeof PROJECT_STATUS_CODE];
export type AgentTypeCode = typeof AGENT_TYPE_CODE[keyof typeof AGENT_TYPE_CODE];
export type AgentLogStatusCode = typeof AGENT_LOG_STATUS[keyof typeof AGENT_LOG_STATUS];
export type FileStatusCode = typeof FILE_STATUS_CODE[keyof typeof FILE_STATUS_CODE];

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
  latestUsageStatementStatusCode?: string | null;
  hasLegalReviewNeededMonth?: boolean;
  hasUploads: boolean;
  hasActionRequest: boolean;
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
  sheManager: string;
  sheManagers: string[];
  sheManagerUserIds?: number[];
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
  projectStatusCode: PROJECT_STATUS_CODE.ACTIVE,
  status: PROJECT_STATUS.IN_PROGRESS,
  latestUsageStatementStatusCode: null,
  hasLegalReviewNeededMonth: false,
  hasUploads: false,
  hasActionRequest: false,
  reportReady: false,
  recentActivity: '',
  participants: [],
  sheManager: '',
  sheManagers: [],
};

export const STATUS_META: Record<UsageWorkflowStatus, { label: string; color: string; bg: string }> = {
  [USAGE_WORKFLOW_STATUS.DRAFT]: { label: '업로드 중', color: C.g600, bg: C.g100 },
  [USAGE_WORKFLOW_STATUS.UPLOAD_COMPLETED]: { label: '업로드 완료', color: C.primary, bg: C.bg },
  [USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED]: { label: '보완 요청', color: C.danger, bg: C.dangerBg },
  [USAGE_WORKFLOW_STATUS.REVIEW_COMPLETED]: { label: '검토 완료', color: C.ok, bg: '#F4FBF6' },
};

export const normalizeProjectStatus = (value?: string | null): ProjectStatus => {
  if (value === PROJECT_STATUS.OPEN || value === PROJECT_STATUS.IN_PROGRESS || value === PROJECT_STATUS.CLOSED) return value;
  if (value === PROJECT_STATUS_CODE.ACTIVE) return PROJECT_STATUS.IN_PROGRESS;
  if (value === PROJECT_STATUS_CODE.COMPLETED) return PROJECT_STATUS.CLOSED;
  if (value === PROJECT_STATUS_CODE.SUSPENDED) return PROJECT_STATUS.OPEN;
  return PROJECT_STATUS.IN_PROGRESS;
};

export const normalizeUsageWorkflowStatus = (value?: string | null): UsageWorkflowStatus | undefined => {
  if (
    value === USAGE_WORKFLOW_STATUS.REVIEW_COMPLETED
    || value === USAGE_WORKFLOW_STATUS.UPLOAD_COMPLETED
    || value === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED
    || value === USAGE_WORKFLOW_STATUS.DRAFT
  ) return value;
  if (value === 'approved') return USAGE_WORKFLOW_STATUS.REVIEW_COMPLETED;
  return undefined;
};

export const PROJECT_STATUS_META: Record<ProjectStatusCode, { label: string; color: string; bg: string }> = {
  [PROJECT_STATUS_CODE.ACTIVE]: { label: '진행 중', color: C.primary, bg: C.bg },
  [PROJECT_STATUS_CODE.COMPLETED]: { label: '완료', color: C.ok, bg: '#F4FBF6' },
  [PROJECT_STATUS_CODE.SUSPENDED]: { label: '중단됨', color: C.g600, bg: C.g100 },
};

export const PROJECT_LIFECYCLE_STATUS_META: Record<ProjectStatus, { label: string; color: string; bg: string }> = {
  [PROJECT_STATUS.OPEN]: { label: '중단됨', color: C.g600, bg: C.g100 },
  [PROJECT_STATUS.IN_PROGRESS]: { label: '진행 중', color: C.primary, bg: C.white },
  [PROJECT_STATUS.CLOSED]: { label: '완료됨', color: C.ok, bg: '#F4FBF6' },
};

export const getProjectLifecycleStatus = (project: ProjectSummary): ProjectStatus => {
  if (project.projectStatusCode === PROJECT_STATUS_CODE.COMPLETED || project.status === PROJECT_STATUS.CLOSED) return PROJECT_STATUS.CLOSED;
  if (project.projectStatusCode === PROJECT_STATUS_CODE.SUSPENDED || project.status === PROJECT_STATUS.OPEN) return PROJECT_STATUS.OPEN;
  return PROJECT_STATUS.IN_PROGRESS;
};

export const getProjectLifecycleMeta = (project: ProjectSummary) => PROJECT_LIFECYCLE_STATUS_META[getProjectLifecycleStatus(project)];

const splitManagerNames = (value: string) =>
  value.split(',').map((manager) => manager.trim()).filter(Boolean);

export const getProjectManagers = (project: ProjectSummary) => splitManagerNames(project.manager);
export const getProjectSheManagers = (project: ProjectSummary) =>
  project.sheManagers?.length ? project.sheManagers.filter(Boolean) : splitManagerNames(project.sheManager);

export const LEGAL_REVIEW_STATUS_FILTER = {
  ALL: '전체',
  NEEDED: '법령 검증 필요',
} as const;

export const hasLegalReviewNeededMonth = (project: ProjectSummary) =>
  Boolean(project.hasLegalReviewNeededMonth)
  || project.hasActionRequest
  || normalizeUsageWorkflowStatus(project.latestUsageStatementStatusCode) === USAGE_WORKFLOW_STATUS.UPLOAD_COMPLETED
  || normalizeUsageWorkflowStatus(project.latestUsageStatementStatusCode) === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED;

export const getSheFilterOptionsFromProjects = (projects: ProjectSummary[]) => {
  return {
    managers: ['전체', ...Array.from(new Set(projects.flatMap((project) => getProjectManagers(project))))],
    statuses: [LEGAL_REVIEW_STATUS_FILTER.ALL, LEGAL_REVIEW_STATUS_FILTER.NEEDED],
  };
};
