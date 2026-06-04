import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import CenterModal from '../../components/ui/CenterModal';
import InlineLoader from '../../components/ui/InlineLoader';
import { getAgentFailureMessage, type AgentFailureTarget } from '../../lib/agent-failure';
import { runLegalAgent } from '../../lib/agent-api';
import { useCurrentUser } from '../../lib/dev-user';
import { can } from '../../lib/permissions';
import { AGENT_LOG_STATUS } from '../../lib/project-data';
import { C } from '../../lib/theme';
import { VALIDATION_DASHBOARD_RESULT, fmt } from '../../lib/evidence-utils';
import type { CategoryValidationResult, ValidationDecision, ValidationIssue, ValidationRiskLevel } from '../../types/domain';

interface VerifyScreenProps {
  projectId?: string;
  usageStatementId?: number;
  initialStatus?: VerifyStatus;
  hideValidationIntro?: boolean;
  canStartValidation?: boolean;
  onValidationComplete?: () => void;
  onValidationApproved?: () => void | Promise<void>;
  onActionRequested?: (details: { title: string; reason: string; assignee: string; dueDate: string; requestedAt: string }) => void;
}

type VerifyStatus = 'idle' | 'loading' | 'done';
type SheReviewDecision = 'pending' | 'review_completed' | 'supplement_requested';
type ResultFilter = 'all' | ValidationDecision;
type ValidationRunState = 'unknown' | 'running' | 'done' | 'failed';

const EXAMPLE_VALIDATION_ID = 'example-validation-result';

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
  items.flatMap((item) => item.issues.map((issue) => ({ ...issue, categoryName: item.categoryName, decision: item.decision, riskLevel: item.riskLevel })));

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

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

const extractValidationId = (source: unknown) =>
  readNestedStringField(source, ['validationId', 'validation_id', 'id', 'runId', 'run_id']);

const extractValidationRunState = (source: unknown): ValidationRunState => {
  const rawStatus = readNestedStringField(source, ['status', 'statusCode', 'status_code', 'state', 'resultCode', 'result_code']).toLowerCase();
  if (!rawStatus) return 'unknown';
  if ([AGENT_LOG_STATUS.SUCCESS, 'completed', 'complete', 'done', 'succeeded', 'passed', 'confirmed', 'approved'].includes(rawStatus)) return 'done';
  if ([AGENT_LOG_STATUS.RUNNING, AGENT_LOG_STATUS.PENDING, 'processing', 'queued', 'started', 'in_progress'].includes(rawStatus)) return 'running';
  if ([AGENT_LOG_STATUS.FAIL, AGENT_LOG_STATUS.CANCELED, 'failed', 'failure', 'error', 'errored', 'cancelled'].includes(rawStatus)) return 'failed';
  return 'unknown';
};

