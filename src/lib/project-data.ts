import { CONTRACT_DB } from './mock-data';
import { C } from './theme';
import { canAccessProject, type AppUser } from './permissions';
import { PROJECT_STAGES, type ProjectStageId } from './project-stages';

export type ProjectStatus =
  | 'upload_pending'
  | 'under_review'
  | 'action_required'
  | 'supplement_uploaded'
  | 'drafting_report'
  | 'completed';

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
  stageId: ProjectStageId;
  stageIndex: number;
  status: ProjectStatus;
  hasUploads: boolean;
  hasActionRequest: boolean;
  reportReady: boolean;
  recentActivity: string;
  participants: string[];
}

export { PROJECT_STAGES };

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
    stageId: 'action_request',
    stageIndex: 5,
    status: 'action_required',
    hasUploads: true,
    hasActionRequest: true,
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
    stageId: 'report_generation',
    stageIndex: 7,
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
    stageId: 'upload',
    stageIndex: 1,
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
    statuses: ['전체', ...Array.from(new Set(projects.map((project) => STATUS_META[project.status].label)))],
  };
};

export const getProjectById = (projectId: string, user: AppUser = CURRENT_USER) =>
  getAccessibleProjects(user).find((project) => project.id === projectId) || getAccessibleProjects(user)[0] || PROJECTS[0];
export const getDefaultProjectId = (user: AppUser = CURRENT_USER) => getAccessibleProjects(user)[0]?.id || PROJECTS[0]?.id || '';
export const getProjectByContractNumber = (contractNumber?: string | null) =>
  getAccessibleProjects().find((project) => project.contractNumber === contractNumber) || getAccessibleProjects()[0] || PROJECTS[0];
