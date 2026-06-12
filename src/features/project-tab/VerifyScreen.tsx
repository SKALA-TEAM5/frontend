import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import CenterModal from '../../components/ui/CenterModal';
import InlineLoader from '../../components/ui/InlineLoader';
import { getAgentFailureMessage, type AgentFailureTarget } from '../../lib/agent-failure';
import { getLatestValidation, getLegalDetail, getValidationStatus, isAgentRunningError, runLegalAgent, waitForAgentButtonEnabled } from '../../lib/agent-api';
import { ApiClientError } from '../../lib/api-client';
import { useCurrentUser } from '../../lib/dev-user';
import { can } from '../../lib/permissions';
import { AGENT_LOG_STATUS } from '../../lib/project-data';
import { C } from '../../lib/theme';
import { CATS, fmt } from '../../lib/evidence-utils';
import type { CategoryValidationResult, ValidationDashboardResult, ValidationDecision, ValidationIssue, ValidationItemResult, ValidationLegalBasis, ValidationRiskLevel } from '../../types/domain';

export type ValidationGateState = 'passed' | 'waiting' | 'failed';

export type ValidationGateItem = {
  id: string;
  label: string;
  required: boolean;
  state: ValidationGateState;
  statusText: string;
  detail: string;
};

interface VerifyScreenProps {
  projectId?: string;
  usageStatementId?: number;
  initialStatus?: VerifyStatus;
  initialSheReviewDecision?: SheReviewDecision;
  hideValidationIntro?: boolean;
  canStartValidation?: boolean;
  validationGateItems?: ValidationGateItem[];
  validationDisabledReason?: string;
  canApproveValidation?: boolean;
  approveDisabledReason?: string;
  onValidationComplete?: () => void;
  onValidationApproved?: () => void | Promise<void>;
  onActionRequested?: (details: { title: string; reason: string; assignee: string; dueDate: string; requestedAt: string }) => void;
}

type LegalSourcePopup = {
  key: string;
  text: string;
  top: number;
  left: number;
};

type VerifyStatus = 'idle' | 'loading' | 'done';
type SheReviewDecision = 'pending' | 'review_completed' | 'supplement_requested';
type ValidationRunState = 'unknown' | 'running' | 'done' | 'failed';
const LEGAL_VALIDATION_POLL_INTERVAL_MS = 4000;

const EMPTY_VALIDATION_RESULT: ValidationDashboardResult = {
  id: '',
  checkedAt: '',
  usageStatementFile: '',
  lawAgent: { name: '', version: '', basis: '' },
  categories: [],
};

const decisionMeta: Record<ValidationDecision, { label: string; color: string; bg: string; border: string }> = {
  appropriate: { label: '적정', color: C.ok, bg: '#F4FBF6', border: C.light },
  conditional: { label: '조건부', color: C.warn, bg: C.warnBg, border: '#FFE082' },
  inappropriate: { label: '부적정', color: C.danger, bg: C.dangerBg, border: '#FFCDD2' },
};

const riskMeta: Record<ValidationRiskLevel, { label: string; color: string; bg: string }> = {
  low: { label: '낮음', color: C.ok, bg: '#F4FBF6' },
  medium: { label: '중간', color: C.warn, bg: C.warnBg },
  high: { label: '높음', color: C.danger, bg: C.dangerBg },
};

const chipStyle = (color: string, bg: string, border?: string): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 24,
  padding: '4px 9px',
  borderRadius: 999,
  border: border ? `1px solid ${border}` : 'none',
  background: bg,
  color,
  fontSize: 11,
  fontWeight: 900,
  lineHeight: 1,
  whiteSpace: 'nowrap',
});

const compactChipStyle = (color: string, bg: string, border?: string): CSSProperties => ({
  ...chipStyle(color, bg, border),
  minHeight: 20,
  padding: '3px 7px',
  fontSize: 10,
});

const validationGateMeta: Record<ValidationGateState, { label: string; color: string; bg: string; border: string }> = {
  passed: { label: '통과', color: C.ok, bg: '#F4FBF6', border: C.light },
  waiting: { label: '대기', color: C.g600, bg: C.g100, border: C.g200 },
  failed: { label: '확인 필요', color: C.danger, bg: C.dangerBg, border: '#FFCDD2' },
};

const decisionScrollStyle = (color: string): CSSProperties => ({
  display: 'flex',
  gap: 6,
  paddingBottom: 2,
  scrollbarColor: `${color} transparent`,
  ['--thin-scrollbar-thumb' as string]: color,
});

const validationShellStyle: CSSProperties = {
  border: `1px solid ${C.g200}`,
  borderRadius: 'var(--ui-radius-card)',
  background: C.white,
  boxShadow: 'var(--ui-shadow-card)',
};

const validationStatTileStyle: CSSProperties = {
  minWidth: 126,
  border: `1px solid ${C.g100}`,
  borderRadius: 'var(--ui-radius-panel)',
  background: '#FBFCFB',
  padding: '10px 12px',
};

const validationSectionTitleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 850,
  color: C.g800,
  letterSpacing: 0,
};

const validationMutedTextStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: C.g500,
  lineHeight: 1.55,
};

const getDecisionWeight = (decision: ValidationDecision) => {
  if (decision === 'inappropriate') return 3;
  if (decision === 'conditional') return 2;
  return 1;
};

const sumBy = (items: CategoryValidationResult[], key: 'usageAmount' | 'recognizedAmount' | 'disputedAmount') =>
  items.reduce((total, item) => total + item[key], 0);

const flattenIssues = (items: CategoryValidationResult[]) =>
  items.flatMap((item) => item.decision === 'appropriate' ? [] : item.issues.map((issue) => ({ ...issue, categoryName: item.categoryName, decision: item.decision, riskLevel: item.riskLevel })));

const flattenReviewItems = (items: CategoryValidationResult[]) =>
  items.flatMap((category) => category.items
    .filter((item) => item.decision !== 'appropriate')
    .map((item) => ({ ...item, categoryName: category.categoryName, categoryId: category.categoryId, riskLevel: category.riskLevel })));

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

const parseJsonRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== 'string') return asRecord(value);
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return null;
  }
};

const readStringField = (source: unknown, keys: string[]) => {
  const record = asRecord(source);
  if (!record) return '';
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
};