const VerifyScreen = ({ projectId, usageStatementId, initialStatus = 'idle', hideValidationIntro = false, canStartValidation = true, onValidationComplete, onValidationApproved, onActionRequested }: VerifyScreenProps) => {
  const { user } = useCurrentUser();
  const [status, setStatus] = useState<VerifyStatus>(initialStatus);
  const [filter, setFilter] = useState<ResultFilter>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState(4);
  const [sheReviewDecision, setSheReviewDecision] = useState<SheReviewDecision>('pending');
  const [agentFailureTarget, setAgentFailureTarget] = useState<AgentFailureTarget | null>(null);
  const [openEvidenceFileCategoryIds, setOpenEvidenceFileCategoryIds] = useState<number[]>([]);
  const [validationId, setValidationId] = useState('');
  const [validationConfirming, setValidationConfirming] = useState(false);
  const [validationStatusText, setValidationStatusText] = useState('');
  const result = VALIDATION_DASHBOARD_RESULT;
  const categories = result.categories ?? [];

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => getDecisionWeight(b.decision) - getDecisionWeight(a.decision) || a.categoryId - b.categoryId),
    [categories],
  );
  const filteredCategories = filter === 'all' ? sortedCategories : sortedCategories.filter((item) => item.decision === filter);
  const selectedCategory = categories.find((item) => item.categoryId === selectedCategoryId) || sortedCategories[0] || null;
  const issues = useMemo(() => flattenIssues(categories), [categories]);
  const totalUsage = sumBy(categories, 'usageAmount');
  const totalRecognized = sumBy(categories, 'recognizedAmount');
  const recognizedRate = totalUsage > 0 ? Math.round((totalRecognized / totalUsage) * 100) : 0;
  useEffect(() => {
    if (initialStatus === 'done') setStatus('done');
  }, [initialStatus]);

  useEffect(() => {
    if (openEvidenceFileCategoryIds.length === 0) return;
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-validation-evidence-tooltip]')) return;
      setOpenEvidenceFileCategoryIds([]);
    };
    document.addEventListener('pointerdown', handleOutsidePointerDown);
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown);
  }, [openEvidenceFileCategoryIds.length]);

  const handleVerify = async () => {
    if (!canStartValidation) return;
    try {
      setStatus('loading');
      setSelectedCategoryId(4);
      setSheReviewDecision('pending');
      setValidationStatusText('법령 검토를 시작했습니다.');
      if (!projectId || !usageStatementId) throw new Error('검증 API 호출에 필요한 ID가 없습니다.');
      const validationRun = await runLegalAgent(projectId, usageStatementId);
      const nextValidationId = extractValidationId(validationRun);
      const runState = extractValidationRunState(validationRun);
      setValidationId(nextValidationId || `legal-${usageStatementId}`);
      if (runState === 'failed') {
        throw new Error('법령 검토 실행에 실패했습니다.');
      }
      setStatus('done');
      setValidationStatusText('법령 검토가 완료되었습니다.');
      onValidationComplete?.();
    } catch {
      window.setTimeout(() => {
        setValidationId(EXAMPLE_VALIDATION_ID);
        setStatus('done');
        setValidationStatusText('법령 검토 API 응답을 받지 못해 예시 검증 결과를 표시합니다.');
        onValidationComplete?.();
      }, 450);
    }
  };

  const handleApproveValidation = async () => {
    if (!projectId || !validationId || validationConfirming) return;
    setValidationConfirming(true);
    try {
      setSheReviewDecision('review_completed');
      await onValidationApproved?.();
    } catch {
      setAgentFailureTarget('legal-validation');
    } finally {
      setValidationConfirming(false);
    }
  };

  const handleSupplementRequest = async () => {
    if (!can(user, 'requestAction')) return;
    if (!issues.length) return;
    const firstIssue = issues[0];
    const reason = firstIssue ? `${firstIssue.categoryName} 항목에서 ${firstIssue.title} 문제가 있습니다. ${firstIssue.requiredAction}` : '제출 자료를 다시 확인해 주세요.';
    if (!validationId || validationConfirming) return;
    setValidationConfirming(true);
    try {
      onActionRequested?.({
      title: firstIssue?.categoryName || '보완 요청',
      reason,
      assignee: '프로젝트 담당자',
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('ko-KR'),
      requestedAt: new Date().toLocaleString('ko-KR'),
      });
      setSheReviewDecision('supplement_requested');
    } catch {
      setAgentFailureTarget('legal-validation');
    } finally {
      setValidationConfirming(false);
    }
  };

  const renderProgress = () => (
    <InlineLoader title="법령 검증을 진행하고 있어요" body={validationStatusText || '사용내역서와 증빙 자료를 항목별로 맞춰 보고, 법령 기준과 인정 가능 금액을 함께 계산하고 있습니다.'} />
  );

  const renderIntro = () => (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 24 }}>
      <img src="/uploads/character.png" alt="캐릭터" style={{ width: 88, height: 'auto', flexShrink: 0, objectFit: 'contain' }} />
      <div style={{ flex: 1 }}>
        <div className="speech-bubble">
          <div style={{ fontSize: 16, fontWeight: 800, color: C.g800, lineHeight: 1.6 }}>업로드한 사용내역서와 증빙을 기준으로 산안비 적정성을 검증합니다.</div>
          <div style={{ fontSize: 13, color: C.g400, marginTop: 4 }}>9개 항목별 증빙, 문제 파일, 법령 근거, 인정 가능 금액을 함께 확인합니다.</div>
        </div>
      </div>
      <Button size="lg" onClick={handleVerify} disabled={status === 'loading'} style={{ flexShrink: 0, alignSelf: 'center' }}>{status === 'loading' ? '검증 중...' : status === 'done' ? '재검증하기' : '검증하기'}</Button>
    </div>
  );

  const renderEmpty = () => (
    <div style={{ padding: '48px 32px', borderRadius: 18, border: `2px dashed ${C.g200}`, textAlign: 'center', background: C.white }}>
      <div style={{ fontSize: 15, fontWeight: 900, color: C.g800, marginBottom: 6 }}>{canStartValidation ? (hideValidationIntro ? '검증 결과가 아직 없습니다' : '검증 준비 완료') : '업로드 완료 대기'}</div>
      <div style={{ fontSize: 13, color: C.g400, marginBottom: 16 }}>{canStartValidation ? '업로드한 사용내역서와 증빙을 기준으로 산안비 적정성을 검증합니다.' : '프로젝트 담당자가 업로드 완료를 눌러야 법령 검증을 시작할 수 있습니다.'}</div>
      <button type="button" onClick={handleVerify} disabled={status === 'loading' || !canStartValidation} style={{ border: 'none', borderRadius: 999, padding: '9px 18px', background: canStartValidation ? C.primary : C.g200, color: canStartValidation ? C.white : C.g400, fontFamily: 'inherit', fontSize: 13, fontWeight: 900, cursor: status === 'loading' ? 'wait' : canStartValidation ? 'pointer' : 'not-allowed', boxShadow: canStartValidation ? '0 10px 22px rgba(27, 94, 59, .24)' : 'none' }}>{status === 'loading' ? '검증 중...' : '법령 검증'}</button>
    </div>
  );

  const renderValidationPriorityBoard = () => {
    const filterTabs = [
      { id: 'all', label: '전체', count: categories.length },
      { id: 'inappropriate', label: '부적정', count: categories.filter((item) => item.decision === 'inappropriate').length },
      { id: 'conditional', label: '조건부', count: categories.filter((item) => item.decision === 'conditional').length },
      { id: 'appropriate', label: '적정', count: categories.filter((item) => item.decision === 'appropriate').length },
    ];
    const lanes = [
      {
        id: 'inappropriate',
        label: '부적정',
        description: '인정 불가 또는 금액 쟁점',
        items: filteredCategories.filter((item) => item.decision === 'inappropriate'),
        color: C.danger,
        bg: C.dangerBg,
      },
      {
        id: 'conditional',
        label: '조건부',
        description: '자료 보완 후 인정 가능',
        items: filteredCategories.filter((item) => item.decision === 'conditional'),
        color: C.warn,
        bg: C.warnBg,
      },
      {
        id: 'appropriate',
        label: '적정',
        description: '검증 기준 충족',
        items: filteredCategories.filter((item) => item.decision === 'appropriate'),
        color: C.ok,
        bg: '#F4FBF6',
      },
    ].filter((lane) => filter === 'all' || lane.id === filter);

    return <Card style={{ ...validationShellStyle, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '16px 18px', borderBottom: `1px solid ${C.g100}`, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, alignItems: 'center' }}>
        <div>
          <div style={validationSectionTitleStyle}>항목별 판단 현황</div>
        </div>
        <div style={{ display: 'inline-flex', gap: 4, padding: 4, border: `1px solid ${C.g100}`, borderRadius: 999, background: '#F7F9F8' }}>
          {filterTabs.map((item) => {
            const active = filter === item.id;
            return <button key={item.id} type="button" onClick={() => setFilter(item.id as ResultFilter)} style={{ border: 'none', background: active ? C.primary : 'transparent', color: active ? C.white : C.g600, borderRadius: 999, padding: '7px 11px', fontSize: 12, fontWeight: 850, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}>{item.label} {item.count}</button>;
          })}
        </div>
      </div>
      <div className="validation-lane-scroll" style={{ padding: 14, overflowX: 'auto', overflowY: 'hidden' }}>
        <div className="validation-lane-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${lanes.length || 1}, minmax(0, 1fr))`, gap: 10 }}>
          {lanes.map((lane) => (
            <section key={lane.id} style={{ border: `1px solid ${C.g100}`, borderRadius: 'var(--ui-radius-panel)', background: '#FBFCFB', overflow: 'hidden' }}>
              <div style={{ padding: '11px 12px', borderBottom: `1px solid ${C.g100}`, background: C.white, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: lane.color }}>{lane.label}</div>
                  <div style={{ marginTop: 3, fontSize: 10, fontWeight: 800, color: C.g500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lane.description}</div>
                </div>
                <span style={{ minWidth: 26, height: 26, borderRadius: 999, background: lane.bg, border: `1px solid ${lane.color}`, color: lane.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, flexShrink: 0 }}>{lane.items.length}</span>
              </div>
              <div style={{ padding: 8, display: 'grid', gap: 7 }}>
                {lane.items.length === 0 && <div style={{ padding: '16px 10px', borderRadius: 6, background: C.white, border: `1px dashed ${C.g200}`, textAlign: 'center', fontSize: 12, fontWeight: 800, color: C.g500 }}>해당 항목 없음</div>}
                {lane.items.map((item) => {
                  const selected = item.categoryId === selectedCategory?.categoryId;
                  const meta = decisionMeta[item.decision];
                  const risk = riskMeta[item.riskLevel];
                  return <button key={item.categoryId} type="button" onClick={() => setSelectedCategoryId(item.categoryId)} style={{ width: '100%', border: `1px solid ${selected ? meta.color : C.g100}`, borderRadius: 6, background: selected ? meta.bg : C.white, padding: '9px 10px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', boxShadow: selected ? '0 10px 20px rgba(31,55,43,.10)' : 'none' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 8, alignItems: 'start' }}>
                      <div style={{ minWidth: 0 }}>
                        <div title={item.categoryName} style={{ fontSize: 13, fontWeight: 900, color: selected ? meta.color : C.g800, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'keep-all' }}>{item.categoryName}</div>
                        <div style={{ marginTop: 4, fontSize: 11, fontWeight: 800, color: C.g500, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'keep-all' }}>{item.issues[0]?.title || '검증 기준 충족'}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginTop: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 850, color: risk.color }}>리스크 {risk.label}</span>
                          <span style={{ fontSize: 11, fontWeight: 900, color: item.disputedAmount > 0 ? C.danger : C.g500, fontVariantNumeric: 'tabular-nums' }}>{item.disputedAmount > 0 ? fmt(item.disputedAmount) : '-'}</span>
                        </div>
                      </div>
                    </div>
                  </button>;
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </Card>;
  };

  const renderSelectedValidationMemo = (item: CategoryValidationResult | null) => {
    if (!item) return null;
    const meta = decisionMeta[item.decision];
    const risk = riskMeta[item.riskLevel];
    const submittedCount = item.evidenceSummary.submittedFiles.length;
    const problemCount = item.evidenceSummary.problematicFiles.length;
    const missingCount = item.evidenceSummary.missingTypes.length;
    const evidenceFilesOpen = openEvidenceFileCategoryIds.includes(item.categoryId);
    const toggleEvidenceFilesOpen = () => {
      setOpenEvidenceFileCategoryIds((prev) => prev.includes(item.categoryId) ? prev.filter((id) => id !== item.categoryId) : [...prev, item.categoryId]);
    };

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

        <div data-validation-evidence-tooltip style={{ position: 'relative', border: `1px solid ${C.g100}`, borderRadius: 'var(--ui-radius-panel)' }}>
          <div style={{ padding: '11px 12px', background: '#F7F9F8', borderBottom: `1px solid ${C.g100}`, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: C.g800 }}>문제 및 누락 자료</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 850, color: C.g500 }}>제출 {submittedCount} · 문제 {problemCount} · 누락 {missingCount}</div>
              <button type="button" onClick={toggleEvidenceFilesOpen} disabled={submittedCount === 0} style={{ border: `1px solid ${evidenceFilesOpen ? C.primary : C.g200}`, borderRadius: 999, background: evidenceFilesOpen ? C.primary : C.white, color: submittedCount === 0 ? C.g400 : evidenceFilesOpen ? C.white : C.primary, padding: '4px 8px', fontSize: 10, fontWeight: 900, fontFamily: 'inherit', cursor: submittedCount === 0 ? 'not-allowed' : 'pointer' }}>제출 자료 보기</button>
            </div>
          </div>
          <div style={{ padding: 12, display: 'grid', gap: 9 }}>
            {(problemCount > 0 || missingCount > 0) && <div style={{ display: 'grid', gap: 7 }}>
              {item.evidenceSummary.problematicFiles.map((file) => <div key={file.fileName} style={{ fontSize: 12, fontWeight: 800, color: C.danger, lineHeight: 1.5 }}>{file.fileName} : <span style={{ color: C.g600 }}>{file.reason}</span></div>)}
              {missingCount > 0 && <div style={{ fontSize: 12, fontWeight: 800, color: C.warn, lineHeight: 1.5 }}>누락 자료 : <span style={{ color: C.g600 }}>{item.evidenceSummary.missingTypes.join(', ')}</span></div>}
            </div>}
          </div>
        </div>

        <div style={{ border: `1px solid ${C.g100}`, borderRadius: 'var(--ui-radius-panel)', overflow: 'hidden' }}>
          <div style={{ padding: '11px 12px', background: '#F7F9F8', borderBottom: `1px solid ${C.g100}`, fontSize: 13, fontWeight: 900, color: C.g800 }}>법령 근거</div>
          <div style={{ padding: 12, display: 'grid', gap: 9 }}>
            {item.legalBasis.map((basis) => <div key={`${basis.lawName}-${basis.article || ''}`}>
              <div style={{ fontSize: 12, fontWeight: 900, color: C.g800 }}>{basis.lawName} {basis.article || ''} {basis.clause || ''}</div>
              <div style={{ fontSize: 11, color: C.g600, lineHeight: 1.6, marginTop: 4 }}>{basis.agentReasoning}</div>
            </div>)}
          </div>
        </div>
      </div>
      </Card>
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none', border: `1px solid ${meta.border}`, borderRadius: 'var(--ui-radius-card)' }} />
      {evidenceFilesOpen && (
        <div data-validation-evidence-tooltip role="tooltip" style={{ position: 'absolute', top: 196, right: 24, zIndex: 30, width: 200, maxWidth: 'min(200px, calc(100vw - 48px))', border: `1px solid ${C.g200}`, borderRadius: 'var(--ui-radius-panel)', background: C.white, boxShadow: '0 14px 34px rgba(31,47,39,.16)', padding: 9 }}>
          <div style={{ position: 'absolute', top: -6, right: 24, width: 10, height: 10, borderTop: `1px solid ${C.g200}`, borderLeft: `1px solid ${C.g200}`, background: C.white, transform: 'rotate(45deg)' }} />
          <div style={{ fontSize: 11, fontWeight: 900, color: C.g600, marginBottom: 7 }}>제출된 파일명</div>
          <div style={{ display: 'grid', gap: 6, maxHeight: 180, overflowY: 'auto', paddingRight: 2 }}>
            {item.evidenceSummary.submittedFiles.map((file) => (
              <div key={`${file.kind}-${file.name}`} title={file.name} style={{ minWidth: 0, border: `1px solid ${C.g100}`, borderRadius: 6, background: '#FBFCFB', padding: '7px 9px', fontSize: 12, fontWeight: 850, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {file.name}
              </div>
            ))}
            {submittedCount === 0 && <span style={{ fontSize: 12, color: C.g500, fontWeight: 800 }}>제출된 증빙이 없습니다.</span>}
          </div>
        </div>
      )}
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
          return <div key={`${issue.categoryName}-${issue.title}`} style={{ border: `1px solid ${meta.border}`, borderRadius: 'var(--ui-radius-panel)', background: C.white, padding: 13 }}>
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
          </div>;
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
    const canRequestSupplement = Boolean(validationId && issues.length > 0 && !validationConfirming);
    const reviewButtonStyle = (color: string, active: boolean, disabled = !validationId || validationConfirming): CSSProperties => ({
      border: active ? 'none' : `1px solid ${C.g200}`,
      borderRadius: 999,
      padding: '9px 18px',
      minWidth: 82,
      background: active ? color : C.white,
      color: active ? C.white : C.g600,
      fontFamily: 'inherit',
      fontSize: 13,
      fontWeight: 900,
      cursor: disabled ? 'not-allowed' : 'pointer',
      textAlign: 'center',
      opacity: disabled ? 0.5 : 1,
      boxShadow: active ? '0 10px 22px rgba(27, 94, 59, .22)' : '0 7px 16px rgba(31, 55, 43, .08)',
    });

    return (
      <Card style={{ ...validationShellStyle, padding: '14px 16px', marginBottom: 12, border: `1px solid ${current.color}` }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 7 }}>
              <div style={{ fontSize: 15, fontWeight: 850, color: C.g800 }}>SHE 최종 판단</div>
              <span style={chipStyle(current.color, current.bg)}>{current.label}</span>
            </div>
            <div style={{ fontSize: 12, color: C.g600, lineHeight: 1.6 }}>{!validationId ? '검증 내용을 확인한 뒤 승인 또는 보완 요청을 보낼 수 있습니다.' : current.description}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', marginLeft: 'auto' }}>
            <button type="button" onClick={handleApproveValidation} disabled={!validationId || validationConfirming} style={reviewButtonStyle(C.ok, sheReviewDecision === 'review_completed')}>{validationConfirming ? '처리 중' : '검토 완료'}</button>
            <button type="button" onClick={handleSupplementRequest} disabled={!canRequestSupplement} style={reviewButtonStyle(C.warn, sheReviewDecision === 'supplement_requested', !canRequestSupplement)}>보완 요청</button>
          </div>
        </div>
      </Card>
    );
  };

  const renderDashboard = () => {
    if (categories.length === 0) {
      return <div className="screen-enter">
        <Card style={{ padding: '24px 26px' }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: C.g800 }}>검증 결과가 없습니다</div>
          <div style={{ fontSize: 13, color: C.g600, lineHeight: 1.6, marginTop: 8 }}>표시할 항목별 검증 결과가 없습니다. 사용내역서와 증빙 자료를 확인한 뒤 다시 검증해 주세요.</div>
          <Button size="sm" onClick={handleVerify} disabled={status === 'loading'} style={{ marginTop: 16 }}>{status === 'loading' ? '검증 중...' : '재검증하기'}</Button>
        </Card>
      </div>;
    }

    const inappropriateCount = categories.filter((item) => item.decision === 'inappropriate').length;
    const disputedTotal = sumBy(categories, 'disputedAmount');

    return <div className="screen-enter">
      {renderSheReviewPanel()}
      <Card style={{ ...validationShellStyle, padding: 0, marginBottom: 12, overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${C.g100}`, background: 'linear-gradient(135deg, #FFFFFF 0%, #F7FAF8 100%)', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 16, alignItems: 'start' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: C.g800, lineHeight: 1.28 }}>법령 검증</div>
              <span style={compactChipStyle(C.g600, C.white)}>{result.checkedAt}</span>
            </div>
            <div style={{ ...validationMutedTextStyle, marginTop: 6 }}>사용내역서, 증빙 서류의 법령 근거에 따른 검증 결과입니다.</div>
            {validationStatusText && <div style={{ marginTop: 10 }}><span style={compactChipStyle(C.ok, '#F4FBF6', '#D6EEDB')}>{validationStatusText}</span></div>}
          </div>
          <Button size="sm" onClick={handleVerify} disabled={status === 'loading'} style={{ alignSelf: 'start' }}>{status === 'loading' ? '검증 중...' : '재검증하기'}</Button>
        </div>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(320px, .75fr)', gap: 12, alignItems: 'start', marginBottom: 12 }}>
        {renderValidationPriorityBoard()}
        {renderSelectedValidationMemo(selectedCategory)}
      </div>
      {renderSupplementQueue(issues)}
    </div>;
  };

  return <div style={{ background: 'transparent' }}>
    {status !== 'done' && !hideValidationIntro && renderIntro()}
    {status === 'loading' && renderProgress()}
    {status === 'idle' && renderEmpty()}
    {status === 'done' && renderDashboard()}
    <CenterModal open={Boolean(agentFailureTarget)} title="처리 실패" body={agentFailureTarget ? getAgentFailureMessage(agentFailureTarget) : ''} actionLabel="확인" onAction={() => setAgentFailureTarget(null)} />
  </div>;
};

export default VerifyScreen;
