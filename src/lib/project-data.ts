import { CONTRACT_DB } from './mock-data';
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

export const CURRENT_USER: AppUser = {
  id: 'user-hong',
  name: '홍길동',
  role: 'she_manager',
};

export const PROJECTS: ProjectSummary[] = [
  {
    id: 'dt-logistics-2024',
    contractNumber: CONTRACT_DB[0].num,
    name: CONTRACT_DB[0].name,
    constructionCompany: '스칼라건설',
    representative: '정대표',
    client: '동탄물류센터',
    constructionName: CONTRACT_DB[0].project || '동탄 물류센터 증축공사',
    constructionAmount: CONTRACT_DB[0].planned || '12,000,000,000',
    manager: '김현장',
    period: CONTRACT_DB[0].period || '',
    location: '경기도 화성시 동탄물류단지',
    progressRate: '78%',
    settlementRound: CONTRACT_DB[0].round || '4차',
    plannedAmount: CONTRACT_DB[0].planned || '12,000,000,000',
    accumulatedAmount: CONTRACT_DB[0].accumulated || '48,614,045',
    usageRate: '64%',
    projectStatusCode: 'active',
    status: 'action_required',
    hasUploads: true,
    hasActionRequest: true,
    actionRequestDetails: {
      title: '개인보호구 증빙 보완 요청',
      reason: '안전모 지급 영수증과 현장 착용 사진의 대상 인원이 일치하지 않습니다. 지급 대상자 명단과 착용 확인 사진을 추가 제출해야 합니다.',
      assignee: '김현장',
      statusCode: 'open',
      dueDate: '2026-04-26',
      requestedAt: '2026-04-23 11:02',
    },
    reportReady: false,
    recentActivity: 'SHE 담당자가 개인보호구 항목 보완을 요청했습니다.',
    participants: ['홍길동', '김현장', '최안전', '이검토'],
  },
  {
    id: 'pt-manufacturing-2024',
    contractNumber: CONTRACT_DB[1].num,
    name: CONTRACT_DB[1].name,
    constructionCompany: '평택산업개발',
    representative: '강대표',
    client: '평택제조시설',
    constructionName: CONTRACT_DB[1].project || '평택 제조시설 증설',
    constructionAmount: CONTRACT_DB[1].planned || '8,500,000,000',
    manager: '박공무',
    period: CONTRACT_DB[1].period || '',
    location: '경기도 평택시 고덕산업단지',
    progressRate: '91%',
    settlementRound: CONTRACT_DB[1].round || '2차',
    plannedAmount: CONTRACT_DB[1].planned || '8,500,000,000',
    accumulatedAmount: CONTRACT_DB[1].accumulated || '31,120,000',
    usageRate: '72%',
    projectStatusCode: 'active',
    status: 'drafting_report',
    hasUploads: true,
    hasActionRequest: false,
    reportReady: true,
    recentActivity: 'AI가 보고서 초안을 생성했습니다.',
    participants: ['홍길동', '박공무', '오정산'],
  },
  {
    id: 'gm-datacenter-2025',
    contractNumber: CONTRACT_DB[2].num,
    name: CONTRACT_DB[2].name,
    constructionCompany: '광명디씨건설',
    representative: '문대표',
    client: '광명데이터센터',
    constructionName: CONTRACT_DB[2].project || '광명 데이터센터 신축',
    constructionAmount: CONTRACT_DB[2].planned || '15,700,000,000',
    manager: '이프로',
    period: CONTRACT_DB[2].period || '',
    location: '경기도 광명시 첨단산업지구',
    progressRate: '18%',
    settlementRound: CONTRACT_DB[2].round || '1차',
    plannedAmount: CONTRACT_DB[2].planned || '15,700,000,000',
    accumulatedAmount: CONTRACT_DB[2].accumulated || '9,820,000',
    usageRate: '21%',
    projectStatusCode: 'active',
    status: 'upload_pending',
    hasUploads: false,
    hasActionRequest: false,
    reportReady: false,
    recentActivity: '프로젝트가 등록되었고 첫 업로드를 기다리고 있습니다.',
    participants: ['이프로', '정현장'],
  },
];

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

export const getAccessibleProjects = (user: AppUser = CURRENT_USER) => PROJECTS.filter((project) => canAccessProject(user, project));

export const getDashboardCounts = (user: AppUser = CURRENT_USER) => {
  const projects = getAccessibleProjects(user);
  return {
    myProjects: projects.length,
    actionRequired: projects.filter((project) => project.status === 'action_required').length,
    reviewing: projects.filter((project) => project.status === 'under_review').length,
    reportDrafting: projects.filter((project) => project.status === 'drafting_report').length,
  };
};

