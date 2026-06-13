import { AGENT_LOG_STATUS } from '../../../lib/project-data';
import { CATS } from '../../../lib/evidence-utils';
import type {
  CategoryValidationResult,
  ValidationDashboardResult,
  ValidationDecision,
  ValidationIssue,
  ValidationItemResult,
  ValidationLegalBasis,
  ValidationRiskLevel,
} from '../../../types/domain';

export type ValidationRunState = 'unknown' | 'running' | 'done' | 'failed';

export const EMPTY_VALIDATION_RESULT: ValidationDashboardResult = {
  id: '',
  checkedAt: '',
  usageStatementFile: '',
  lawAgent: { name: '', version: '', basis: '' },
  categories: [],
};

export const formatLegalSourceText = (value: string) => value
  .replace(/\r\n?/g, '\n')
  .split(/\n{2,}/)
  .map((block) => block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce<string[]>((lines, line) => {
      const shouldKeepLineBreak = /^(?:\d+\)|[가-힣]\)|※||<[^>]+>|[-•·])/.test(line);
      if (!lines.length || shouldKeepLineBreak) return [...lines, line];

      const previous = lines[lines.length - 1];
      return [
        ...lines.slice(0, -1),
        `${previous} ${line}`.replace(/\s+/g, ' '),
      ];
    }, [])
    .join('\n'))
  .filter(Boolean)
  .join('\n\n');

export const isLegalSourceTitleLine = (line: string) =>
  line.includes('산업안전보건관리비') && (line.includes('별표') || line.includes('제'));

export const getDecisionWeight = (decision: ValidationDecision) => {
  if (decision === 'inappropriate') return 3;
  if (decision === 'conditional') return 2;
  return 1;
};

export const sumBy = (items: CategoryValidationResult[], key: 'usageAmount' | 'recognizedAmount' | 'disputedAmount') =>
  items.reduce((total, item) => total + item[key], 0);

export const flattenIssues = (items: CategoryValidationResult[]) =>
  items.flatMap((item) => item.decision === 'appropriate' ? [] : item.issues.map((issue) => ({
    ...issue,
    categoryName: item.categoryName,
    decision: item.decision,
    riskLevel: item.riskLevel,
  })));

export const flattenReviewItems = (items: CategoryValidationResult[]) =>
  items.flatMap((category) => category.items
    .filter((item) => item.decision !== 'appropriate')
    .map((item) => ({
      ...item,
      categoryName: category.categoryName,
      categoryId: category.categoryId,
      riskLevel: category.riskLevel,
    })));

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

export const extractValidationId = (source: unknown) =>
  readNestedStringField(source, ['validationId', 'validation_id', 'id', 'runId', 'run_id']);

export const hasLegalRunSummary = (source: unknown) => {
  const payload = unwrapValidationPayload(source);
  return Boolean(
    readNestedStringField(payload, ['resultCode', 'result_code'])
    || readNestedStringField(payload, ['statusCode', 'status_code', 'status'])
    || readNestedStringField(payload, ['reason', 'message']),
  );
};

export const extractValidationRunState = (source: unknown): ValidationRunState => {
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

export const normalizeValidationResult = (source: unknown): ValidationDashboardResult => {
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

export const buildLegalRunFallbackResult = (source: unknown, usageStatementId?: number): ValidationDashboardResult => {
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