const readNestedStringField = (source: unknown, keys: string[]) => {
  const direct = readStringField(source, keys);
  if (direct) return direct;
  const record = asRecord(source);
  return readStringField(record?.result, keys) || readStringField(record?.data, keys);
};

const readNumberField = (source: unknown, keys: string[]) => {
  const record = asRecord(source);
  if (!record) return 0;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value.replace(/[^\d.-]/g, ''));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
};

const readArrayField = (source: unknown, keys: string[]): unknown[] => {
  const record = asRecord(source);
  if (!record) return [];
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return [];
};

const unwrapValidationPayload = (source: unknown): unknown => {
  const record = asRecord(source);
  if (!record) return source;
  const result = record.result;
  const data = record.data;
  const details = parseJsonRecord(record.details);
  const payload = asRecord(record.payload);
  if (details) return unwrapValidationPayload(details);
  if (payload) return unwrapValidationPayload(payload);
  if (asRecord(result)) return unwrapValidationPayload(result);
  if (asRecord(data)) return unwrapValidationPayload(data);
  return source;
};

const extractValidationId = (source: unknown) =>
  readNestedStringField(source, ['validationId', 'validation_id', 'id', 'runId', 'run_id']);

const hasLegalRunSummary = (source: unknown) => {
  const payload = unwrapValidationPayload(source);
  return Boolean(
    readNestedStringField(payload, ['resultCode', 'result_code'])
    || readNestedStringField(payload, ['statusCode', 'status_code', 'status'])
    || readNestedStringField(payload, ['reason', 'message']),
  );
};

const extractValidationRunState = (source: unknown): ValidationRunState => {
  const rawStatus = readNestedStringField(source, ['status', 'statusCode', 'status_code', 'state', 'resultCode', 'result_code']).toLowerCase();
  if (!rawStatus) return 'unknown';
  if ([AGENT_LOG_STATUS.SUCCESS, 'completed', 'complete', 'done', 'succeeded', 'passed', 'confirmed', 'approved'].includes(rawStatus)) return 'done';
  if ([AGENT_LOG_STATUS.RUNNING, AGENT_LOG_STATUS.PENDING, 'processing', 'queued', 'started', 'in_progress'].includes(rawStatus)) return 'running';
  if ([AGENT_LOG_STATUS.FAIL, AGENT_LOG_STATUS.CANCELED, 'failed', 'failure', 'error', 'errored', 'cancelled'].includes(rawStatus)) return 'failed';
  return 'unknown';
};

const normalizeDecision = (value: string): ValidationDecision => {
  const normalized = value.toLowerCase();
  if (['inappropriate', 'invalid', 'rejected', 'fail', 'failed', 'ng', '부적정', '부적절'].includes(normalized)) return 'inappropriate';
  if (['conditional', 'partial', 'warning', 'warn', '조건부', '검토필요', '검토 필요'].includes(normalized)) return 'conditional';
  return 'appropriate';
};

