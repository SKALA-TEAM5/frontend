import { CATS } from '../../lib/evidence-utils';
import {
  getProjectManagers,
  getProjectSheManagers,
  USAGE_WORKFLOW_STATUS,
  type MonthlyUsageStatementSummary,
  type ProjectSummary,
} from '../../lib/project-data';
import {
  calculateUsageRateText,
  formatMonthLabel,
  formatProgressRateText,
  isMonthInProjectPeriod,
  normalizeMonthKey,
  outOfProjectPeriodMessage,
  parseCurrencyValue,
  parseProjectPeriod,
  parseProjectPeriodMonthRange,
} from '../../lib/usage-format';
import type { ValidationGateItem } from '../project-tab/VerifyScreen';

export {
  calculateUsageRateText,
  formatMonthLabel,
  formatProgressRateText,
  isMonthInProjectPeriod,
  normalizeMonthKey,
  outOfProjectPeriodMessage,
  parseCurrencyValue,
  parseProjectPeriod,
  parseProjectPeriodMonthRange,
} from '../../lib/usage-format';

export const FALLBACK_ACTION_ASSIGNEE = '프로젝트 담당자';

export const EMPTY_OVERVIEW_ROWS = [
  ...CATS.map((cat) => [`${cat.id}. ${cat.label}`, '-', '-', '-'] as [string, string, string, string]),
  ['계', '-', '-', '-'] as [string, string, string, string],
];

export const parseUsageStatementMonth = (month: string) => {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match)
    return null;
  const year = Number(match[1]);
  const monthNo = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(monthNo) || monthNo < 1 || monthNo > 12)
    return null;
  return { year, month: monthNo };
};

const pendingUsageMonthsStorageKey = (projectId: string) => `i-veri:pending-usage-months:${projectId}`;

export const readPendingUsageMonths = (projectId: string) => {
  if (typeof window === 'undefined')
    return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(pendingUsageMonthsStorageKey(projectId)) || '[]');
    return Array.isArray(parsed) ? parsed.map((month) => normalizeMonthKey(String(month))).filter(Boolean) : [];
  } catch {
    return [];
  }
};

export const writePendingUsageMonths = (projectId: string, months: string[]) => {
  if (typeof window === 'undefined')
    return;
  const normalized = Array.from(new Set(months.map((month) => normalizeMonthKey(month)).filter(Boolean))).sort();
  if (normalized.length)
    window.localStorage.setItem(pendingUsageMonthsStorageKey(projectId), JSON.stringify(normalized));
  else
    window.localStorage.removeItem(pendingUsageMonthsStorageKey(projectId));
};

export const pendingMonthSummary = (month: string): MonthlyUsageStatementSummary => ({
  month,
  label: formatMonthLabel(month),
  sourceFileName: '-',
  revisionNo: 0,
  documentWrittenDate: '-',
  uploadedAt: '-',
  uploadedBy: '-',
  parseStatus: '미업로드',
  validationStatus: '미검증',
  currentAmount: '0',
  cumulativeAmount: '0',
  evidenceCount: 0,
  issueCount: 0,
});

export const getNextMonthKey = (month?: string) => {
  if (!month)
    return new Date().toISOString().slice(0, 7);
  const base = new Date(`${month}-01`);
  if (Number.isNaN(base.getTime()))
    return new Date().toISOString().slice(0, 7);
  base.setMonth(base.getMonth() + 1);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`;
};

export const formatLegalDisabledReason = (reason?: string | null) => {
  const text = (reason || '').trim();
  if (!text)
    return '세부 내역 탭에서 유효성 검증을 먼저 실행해야 합니다.';
  if (text.includes('validate를 먼저 실행'))
    return '세부 내역 탭에서 유효성 검증을 먼저 실행해야 합니다.';
  return text;
};

export const buildValidationGateItems = (input: {
  usageStatementUploaded: boolean;
  uploadCompleted: boolean;
  legalReady: boolean;
  legalDisabledReason?: string | null;
}): ValidationGateItem[] => [
  {
    id: 'upload-completed',
    label: '업로드 완료',
    required: true,
    state: input.usageStatementUploaded ? (input.uploadCompleted ? 'passed' : 'waiting') : 'failed',
    statusText: input.uploadCompleted ? '완료' : '대기',
    detail: input.usageStatementUploaded
      ? '프로젝트 담당자가 해당 월 사용내역서의 업로드 완료를 눌러야 합니다.'
      : '사용내역서를 먼저 업로드해야 합니다.',
  },
  {
    id: 'validity-check',
    label: '유효성 검증',
    required: true,
    state: input.legalReady ? 'passed' : 'waiting',
    statusText: input.legalReady ? '완료' : '대기',
    detail: input.legalReady
      ? '유효성 검증 조건이 충족되었습니다.'
      : formatLegalDisabledReason(input.legalDisabledReason),
  },
];

export const getProjectAssigneeNames = (project: ProjectSummary) => {
  const names = project.participants.length > 0 ? project.participants : getProjectManagers(project);
  return names.filter(Boolean);
};

export const getProjectAssigneeLabel = (project: ProjectSummary) => {
  const names = getProjectAssigneeNames(project);
  return names.length > 0 ? names.join(', ') : FALLBACK_ACTION_ASSIGNEE;
};

export const getProjectSheManagerNames = (project: ProjectSummary) => getProjectSheManagers(project).filter(Boolean);

export const getProjectSheManagerLabel = (project: ProjectSummary) => {
  const names = getProjectSheManagerNames(project);
  return names.length > 0 ? names.join(', ') : '-';
};

export const applyWorkflowToProject = (
  project: ProjectSummary,
  status: ProjectSummary['latestUsageStatementStatusCode'] | typeof USAGE_WORKFLOW_STATUS[keyof typeof USAGE_WORKFLOW_STATUS],
  actionRequestDetails?: ProjectSummary['actionRequestDetails'],
): ProjectSummary => ({
  ...project,
  hasActionRequest: status === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED,
  actionRequestDetails: status === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED ? actionRequestDetails : undefined,
  reportReady: status === USAGE_WORKFLOW_STATUS.REVIEW_COMPLETED || status === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED,
});

export const withActionRequestMonth = (
  details: ProjectSummary['actionRequestDetails'] | undefined,
  month?: string,
): ProjectSummary['actionRequestDetails'] | undefined => {
  if (!details)
    return details;
  return details.month || !month ? details : { ...details, month };
};
