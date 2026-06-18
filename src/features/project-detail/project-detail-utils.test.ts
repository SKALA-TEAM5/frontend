import { describe, expect, it } from 'vitest';
import { PROJECT_STATUS, PROJECT_STATUS_CODE, USAGE_WORKFLOW_STATUS, type ProjectSummary } from '../../lib/project-data';
import {
  applyWorkflowToProject,
  buildValidationGateItems,
  calculateUsageRateText,
  formatMonthLabel,
  formatProgressRateText,
  isMonthInProjectPeriod,
  normalizeMonthKey,
  parseCurrencyValue,
  parseProjectPeriod,
  parseUsageStatementMonth,
  pendingMonthSummary,
} from './project-detail-utils';

const baseProject: ProjectSummary = {
  id: 'project-1',
  name: '테스트 프로젝트',
  contractNumber: 'C-001',
  constructionName: '테스트 공사',
  constructionCompany: '시공사',
  representative: '대표',
  client: '발주처',
  constructionAmount: '100,000',
  period: '2026-01-01 ~ 2026-12-31',
  location: '서울',
  plannedAmount: '10,000',
  accumulatedAmount: '0',
  progressRate: '0%',
  settlementRound: '1차',
  usageRate: '0%',
  manager: '',
  participants: [],
  assigneeUserIds: [],
  sheManager: '',
  sheManagers: [],
  sheManagerUserIds: [],
  status: PROJECT_STATUS.IN_PROGRESS,
  projectStatusCode: PROJECT_STATUS_CODE.ACTIVE,
  hasUploads: false,
  hasActionRequest: false,
  latestUsageStatementStatusCode: USAGE_WORKFLOW_STATUS.DRAFT,
  recentActivity: '',
  reportReady: false,
};

describe('project-detail-utils', () => {
  it('normalizes and formats month keys', () => {
    expect(normalizeMonthKey('2026-04-15')).toBe('2026-04');
    expect(normalizeMonthKey(null)).toBe('');
    expect(formatMonthLabel('2026-04')).toBe('2026년 4월');
  });

  it('parses usage statement months only when valid', () => {
    expect(parseUsageStatementMonth('2026-04')).toEqual({ year: 2026, month: 4 });
    expect(parseUsageStatementMonth('2026-13')).toBeNull();
    expect(parseUsageStatementMonth('2026-4')).toBeNull();
  });

  it('checks project period month boundaries', () => {
    const period = '2026-01-01 ~ 2026-12-31';
    expect(isMonthInProjectPeriod('2026-01', period)).toBe(true);
    expect(isMonthInProjectPeriod('2026-12', period)).toBe(true);
    expect(isMonthInProjectPeriod('2027-01', period)).toBe(false);
  });

  it('formats pending month summaries', () => {
    expect(pendingMonthSummary('2026-05')).toMatchObject({
      month: '2026-05',
      label: '2026년 5월',
      sourceFileName: '-',
      parseStatus: '미업로드',
      validationStatus: '미검증',
    });
  });

  it('parses periods, currencies, usage rates, and progress rates', () => {
    expect(parseProjectPeriod('2026/01/01 ~ 2026/03/31')).toEqual({ startDate: '2026-01-01', endDate: '2026-03-31' });
    expect(parseCurrencyValue('12,300원')).toBe(12300);
    expect(calculateUsageRateText('2,500', '10,000')).toBe('25%');
    expect(formatProgressRateText('12.34')).toBe('12.3%');
  });

  it('builds validation gates for upload and legal readiness', () => {
    expect(buildValidationGateItems({
      usageStatementUploaded: true,
      uploadCompleted: false,
      legalReady: false,
      legalDisabledReason: 'validate를 먼저 실행',
    })).toEqual([
      expect.objectContaining({ id: 'upload-completed', state: 'waiting' }),
      expect.objectContaining({ id: 'validity-check', state: 'waiting', detail: '세부 내역 탭에서 유효성 검증을 먼저 실행해야 합니다.' }),
    ]);
  });

  it('applies workflow status immutably', () => {
    const actionRequestDetails = {
      title: '보완 요청',
      reason: '필수 증빙 누락',
      assignee: '담당자',
      dueDate: '2026-06-30',
      requestedAt: '2026-06-18',
    };
    const updated = applyWorkflowToProject(baseProject, USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED, actionRequestDetails);
    expect(updated).not.toBe(baseProject);
    expect(updated.hasActionRequest).toBe(true);
    expect(updated.actionRequestDetails).toEqual(actionRequestDetails);
    expect(updated.reportReady).toBe(true);
    expect(baseProject.hasActionRequest).toBe(false);
  });
});