const categoryCodeToId = (value: string) => {
  const parsed = Number(value.replace(/[^\d]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const normalizeRiskLevel = (value: string): ValidationRiskLevel => {
  const normalized = value.toLowerCase();
  if (['high', '높음'].includes(normalized)) return 'high';
  if (['medium', 'middle', '중간'].includes(normalized)) return 'medium';
  return 'low';
};

const normalizeValidationIssues = (items: unknown[]): ValidationIssue[] =>
  items.map((item) => ({
    title: readStringField(item, ['title', 'issueTitle', 'issue_title', 'name']) || '보완 필요',
    description: readStringField(item, ['description', 'reason', 'message']) || '',
    problemFileNames: [],
    requiredAction: readStringField(item, ['requiredAction', 'required_action', 'action', 'request']) || '관련 증빙을 보완해 주세요.',
    recommendedFiles: readArrayField(item, ['recommendedFiles', 'recommended_files', 'requiredFiles', 'required_files']).map((file) => String(file)),
  }));

const normalizeLegalBasis = (items: unknown[]): ValidationLegalBasis[] =>
  items.map((item) => ({
    lawName: readStringField(item, ['lawName', 'law_name', 'name']) || '산업안전보건관리비 계상 및 사용기준',
    article: readStringField(item, ['article', 'articleNo', 'article_no']),
    clause: readStringField(item, ['clause', 'clauseNo', 'clause_no']),
    summary: readStringField(item, ['summary', 'description', 'text']) || '',
    agentReasoning: readStringField(item, ['agentReasoning', 'agent_reasoning', 'reasoning', 'reason']) || '',
    originalText: readStringField(item, ['originalText', 'original_text', 'lawText', 'law_text', 'sourceText', 'source_text', 'text']),
  }));

const normalizeValidationItems = (items: unknown[], category: {
  categoryName: string;
  categoryDecision: ValidationDecision;
  categoryLegalBasis: ValidationLegalBasis[];
  categoryIssues: ValidationIssue[];
}): ValidationItemResult[] => {
  const normalized = items.map((item, index): ValidationItemResult => {
    const amount = readNumberField(item, ['amount', 'usageAmount', 'usage_amount', 'totalAmount', 'total_amount']);
    const recognizedAmount = readNumberField(item, ['recognizedAmount', 'recognized_amount', 'approvedAmount', 'approved_amount', 'validAmount', 'valid_amount']);
    const disputedAmount = readNumberField(item, ['disputedAmount', 'disputed_amount', 'issueAmount', 'issue_amount', 'invalidAmount', 'invalid_amount']);
    const decision = normalizeDecision(readStringField(item, ['decision', 'result', 'resultCode', 'result_code', 'status']));
    const legalBasis = normalizeLegalBasis(readArrayField(item, ['legalBasis', 'legal_basis', 'basis', 'laws']));
    return {
      usageStatementItemId: readNumberField(item, ['usageStatementItemId', 'usage_statement_item_id', 'itemId', 'item_id', 'id']) || undefined,
      itemName: readStringField(item, ['itemName', 'item_name', 'name', 'title']) || `${category.categoryName} 세부항목 ${index + 1}`,
      usedOn: readStringField(item, ['usedOn', 'used_on', 'useDate', 'use_date', 'date']) || undefined,
      amount,
      recognizedAmount: recognizedAmount || (decision === 'appropriate' ? amount : 0),
      disputedAmount: disputedAmount || (decision === 'appropriate' ? 0 : amount),
      decision,
      reviewReason: readStringField(item, ['reviewReason', 'review_reason', 'reason', 'description', 'requiredAction', 'required_action']) || 'legal agent가 확인한 검토 사유가 없습니다.',
      problemFiles: [],
      legalBasis: legalBasis.length > 0 ? legalBasis : category.categoryLegalBasis,
    };
  });
  if (normalized.length > 0) return normalized;
  return category.categoryIssues.map((issue, index) => ({
    itemName: issue.title || `${category.categoryName} 검토 항목 ${index + 1}`,
    amount: 0,
    recognizedAmount: category.categoryDecision === 'appropriate' ? 0 : 0,
    disputedAmount: 0,
    decision: category.categoryDecision,
    reviewReason: issue.requiredAction || issue.description || 'legal agent가 확인한 검토 사유가 없습니다.',
    problemFiles: [],
    legalBasis: category.categoryLegalBasis,
  }));
};

const normalizeValidationResult = (source: unknown): ValidationDashboardResult => {
  const payload = unwrapValidationPayload(source);
  const categorySources = readArrayField(payload, ['categories', 'categoryResults', 'category_results', 'items', 'results', 'validations']);
  const categories = categorySources.map((item, index): CategoryValidationResult => {
    const categoryCode = readStringField(item, ['categoryCode', 'category_code', 'code']);
    const categoryId = readNumberField(item, ['categoryId', 'category_id', 'categoryTypeId', 'category_type_id']) || categoryCodeToId(categoryCode) || index + 1;
    const categoryName = readStringField(item, ['categoryName', 'category_name', 'name', 'title']) || CATS.find((cat) => cat.id === categoryId)?.label || `항목 ${index + 1}`;
    const decision = normalizeDecision(readStringField(item, ['decision', 'result', 'resultCode', 'result_code', 'status']));
    const legalBasis = normalizeLegalBasis(readArrayField(item, ['legalBasis', 'legal_basis', 'basis', 'laws']));
    const rawIssues = normalizeValidationIssues(readArrayField(item, ['issues', 'validationIssues', 'validation_issues', 'problems']));
    const issues = decision === 'appropriate' ? [] : rawIssues;
    const validationItems = normalizeValidationItems(readArrayField(item, ['items', 'itemResults', 'item_results', 'details']), {
      categoryName,
      categoryDecision: decision,
      categoryLegalBasis: legalBasis,
      categoryIssues: issues,
    });
    const usageAmount = readNumberField(item, ['usageAmount', 'usage_amount', 'amount', 'usedAmount', 'used_amount'])
      || validationItems.reduce((total, detail) => total + detail.amount, 0);
    const recognizedAmount = readNumberField(item, ['recognizedAmount', 'recognized_amount', 'approvedAmount', 'approved_amount', 'validAmount', 'valid_amount'])
      || validationItems.reduce((total, detail) => total + detail.recognizedAmount, 0);
    const disputedAmount = readNumberField(item, ['disputedAmount', 'disputed_amount', 'issueAmount', 'issue_amount', 'invalidAmount', 'invalid_amount'])
      || validationItems.reduce((total, detail) => total + detail.disputedAmount, 0);
    return {
      categoryId,
      categoryName,
      usageAmount,
      recognizedAmount,
      disputedAmount,
      decision,
      riskLevel: normalizeRiskLevel(readStringField(item, ['riskLevel', 'risk_level', 'risk'])),
      legalBasis,
      issues,
      items: validationItems,
    };
  });
  return {
    id: extractValidationId(payload),
    checkedAt: readStringField(payload, ['checkedAt', 'checked_at', 'createdAt', 'created_at', 'validatedAt', 'validated_at']) || new Date().toLocaleString('ko-KR'),
    usageStatementFile: readStringField(payload, ['usageStatementFile', 'usage_statement_file', 'fileName', 'file_name']),
    lawAgent: {
      name: readStringField(payload, ['agentName', 'agent_name']) || 'legal_agent',
      version: readStringField(payload, ['agentVersion', 'agent_version', 'version']),
      basis: readStringField(payload, ['basis', 'legalBasisName', 'legal_basis_name']) || '산업안전보건관리비 계상 및 사용기준',
    },
    categories,
  };
};

const buildLegalRunFallbackResult = (source: unknown, usageStatementId?: number): ValidationDashboardResult => {
  const resultCode = readNestedStringField(source, ['resultCode', 'result_code']).toLowerCase();
  const statusCode = readNestedStringField(source, ['statusCode', 'status_code', 'status']).toLowerCase();
  const reason = readNestedStringField(source, ['reason', 'message']) || '법령 검증 실행 결과를 확인했습니다.';
  const failed = ['fail', 'failed', 'error'].includes(resultCode) || ['fail', 'failed', 'error'].includes(statusCode);
  const needsReview = resultCode === 'hil' || resultCode === 'warning' || resultCode === 'conditional';
  const decision: ValidationDecision = failed ? 'inappropriate' : needsReview ? 'conditional' : 'appropriate';
  return {
    id: extractValidationId(source) || (usageStatementId ? `legal-${usageStatementId}` : ''),
    checkedAt: new Date().toLocaleString('ko-KR'),
    usageStatementFile: '',
    lawAgent: {
      name: 'legal_agent',
      version: '',
      basis: '산업안전보건관리비 계상 및 사용기준',
    },
    categories: [{
      categoryId: 0,
      categoryName: '법령 검증 결과',
      usageAmount: 0,
      recognizedAmount: 0,
      disputedAmount: 0,
      decision,
      riskLevel: failed ? 'high' : needsReview ? 'medium' : 'low',
      legalBasis: [{
        lawName: '산업안전보건관리비 계상 및 사용기준',
        summary: '',
        agentReasoning: reason,
      }],
      issues: decision === 'appropriate' ? [] : [{
        title: decision === 'inappropriate' ? '법령 검증 실패' : 'SHE 검토 필요',
        description: reason,
        problemFileNames: [],
        requiredAction: reason,
        recommendedFiles: [],
      }],
      items: decision === 'appropriate' ? [] : [{
        itemName: '법령 검증 결과',
        amount: 0,
        recognizedAmount: 0,
        disputedAmount: 0,
        decision,
        reviewReason: reason,
        problemFiles: [],
        legalBasis: [{
          lawName: '산업안전보건관리비 계상 및 사용기준',
          summary: '',
          agentReasoning: reason,
        }],
      }],
    }],
  };
};

const VerifyScreen = ({ projectId, usageStatementId, initialStatus = 'idle', initialSheReviewDecision = 'pending', hideValidationIntro = false, canStartValidation = true, validationGateItems = [], validationDisabledReason, canApproveValidation = true, approveDisabledReason, onValidationComplete, onValidationApproved, onActionRequested }: VerifyScreenProps) => {
  const { user } = useCurrentUser();
  const [status, setStatus] = useState<VerifyStatus>(initialStatus);
  const [selectedCategoryId, setSelectedCategoryId] = useState(4);
  const [sheReviewDecision, setSheReviewDecision] = useState<SheReviewDecision>(initialSheReviewDecision);
  const [agentFailureTarget, setAgentFailureTarget] = useState<AgentFailureTarget | null>(null);
  const [agentFailureMessage, setAgentFailureMessage] = useState('');
  const [validationId, setValidationId] = useState('');
  const [validationConfirming, setValidationConfirming] = useState(false);
  const [validationStatusText, setValidationStatusText] = useState('');
  const [result, setResult] = useState<ValidationDashboardResult>(EMPTY_VALIDATION_RESULT);
  const [legalSourcePopup, setLegalSourcePopup] = useState<LegalSourcePopup | null>(null);
  const categories = result.categories ?? [];

  useEffect(() => {
    if (!legalSourcePopup) return;
    const closePopup = () => setLegalSourcePopup(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePopup();
    };
    window.addEventListener('pointerdown', closePopup);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', closePopup);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [legalSourcePopup]);

  useEffect(() => {
    setSheReviewDecision(initialSheReviewDecision);
  }, [initialSheReviewDecision]);

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => getDecisionWeight(b.decision) - getDecisionWeight(a.decision) || a.categoryId - b.categoryId),
    [categories],
  );
  const selectedCategory = categories.find((item) => item.categoryId === selectedCategoryId) || sortedCategories[0] || null;
  const decisionGroups = [
    { id: 'inappropriate' as ValidationDecision, label: '부적정', color: C.danger, bg: C.dangerBg, items: sortedCategories.filter((item) => item.decision === 'inappropriate') },
    { id: 'conditional' as ValidationDecision, label: '조건부', color: C.warn, bg: C.warnBg, items: sortedCategories.filter((item) => item.decision === 'conditional') },
    { id: 'appropriate' as ValidationDecision, label: '적정', color: C.ok, bg: '#F4FBF6', items: sortedCategories.filter((item) => item.decision === 'appropriate') },
  ];
  const issues = useMemo(() => flattenIssues(categories), [categories]);
  const reviewItems = useMemo(() => flattenReviewItems(categories), [categories]);
  const supplementEntries = useMemo(() => {
    if (reviewItems.length > 0) {
      return reviewItems.map((item) => ({
        title: item.itemName,
        description: item.reviewReason,
        problemFileNames: [],
        requiredAction: item.reviewReason,
        recommendedFiles: [],
        categoryName: item.categoryName,
        decision: item.decision,
        riskLevel: item.riskLevel,
      }));
    }
    return issues;
  }, [issues, reviewItems]);
  const reviewRequiredCategories = useMemo(
    () => categories.filter((item) => item.decision !== 'appropriate'),
    [categories],
  );
  const totalUsage = sumBy(categories, 'usageAmount');
  const totalRecognized = sumBy(categories, 'recognizedAmount');
  const recognizedRate = totalUsage > 0 ? Math.round((totalRecognized / totalUsage) * 100) : 0;
  const showAgentFailure = (target: AgentFailureTarget, error?: unknown) => {
    setAgentFailureTarget(target);
    setAgentFailureMessage(getAgentFailureMessage(target, error));
  };
  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    const loadExistingLegalResult = async () => {
      const legalDetail = usageStatementId
        ? await getLegalDetail(projectId, usageStatementId).catch(() => null)
        : null;
      if (legalDetail) return legalDetail;
      if (!usageStatementId && initialStatus === 'done') return getLatestValidation(projectId).catch(() => null);
      return null;
    };
    loadExistingLegalResult()
      .then((existingResult) => {
        if (!alive) return;
        const latestResult = normalizeValidationResult(existingResult);
        const resultToShow = latestResult.categories.length > 0
          ? latestResult
          : existingResult && hasLegalRunSummary(existingResult)
            ? buildLegalRunFallbackResult(existingResult, usageStatementId)
            : EMPTY_VALIDATION_RESULT;
        if (resultToShow.categories.length === 0) {
          setStatus('idle');
          setResult(EMPTY_VALIDATION_RESULT);
          setValidationId('');
          return;
        }
        setStatus('done');
        setResult(resultToShow);
        setValidationId(resultToShow.id || extractValidationId(existingResult) || (usageStatementId ? `legal-${usageStatementId}` : ''));
        onValidationComplete?.();
      })
      .catch(() => {
        if (!alive) return;
        setStatus('idle');
        setResult(EMPTY_VALIDATION_RESULT);
        setValidationId('');
      });
    return () => {
      alive = false;
    };
  }, [initialStatus, projectId, usageStatementId]);

  const handleVerify = async () => {
    if (!canStartValidation) {
      showAgentFailure('legal-validation', new ApiClientError(400, validationDisabledReason || '법령 검증 실행 조건을 먼저 충족해야 합니다.'));
      return;
    }
    const loadDetailedResult = async (nextValidationId?: string) => {
      if (!projectId) return EMPTY_VALIDATION_RESULT;
      if (usageStatementId) {
        const legalDetail = await getLegalDetail(projectId, usageStatementId).catch(() => null);
        const legalDetailResult = normalizeValidationResult(legalDetail);
        if (legalDetailResult.categories.length > 0) return legalDetailResult;
      }
      const statusResult = nextValidationId
        ? normalizeValidationResult(await getValidationStatus(projectId, nextValidationId).catch(() => null))
        : EMPTY_VALIDATION_RESULT;
      if (statusResult.categories.length > 0) return statusResult;
      if (usageStatementId) return EMPTY_VALIDATION_RESULT;
      return normalizeValidationResult(await getLatestValidation(projectId).catch(() => null));
    };
    const waitForCompletedLegalResult = async (nextValidationId?: string) => {
      if (!projectId || !usageStatementId) throw new Error('검증 로그 확인에 필요한 ID가 없습니다.');
      await waitForAgentButtonEnabled(projectId, usageStatementId, 'legal', {
        intervalMs: LEGAL_VALIDATION_POLL_INTERVAL_MS,
        tolerateDisabledReason: true,
        onPoll: () => setValidationStatusText('legal agent가 법령 기준을 검토 중입니다.'),
      });
      setValidationStatusText('법령 검증이 완료되어 결과를 불러오는 중입니다.');
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const latestResult = await loadDetailedResult(nextValidationId);
        if (latestResult.categories.length > 0) return latestResult;
        await new Promise((resolve) => window.setTimeout(resolve, LEGAL_VALIDATION_POLL_INTERVAL_MS));
      }
      throw new Error('법령 검증 결과를 확인하지 못했습니다.');
    };
    try {
      setStatus('loading');
      setSelectedCategoryId(4);
      setSheReviewDecision('pending');
      setValidationStatusText('법령 검토를 시작했습니다.');
      if (!projectId || !usageStatementId) throw new Error('검증 API 호출에 필요한 ID가 없습니다.');
      let validationRun: Awaited<ReturnType<typeof runLegalAgent>> = null;
      try {
        validationRun = await runLegalAgent(projectId, usageStatementId);
      } catch (error) {
        if (!isAgentRunningError(error)) throw error;
        setValidationStatusText('이미 실행 중인 법령 검증이 완료될 때까지 기다립니다.');
      }
      const nextValidationId = extractValidationId(validationRun);
      const runState = extractValidationRunState(validationRun);
      setValidationId(nextValidationId || `legal-${usageStatementId}`);
      if (runState === 'failed') {
        throw new Error('법령 검토 실행에 실패했습니다.');
      }
      const resultToShow = await waitForCompletedLegalResult(nextValidationId);
      setResult(resultToShow);
      setValidationId(resultToShow.id || nextValidationId || `legal-${usageStatementId}`);
      setStatus('done');
      setValidationStatusText('법령 검토가 완료되었습니다.');
      onValidationComplete?.();
    } catch (error) {
      setValidationId('');
      setResult(EMPTY_VALIDATION_RESULT);
      setStatus('idle');
      setValidationStatusText('');
      showAgentFailure('legal-validation', error);
    }
  };

  const handleApproveValidation = async () => {
    if (!projectId || !validationId || validationConfirming) return;
    if (!canApproveValidation) return;
    setValidationConfirming(true);
    try {
      await onValidationApproved?.();
      setSheReviewDecision('review_completed');
    } catch (error) {
      showAgentFailure('legal-validation', error);
    } finally {
      setValidationConfirming(false);
    }
  };

  const handleSupplementRequest = async () => {
    if (!can(user, 'requestAction')) return;
    if (sheReviewDecision === 'review_completed') return;
    if (!supplementEntries.length && !reviewRequiredCategories.length) return;
    const firstReviewCategory = reviewRequiredCategories[0];
    const reason = supplementEntries.length > 0
      ? supplementEntries.map((issue, index) => `${index + 1}. ${issue.categoryName} 항목의 ${issue.title}: ${issue.requiredAction}`).join('\n')
      : firstReviewCategory
        ? `1. ${firstReviewCategory.categoryName} 항목의 법령 검증 결과가 ${decisionMeta[firstReviewCategory.decision].label}입니다. 제출 자료를 다시 확인해 주세요.`
        : '제출 자료를 다시 확인해 주세요.';
    if (!validationId || validationConfirming) return;
    setValidationConfirming(true);
    try {
      onActionRequested?.({
      title: '부족한 서류 안내',
      reason,
      assignee: '프로젝트 담당자',
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('ko-KR'),
      requestedAt: new Date().toLocaleString('ko-KR'),
      });
      setSheReviewDecision('supplement_requested');
    } catch (error) {
      showAgentFailure('legal-validation', error);
    } finally {
      setValidationConfirming(false);
    }
  };

  const handleLegalSourceOpen = (event: MouseEvent<HTMLButtonElement>, key: string, text: string) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const popupWidth = 460;
    const viewportPadding = 16;
    const preferredLeft = rect.right + 10;
    const fallbackLeft = Math.max(viewportPadding, window.innerWidth - popupWidth - viewportPadding);
    const left = preferredLeft + popupWidth <= window.innerWidth - viewportPadding ? preferredLeft : fallbackLeft;
    const top = Math.min(Math.max(viewportPadding, rect.top), Math.max(viewportPadding, window.innerHeight - 360 - viewportPadding));
    setLegalSourcePopup((current) => current?.key === key ? null : { key, text, top, left });
  };

  const renderProgress = () => (
    <InlineLoader title="법령 검증을 진행하고 있어요" body={validationStatusText || '사용내역서 항목을 법령 기준과 대조하고, 인정 가능 금액과 검토 사유를 계산하고 있습니다.'} />
  );

  const renderValidationGate = () => {
    if (!validationGateItems.length) return null;
    return (
      <div style={{ display: 'grid', gap: 8, margin: '16px auto 0', width: 'min(100%, 680px)', textAlign: 'left' }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: C.g600 }}>법령 검증 실행 조건</div>
        <div style={{ border: `1px solid ${C.g200}`, borderRadius: 'var(--ui-radius-panel)', background: C.white, overflow: 'hidden' }}>
          {validationGateItems.map((item, index) => {
            const meta = validationGateMeta[item.state];
            return (
              <div key={item.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'center', padding: '11px 12px', borderTop: index === 0 ? 'none' : `1px solid ${C.g100}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 900, color: C.g800 }}>{item.label}</span>
                    <span style={compactChipStyle(item.required ? C.primary : C.g500, item.required ? C.bg : C.g100, item.required ? C.light : C.g200)}>{item.required ? '필수' : '선택'}</span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11, fontWeight: 800, color: C.g500, lineHeight: 1.45 }}>{item.detail}</div>
                </div>
                <span title={item.statusText} style={compactChipStyle(meta.color, meta.bg, meta.border)}>{meta.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderIntro = () => (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 24 }}>
      <img src="/uploads/character.png" alt="캐릭터" style={{ width: 88, height: 'auto', flexShrink: 0, objectFit: 'contain' }} />
      <div style={{ flex: 1 }}>
        <div className="speech-bubble">
          <div style={{ fontSize: 16, fontWeight: 800, color: C.g800, lineHeight: 1.6 }}>사용내역서 항목을 법령 기준으로 검증합니다.</div>
          <div style={{ fontSize: 13, color: C.g400, marginTop: 4 }}>9개 항목별 판정, 법령 근거, 인정 가능 금액을 확인합니다.</div>
        </div>
      </div>
      <Button size="lg" onClick={handleVerify} disabled={status === 'loading'} style={{ flexShrink: 0, alignSelf: 'center' }}>{status === 'loading' ? '검증 중...' : status === 'done' ? '재검증하기' : '검증하기'}</Button>
    </div>
  );

  const renderEmpty = () => (
    <div style={{ padding: '48px 32px', borderRadius: 18, border: `2px dashed ${C.g200}`, textAlign: 'center', background: C.white }}>
      <div style={{ fontSize: 15, fontWeight: 900, color: C.g800, marginBottom: 6 }}>{canStartValidation ? (hideValidationIntro ? '검증 결과가 아직 없습니다' : '검증 준비 완료') : '법령 검증 대기'}</div>
      <div style={{ fontSize: 13, color: C.g400, marginBottom: 16 }}>{canStartValidation ? '사용내역서 항목을 법령 기준으로 검증합니다.' : validationDisabledReason || '법령 검증 실행 조건을 먼저 충족해야 합니다.'}</div>
      <button type="button" onClick={handleVerify} disabled={status === 'loading' || !canStartValidation} style={{ border: 'none', borderRadius: 999, padding: '9px 18px', background: canStartValidation ? C.primary : C.g200, color: canStartValidation ? C.white : C.g400, fontFamily: 'inherit', fontSize: 13, fontWeight: 900, cursor: status === 'loading' ? 'wait' : canStartValidation ? 'pointer' : 'not-allowed', boxShadow: canStartValidation ? '0 10px 22px rgba(27, 94, 59, .24)' : 'none' }}>{status === 'loading' ? '검증 중...' : '법령 검증'}</button>
      {renderValidationGate()}
    </div>
  );

  const renderSelectedValidationMemo = (item: CategoryValidationResult | null) => {
    if (!item) return null;
    const meta = decisionMeta[item.decision];
    const risk = riskMeta[item.riskLevel];
    const selectedDecisionGroup = decisionGroups.find((group) => group.id === item.decision) || decisionGroups[0];

    return <div style={{ position: 'relative', borderRadius: 'var(--ui-radius-card)' }}>
      <Card style={{ ...validationShellStyle, padding: 0, overflow: 'hidden', border: `1px solid ${meta.border}` }}>
      <div style={{ padding: '16px 18px', background: meta.bg, borderBottom: `1px solid ${meta.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: C.g800, lineHeight: 1.3 }}>{item.categoryName}</div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <span style={chipStyle(meta.color, C.white, meta.border)}>{meta.label}</span>
            <span style={chipStyle(risk.color, C.white)}>리스크 {risk.label}</span>
          </div>
        </div>
        <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
          <div style={{ display: 'inline-flex', gap: 4, padding: 4, border: `1px solid ${C.g100}`, borderRadius: 999, background: C.white, width: 'fit-content', maxWidth: '100%' }}>
            {decisionGroups.map((group) => {
              const active = group.id === selectedDecisionGroup.id;
              return <button key={group.id} type="button" disabled={group.items.length === 0} onClick={() => group.items[0] && setSelectedCategoryId(group.items[0].categoryId)} style={{ border: 'none', background: active ? group.color : 'transparent', color: group.items.length === 0 ? C.g400 : active ? C.white : C.g600, borderRadius: 999, padding: '7px 11px', fontSize: 12, fontWeight: 900, fontFamily: 'inherit', cursor: group.items.length === 0 ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>{group.label} {group.items.length}</button>;
            })}
          </div>
          <div className="thin-x-scroll" style={decisionScrollStyle(selectedDecisionGroup.color)}>
            {selectedDecisionGroup.items.map((category) => {
              const active = category.categoryId === item.categoryId;
              return <button key={category.categoryId} type="button" onClick={() => setSelectedCategoryId(category.categoryId)} style={{ border: `1px solid ${active ? meta.color : C.g200}`, borderRadius: 999, background: active ? C.white : 'rgba(255,255,255,.7)', color: active ? meta.color : C.g600, padding: '7px 12px', fontFamily: 'inherit', fontSize: 12, fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap', flex: '0 0 auto' }}>{category.categoryName}</button>;
            })}
          </div>
        </div>
      </div>
      <div style={{ padding: 18, display: 'grid', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
          {[
            { label: '사용내역서', value: fmt(item.usageAmount), color: C.g800 },
            { label: '인정 가능', value: fmt(item.recognizedAmount), color: item.recognizedAmount === item.usageAmount ? C.ok : C.warn },
            { label: '쟁점 금액', value: item.disputedAmount > 0 ? fmt(item.disputedAmount) : '-', color: item.disputedAmount > 0 ? C.danger : C.g500 },
          ].map((metric) => <div key={metric.label} style={{ border: `1px solid ${C.g100}`, borderRadius: 'var(--ui-radius-panel)', background: '#FBFCFB', padding: '11px 10px' }}>
            <div style={{ fontSize: 11, fontWeight: 850, color: C.g500, marginBottom: 5 }}>{metric.label}</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: metric.color, fontVariantNumeric: 'tabular-nums' }}>{metric.value}</div>
          </div>)}
        </div>

        <div style={{ position: 'relative', border: `1px solid ${C.g100}`, borderRadius: 'var(--ui-radius-panel)', overflow: 'hidden' }}>
          <div style={{ padding: '11px 12px', background: '#F7F9F8', borderBottom: `1px solid ${C.g100}`, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: C.g800 }}>세부 항목</div>
            <div style={{ fontSize: 11, fontWeight: 850, color: C.g500 }}>{item.items.length}건</div>
          </div>
          <div style={{ padding: 12, display: 'grid', gap: 10 }}>
            {item.items.length === 0 && <div style={{ fontSize: 12, fontWeight: 800, color: C.g500, lineHeight: 1.5 }}>legal agent가 확인한 세부항목 결과가 없습니다.</div>}
            {item.items.map((detail, index) => {
              const detailMeta = decisionMeta[detail.decision];
              const legalText = detail.legalBasis
                .map((basis) => [basis.lawName, basis.article, basis.clause, basis.originalText || basis.summary || basis.agentReasoning].filter(Boolean).join(' '))
                .filter(Boolean)
                .join('\n\n') || '법령 원문이 제공되지 않았습니다.';
              const tooltipKey = `${detail.usageStatementItemId || index}-${detail.itemName}`;
              return <div key={`${detail.usageStatementItemId || index}-${detail.itemName}`} style={{ border: `1px solid ${detailMeta.border}`, borderRadius: 'var(--ui-radius-panel)', background: C.white, padding: 12, display: 'grid', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
                      <div style={{ fontSize: 14, fontWeight: 900, color: C.g800, lineHeight: 1.35 }}>{detail.itemName}</div>
                      <span style={compactChipStyle(detailMeta.color, detailMeta.bg, detailMeta.border)}>{detailMeta.label}</span>
                    </div>
                    {detail.usedOn && <div style={{ fontSize: 11, fontWeight: 800, color: C.g500 }}>{detail.usedOn}</div>}
                  </div>
                  <span style={{ display: 'inline-flex' }}>
                    <button
                      type="button"
                      aria-label="법령 원문 보기"
                      onClick={(event) => handleLegalSourceOpen(event, tooltipKey, legalText)}
                      style={{ border: `1px solid ${legalSourcePopup?.key === tooltipKey ? C.primary : C.light}`, borderRadius: 999, background: legalSourcePopup?.key === tooltipKey ? C.primary : C.bg, color: legalSourcePopup?.key === tooltipKey ? C.white : C.primary, padding: '5px 9px', fontFamily: 'inherit', fontSize: 11, fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      법령 원문
                    </button>
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                  {[
                    { label: '금액', value: fmt(detail.amount), color: C.g800 },
                    { label: '인정 가능', value: fmt(detail.recognizedAmount), color: detail.recognizedAmount === detail.amount ? C.ok : C.warn },
                    { label: '쟁점 금액', value: detail.disputedAmount > 0 ? fmt(detail.disputedAmount) : '-', color: detail.disputedAmount > 0 ? C.danger : C.g500 },
                  ].map((metric) => <div key={metric.label} style={{ border: `1px solid ${C.g100}`, borderRadius: 8, background: '#FBFCFB', padding: '8px 9px' }}>
                    <div style={{ fontSize: 10, fontWeight: 850, color: C.g500, marginBottom: 4 }}>{metric.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: metric.color, fontVariantNumeric: 'tabular-nums' }}>{metric.value}</div>
                  </div>)}
                </div>
                <div style={{ display: 'grid', gap: 5 }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: C.g500 }}>검토 사유</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: C.g600, lineHeight: 1.6 }}>{detail.reviewReason}</div>
                </div>
              </div>;
            })}
          </div>
        </div>
      </div>
      </Card>
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none', border: `1px solid ${meta.border}`, borderRadius: 'var(--ui-radius-card)' }} />
    </div>;
  };

  const renderSupplementQueue = (list: (ValidationIssue & { categoryName: string; decision: ValidationDecision; riskLevel: ValidationRiskLevel })[]) => (
    <Card style={{ ...validationShellStyle, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '16px 18px', borderBottom: `1px solid ${C.g100}`, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div>
          <div style={validationSectionTitleStyle}>보완 요청</div>
        </div>
        <span style={chipStyle(C.danger, C.dangerBg, '#FFCDD2')}>{list.length}건</span>
      </div>
      <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
        {list.length === 0 && <div style={{ padding: 18, border: `1px solid ${C.g100}`, borderRadius: 'var(--ui-radius-panel)', color: C.g500, fontSize: 13, fontWeight: 800 }}>담당자에게 요청할 보완 항목이 없습니다.</div>}
        {list.map((issue) => {
          const meta = decisionMeta[issue.decision];
          const targetCategory = categories.find((item) => item.categoryName === issue.categoryName);
          const selected = targetCategory?.categoryId === selectedCategory?.categoryId;
          return <button key={`${issue.categoryName}-${issue.title}`} type="button" onClick={() => targetCategory && setSelectedCategoryId(targetCategory.categoryId)} style={{ width: '100%', border: `1px solid ${selected ? meta.color : meta.border}`, borderRadius: 'var(--ui-radius-panel)', background: selected ? meta.bg : C.white, padding: 13, textAlign: 'left', fontFamily: 'inherit', cursor: targetCategory ? 'pointer' : 'default', boxShadow: selected ? '0 10px 20px rgba(31,55,43,.10)' : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', marginBottom: 9 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: meta.color, marginBottom: 4 }}>{issue.categoryName}</div>
                <div title={issue.title} style={{ fontSize: 14, fontWeight: 900, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{issue.title}</div>
              </div>
              <span style={compactChipStyle(meta.color, meta.bg, meta.border)}>{meta.label}</span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 750, color: C.g600, lineHeight: 1.55, marginBottom: 8 }}>{issue.requiredAction}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.g600, lineHeight: 1.55 }}>
              필요한 증빙 서류: <span style={{ color: C.g800 }}>{issue.recommendedFiles.length > 0 ? issue.recommendedFiles.join(', ') : '별도 지정 없음'}</span>
            </div>
          </button>;
        })}
      </div>
    </Card>
  );

  const renderSheReviewPanel = () => {
    if (!can(user, 'confirmFinalReport')) return null;

    const decisionMetaByStatus: Record<SheReviewDecision, { label: string; color: string; bg: string; description: string }> = {
      pending: { label: '검토 대기', color: C.g600, bg: C.g100, description: 'AI 판단 결과와 근거를 확인한 뒤 승인하거나 프로젝트 담당자에게 보완 요청을 보낼 수 있습니다.' },
      review_completed: { label: '검토 완료', color: C.ok, bg: '#F4FBF6', description: '검증 결과를 승인했습니다. 유효성 검토를 완료하고 보고서 탭으로 이동합니다.' },
      supplement_requested: { label: '보완 요청', color: C.warn, bg: C.warnBg, description: '프로젝트 담당자에게 보완 요청 상태를 보냈습니다. 사용내역서 또는 증빙 자료를 수정한 뒤 다시 업로드 완료를 누르면 재검토할 수 있습니다.' },
    };
    const current = decisionMetaByStatus[sheReviewDecision];
    const approveReviewDone = sheReviewDecision === 'review_completed';
    const canApproveReview = Boolean(validationId && !validationConfirming && canApproveValidation && !approveReviewDone);
    const canRequestSupplement = Boolean(validationId && sheReviewDecision !== 'review_completed' && (supplementEntries.length > 0 || reviewRequiredCategories.length > 0) && !validationConfirming);
    const reviewButtonStyle = (color: string, active: boolean, disabled = !validationId || validationConfirming, completed = false): CSSProperties => ({
      border: active && !completed ? 'none' : `1px solid ${C.g200}`,
      borderRadius: 999,
      padding: '9px 18px',
      minWidth: 82,
      background: completed ? C.g100 : active ? color : C.white,
      color: completed ? C.g400 : active ? C.white : C.g600,
      fontFamily: 'inherit',
      fontSize: 13,
      fontWeight: 900,
      cursor: disabled ? 'not-allowed' : 'pointer',
      textAlign: 'center',
      opacity: completed ? 0.72 : disabled && !active ? 0.5 : 1,
      boxShadow: completed ? 'none' : active ? '0 10px 22px rgba(27, 94, 59, .22)' : '0 7px 16px rgba(31, 55, 43, .08)',
    });
    const approveReviewLabel = validationConfirming ? '처리 중' : approveReviewDone ? '검토 완료됨' : '검토 완료';

    return (
      <Card style={{ ...validationShellStyle, padding: '14px 16px', marginBottom: 12, border: `1px solid ${current.color}` }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 7 }}>
              <div style={{ fontSize: 15, fontWeight: 850, color: C.g800 }}>SHE 최종 판단</div>
              <span style={chipStyle(current.color, current.bg)}>{current.label}</span>
            </div>
            <div style={{ fontSize: 12, color: C.g600, lineHeight: 1.6 }}>{!validationId ? '검증 내용을 확인한 뒤 승인 또는 보완 요청을 보낼 수 있습니다.' : !canApproveValidation && approveDisabledReason ? approveDisabledReason : current.description}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', marginLeft: 'auto', alignItems: 'center' }}>
            <span style={compactChipStyle(C.g600, C.white)}>{result.checkedAt}</span>
            <Button size="sm" onClick={handleVerify} disabled={status === 'loading'}>{status === 'loading' ? '검증 중...' : '재검증하기'}</Button>
            <button type="button" onClick={handleApproveValidation} disabled={!canApproveReview} style={reviewButtonStyle(C.ok, false, !canApproveReview, approveReviewDone)}>{approveReviewLabel}</button>
            <button type="button" onClick={handleSupplementRequest} disabled={!canRequestSupplement} style={reviewButtonStyle(C.warn, sheReviewDecision === 'supplement_requested', !canRequestSupplement)}>보완 요청</button>
          </div>
        </div>
        {validationStatusText && <div style={{ marginTop: 10 }}><span style={compactChipStyle(C.ok, '#F4FBF6', '#D6EEDB')}>{validationStatusText}</span></div>}
      </Card>
    );
  };

  const renderDashboard = () => {
    if (categories.length === 0) return renderEmpty();

    const inappropriateCount = categories.filter((item) => item.decision === 'inappropriate').length;
    const disputedTotal = sumBy(categories, 'disputedAmount');

    return <div className="screen-enter">
      {renderSheReviewPanel()}
      <Card style={{ ...validationShellStyle, padding: 0, marginBottom: 12, overflow: 'hidden' }}>
        <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, background: C.white }}>
          {[
            { label: '검증 총액', value: fmt(totalUsage), color: C.g800 },
            { label: '쟁점 금액', value: disputedTotal > 0 ? fmt(disputedTotal) : '-', color: disputedTotal > 0 ? C.danger : C.g500 },
            { label: '부적정 항목', value: `${inappropriateCount}개`, color: inappropriateCount > 0 ? C.danger : C.g500 },
          ].map((metric) => (
            <div key={metric.label} style={{ ...validationStatTileStyle, minWidth: 0, background: '#FFFFFF' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: C.g600 }}>{metric.label}</div>
              </div>
              <div style={{ fontSize: 19, fontWeight: 900, color: metric.color, fontVariantNumeric: 'tabular-nums' }}>{metric.value}</div>
            </div>
          ))}
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(320px, .58fr)', gap: 12, alignItems: 'start', marginBottom: 12 }}>
        {renderSelectedValidationMemo(selectedCategory)}
        {renderSupplementQueue(supplementEntries)}
      </div>
    </div>;
  };

	  return <div style={{ background: 'transparent' }}>
    {status !== 'done' && !hideValidationIntro && renderIntro()}
	    {status === 'loading' && renderProgress()}
	    {(status === 'idle' || (status === 'done' && categories.length === 0)) && renderEmpty()}
	    {status === 'done' && categories.length > 0 && renderDashboard()}
    {legalSourcePopup && (
      <div
        role="dialog"
        aria-modal="false"
        aria-label="법령 원문"
        onPointerDown={(event) => event.stopPropagation()}
        style={{
          position: 'fixed',
          top: legalSourcePopup.top,
          left: legalSourcePopup.left,
          zIndex: 1200,
          width: 460,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 360,
          border: `1px solid ${C.g200}`,
          borderRadius: 12,
          background: C.white,
          boxShadow: '0 20px 44px rgba(31,47,39,.20)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '13px 14px', borderBottom: `1px solid ${C.g100}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: C.g800 }}>법령 원문</div>
          <button type="button" onClick={() => setLegalSourcePopup(null)} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.g600, width: 26, height: 26, fontFamily: 'inherit', fontSize: 15, fontWeight: 900, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div className="thin-y-scroll" style={{ maxHeight: 304, overflowY: 'auto', padding: '13px 14px', fontSize: 13, fontWeight: 750, color: C.g600, lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
          {legalSourcePopup.text}
        </div>
      </div>
    )}
	    <CenterModal open={Boolean(agentFailureTarget)} title="처리 실패" body={agentFailureMessage} actionLabel="확인" onAction={() => { setAgentFailureTarget(null); setAgentFailureMessage(''); }} />
	  </div>;
};

export default VerifyScreen;