export const getSheFilterOptions = (user: AppUser = CURRENT_USER) => {
  const projects = getAccessibleProjects(user);
  return {
    managers: ['전체', ...Array.from(new Set(projects.map((project) => project.manager)))],
    statuses: ['전체', ...Array.from(new Set(projects.map((project) => PROJECT_STATUS_META[project.projectStatusCode].label)))],
  };
};

export const getProjectById = (projectId: string, user: AppUser = CURRENT_USER) =>
  getAccessibleProjects(user).find((project) => project.id === projectId) || getAccessibleProjects(user)[0] || PROJECTS[0];
export const getDefaultProjectId = (user: AppUser = CURRENT_USER) => getAccessibleProjects(user)[0]?.id || PROJECTS[0]?.id || '';
export const getProjectByContractNumber = (contractNumber?: string | null) =>
  getAccessibleProjects().find((project) => project.contractNumber === contractNumber) || getAccessibleProjects()[0] || PROJECTS[0];

const MONTHLY_USAGE_STATEMENTS: Record<string, MonthlyUsageStatementSummary[]> = {
  'dt-logistics-2024': [
    { month: '2026-04', label: '2026년 4월', sourceFileName: '동탄_산안비_사용내역서_2026-04.xlsx', revisionNo: 2, documentWrittenDate: '2026-04-22', uploadedAt: '2026-04-23', uploadedBy: '김현장', parseStatus: '파싱 완료', validationStatus: '조치 요청', currentAmount: '7,840,000', cumulativeAmount: '48,614,045', evidenceCount: 34, issueCount: 3 },
    { month: '2026-03', label: '2026년 3월', sourceFileName: '동탄_산안비_사용내역서_2026-03.xlsx', revisionNo: 1, documentWrittenDate: '2026-03-24', uploadedAt: '2026-03-25', uploadedBy: '김현장', parseStatus: '파싱 완료', validationStatus: '보고서 생성', currentAmount: '6,120,000', cumulativeAmount: '40,774,045', evidenceCount: 29, issueCount: 0 },
    { month: '2026-02', label: '2026년 2월', sourceFileName: '동탄_산안비_사용내역서_2026-02.xlsx', revisionNo: 1, documentWrittenDate: '2026-02-21', uploadedAt: '2026-02-22', uploadedBy: '김현장', parseStatus: '파싱 완료', validationStatus: '보고서 생성', currentAmount: '5,430,000', cumulativeAmount: '34,654,045', evidenceCount: 26, issueCount: 0 },
  ],
  'pt-manufacturing-2024': [
    { month: '2026-04', label: '2026년 4월', sourceFileName: '평택_사용내역서_2026-04.xlsx', revisionNo: 1, documentWrittenDate: '2026-04-20', uploadedAt: '2026-04-21', uploadedBy: '박공무', parseStatus: '파싱 완료', validationStatus: '보고서 생성', currentAmount: '4,920,000', cumulativeAmount: '31,120,000', evidenceCount: 22, issueCount: 0 },
    { month: '2026-03', label: '2026년 3월', sourceFileName: '평택_사용내역서_2026-03.xlsx', revisionNo: 1, documentWrittenDate: '2026-03-19', uploadedAt: '2026-03-20', uploadedBy: '박공무', parseStatus: '파싱 완료', validationStatus: '보고서 생성', currentAmount: '4,300,000', cumulativeAmount: '26,200,000', evidenceCount: 20, issueCount: 0 },
  ],
  'gm-datacenter-2025': [
    { month: '2026-04', label: '2026년 4월', sourceFileName: '광명_사용내역서_2026-04.xlsx', revisionNo: 1, documentWrittenDate: '2026-04-18', uploadedAt: '2026-04-19', uploadedBy: '이프로', parseStatus: '업로드 대기', validationStatus: '미검증', currentAmount: '0', cumulativeAmount: '9,820,000', evidenceCount: 0, issueCount: 0 },
    { month: '2026-03', label: '2026년 3월', sourceFileName: '광명_사용내역서_2026-03.xlsx', revisionNo: 1, documentWrittenDate: '2026-03-20', uploadedAt: '2026-03-21', uploadedBy: '이프로', parseStatus: '파싱 완료', validationStatus: '검증 중', currentAmount: '3,120,000', cumulativeAmount: '9,820,000', evidenceCount: 12, issueCount: 1 },
  ],
};

export const getMonthlyUsageStatements = (projectId: string) =>
  (MONTHLY_USAGE_STATEMENTS[projectId] || MONTHLY_USAGE_STATEMENTS[PROJECTS[0].id]).toSorted((a, b) => a.month.localeCompare(b.month));
