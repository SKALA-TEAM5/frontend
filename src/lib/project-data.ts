import { C } from './theme';
import { canAccessProject, type AppUser } from './permissions';

export type ProjectStatus =
  | 'upload_pending'
  | 'under_review'
  | 'action_required'
  | 'supplement_uploaded'
  | 'drafting_report'
  | 'completed';

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

export const PROJECTS: ProjectSummary[] = [];

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
  status: 'upload_pending',
  hasUploads: false,
  hasActionRequest: false,
  reportReady: false,
  recentActivity: '',
  participants: [],
};

export const STATUS_META: Record<ProjectStatus, { label: string; color: string; bg: string }> = {
  upload_pending: { label: '업로드 전', color: C.g600, bg: C.g100 },
  under_review: { label: '검토 중', color: C.primary, bg: C.bg },
  action_required: { label: '조치 요청', color: C.danger, bg: C.dangerBg },
  supplement_uploaded: { label: '보완 완료', color: C.ok, bg: '#F4FBF6' },
  drafting_report: { label: '보고서 작성 중', color: '#7B4CE2', bg: '#F5F0FF' },
  completed: { label: '최종 완료', color: C.ok, bg: '#EEF9F1' },
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

const PROJECT_STORAGE_KEY = 'sananbee.projects.created';
const PROJECT_MANAGER_ASSIGNMENTS_KEY = 'sananbee.projects.managers';

const splitManagerNames = (value: string) =>
  value.split(',').map((manager) => manager.trim()).filter(Boolean);

const normalizeManagerNames = (managers: string[]) =>
  Array.from(new Set(managers.map((manager) => manager.trim()).filter(Boolean)));

const readProjectManagerAssignments = (): Record<string, string[]> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(PROJECT_MANAGER_ASSIGNMENTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string[]>;
    return Object.fromEntries(Object.entries(parsed).map(([projectId, managers]) => [projectId, normalizeManagerNames(Array.isArray(managers) ? managers : [])]));
  } catch {
    return {};
  }
};

const writeProjectManagerAssignments = (assignments: Record<string, string[]>) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PROJECT_MANAGER_ASSIGNMENTS_KEY, JSON.stringify(assignments));
};

const applyProjectManagerAssignments = (projects: ProjectSummary[]) => {
  const assignments = readProjectManagerAssignments();
  return projects.map((project) => {
    const managers = assignments[project.id];
    if (!managers?.length) return project;
    return {
      ...project,
      manager: managers.join(', '),
      participants: normalizeManagerNames([...project.participants, ...managers]),
    };
  });
};

const normalizeProjectId = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'new-project';

const readCreatedProjects = (): ProjectSummary[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PROJECT_STORAGE_KEY);
    return raw ? JSON.parse(raw) as ProjectSummary[] : [];
  } catch {
    return [];
  }
};

const writeCreatedProjects = (projects: ProjectSummary[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(projects));
};

export const getAllProjects = () => applyProjectManagerAssignments([...PROJECTS, ...readCreatedProjects()]);

export const getProjectManagers = (project: ProjectSummary) => splitManagerNames(project.manager);

export const getProjectManagerCandidates = () =>
  normalizeManagerNames(getAllProjects().flatMap((project) => [
    ...splitManagerNames(project.manager),
    ...project.participants,
    project.actionRequestDetails?.assignee || '',
  ]));

export const updateProjectManagers = (projectId: string, managers: string[]) => {
  const normalizedManagers = normalizeManagerNames(managers);
  const assignments = readProjectManagerAssignments();
  if (normalizedManagers.length) {
    assignments[projectId] = normalizedManagers;
  } else {
    delete assignments[projectId];
  }
  writeProjectManagerAssignments(assignments);
};

export const createProject = (input: NewProjectInput) => {
  const createdProjects = readCreatedProjects();
  const existingIds = new Set(getAllProjects().map((project) => project.id));
  const baseId = normalizeProjectId(`${input.contractNumber}-${input.constructionName}`);
  let id = baseId;
  let index = 2;
  while (existingIds.has(id)) {
    id = `${baseId}-${index}`;
    index += 1;
  }

  const period = `${input.startDate.replace(/-/g, '/')}~${input.endDate.replace(/-/g, '/')}`;
  const project: ProjectSummary = {
    id,
    contractNumber: input.contractNumber,
    name: input.constructionName,
    constructionCompany: input.constructionCompany,
    representative: input.representative,
    client: input.client,
    constructionName: input.constructionName,
    constructionAmount: input.constructionAmount,
    manager: input.manager,
    period,
    location: input.location,
    progressRate: '0%',
    settlementRound: '1차',
    plannedAmount: input.appropriatedAmount || input.constructionAmount,
    accumulatedAmount: '0',
    usageRate: '0%',
    projectStatusCode: 'active',
    status: input.usageStatementFileName ? 'under_review' : 'upload_pending',
    hasUploads: Boolean(input.usageStatementFileName),
    hasActionRequest: false,
    reportReady: false,
    recentActivity: input.usageStatementFileName ? '신규 프로젝트가 등록되었고 사용내역서가 업로드되었습니다.' : '신규 프로젝트가 등록되었습니다.',
    participants: input.manager ? [input.manager] : [],
  };

  writeCreatedProjects([project, ...createdProjects]);
  return project;
};

export const getAccessibleProjects = (user: AppUser = CURRENT_USER) => getAllProjects().filter((project) => canAccessProject(user, project));

export const getDashboardCounts = (user: AppUser = CURRENT_USER) => {
  const projects = getAccessibleProjects(user);
  return {
    myProjects: projects.length,
    active: projects.filter((project) => project.projectStatusCode === 'active').length,
    completed: projects.filter((project) => project.projectStatusCode === 'completed').length,
    suspended: projects.filter((project) => project.projectStatusCode === 'suspended').length,
  };
};

export const getSheFilterOptions = (user: AppUser = CURRENT_USER) => {
  const projects = getAccessibleProjects(user);
  return getSheFilterOptionsFromProjects(projects);
};

export const getDashboardCountsFromProjects = (projects: ProjectSummary[]) => ({
  myProjects: projects.length,
  active: projects.filter((project) => project.projectStatusCode === 'active').length,
  completed: projects.filter((project) => project.projectStatusCode === 'completed').length,
  suspended: projects.filter((project) => project.projectStatusCode === 'suspended').length,
});

export const getSheFilterOptionsFromProjects = (projects: ProjectSummary[]) => {
  return {
    managers: ['전체', ...Array.from(new Set(projects.map((project) => project.manager).filter(Boolean)))],
    statuses: ['전체', ...Array.from(new Set(projects.map((project) => PROJECT_STATUS_META[project.projectStatusCode].label)))],
  };
};

export const getProjectById = (projectId: string, user: AppUser = CURRENT_USER) =>
  getAccessibleProjects(user).find((project) => project.id === projectId) || getAccessibleProjects(user)[0] || getAllProjects()[0] || EMPTY_PROJECT;
export const getDefaultProjectId = (user: AppUser = CURRENT_USER) => getAccessibleProjects(user)[0]?.id || '';
export const getProjectByContractNumber = (contractNumber?: string | null) =>
  getAccessibleProjects().find((project) => project.contractNumber === contractNumber) || getAccessibleProjects()[0] || EMPTY_PROJECT;

const MONTHLY_USAGE_STATEMENTS: Record<string, MonthlyUsageStatementSummary[]> = {};

const parseProjectPeriod = (period: string) => {
  const [startText, endText] = period.split('~');
  const parseMonth = (value?: string) => {
    const match = value?.match(/(\d{4})\/(\d{1,2})/);
    if (!match) return null;
    return { year: Number(match[1]), month: Number(match[2]) };
  };
  return { start: parseMonth(startText), end: parseMonth(endText) };
};

const formatMonthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;
const formatMonthLabel = (monthKey: string) => {
  const [year, month] = monthKey.split('-');
  return `${year}년 ${Number(month)}월`;
};

const getMonthsInPeriod = (period: string) => {
  const { start, end } = parseProjectPeriod(period);
  if (!start || !end) return [];
  const months: string[] = [];
  let year = start.year;
  let month = start.month;
  while (year < end.year || (year === end.year && month <= end.month)) {
    months.push(formatMonthKey(year, month));
    month += 1;
    if (month > 12) {
      year += 1;
      month = 1;
    }
  }
  return months;
};

const buildEmptyMonthlyUsageStatement = (month: string, project?: ProjectSummary): MonthlyUsageStatementSummary => ({
    month,
    label: formatMonthLabel(month),
    sourceFileName: '사용내역서 미업로드',
    revisionNo: 1,
    documentWrittenDate: '-',
    uploadedAt: '-',
    uploadedBy: '-',
    parseStatus: '업로드 대기',
    validationStatus: '미검증',
    currentAmount: '0',
    cumulativeAmount: project?.accumulatedAmount || '0',
    evidenceCount: 0,
    issueCount: 0,
});

const buildMonthlyUsageStatementsForPeriod = (projectId: string): MonthlyUsageStatementSummary[] => {
  const project = getAllProjects().find((item) => item.id === projectId);
  const periodMonths = getMonthsInPeriod(project?.period || '');
  const explicitStatements = MONTHLY_USAGE_STATEMENTS[projectId] || [];
  const explicitByMonth = new Map(explicitStatements.map((statement) => [statement.month, statement]));
  if (!periodMonths.length) return explicitStatements.length ? explicitStatements : [buildEmptyMonthlyUsageStatement('2026-04', project)];
  return periodMonths.map((month) => explicitByMonth.get(month) || buildEmptyMonthlyUsageStatement(month, project));
};

export const getMonthlyUsageStatements = (projectId: string) =>
  buildMonthlyUsageStatementsForPeriod(projectId).toSorted((a, b) => a.month.localeCompare(b.month));
