import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import CenterModal from '../../components/ui/CenterModal';
import InlineLoader from '../../components/ui/InlineLoader';
import Modal from '../../components/ui/Modal';
import { getAgentFailureMessage, type AgentFailureTarget } from '../../lib/agent-failure';
import { confirmValidation, getLatestValidation, getValidationStatus, runValidationAgent } from '../../lib/agent-api';
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

const fileKindLabel: Record<string, string> = {
  receipt: '영수증',
  site_photo: '현장사진',
  usage_statement: '사용내역서',
  tax_invoice: '세금내역서',
  other_document: '기타자료',
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

const getDecisionWeight = (decision: ValidationDecision) => {
  if (decision === 'inappropriate') return 3;
  if (decision === 'conditional') return 2;
  return 1;
};

const sumBy = (items: CategoryValidationResult[], key: 'usageAmount' | 'recognizedAmount' | 'disputedAmount') =>
  items.reduce((total, item) => total + item[key], 0);

const flattenIssues = (items: CategoryValidationResult[]) =>
  items.flatMap((item) => item.issues.map((issue) => ({ ...issue, categoryName: item.categoryName, decision: item.decision, riskLevel: item.riskLevel })));

const renderCategoryTableName = (item: CategoryValidationResult) => {
  if (item.categoryId !== 7) return item.categoryName;
  return <>
    건설재해예방전문지도기관<br />
    기술지도비
  </>;
};

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

const extractValidationUsageStatementId = (source: unknown) =>
  readNestedStringField(source, ['usageStatementId', 'usage_statement_id', 'statementId', 'statement_id']);

const extractValidationRunState = (source: unknown): ValidationRunState => {
  const rawStatus = readNestedStringField(source, ['status', 'statusCode', 'status_code', 'state', 'resultCode', 'result_code']).toLowerCase();
  if (!rawStatus) return 'unknown';
  if ([AGENT_LOG_STATUS.SUCCESS, 'completed', 'complete', 'done', 'succeeded', 'passed', 'confirmed', 'approved'].includes(rawStatus)) return 'done';
  if ([AGENT_LOG_STATUS.RUNNING, AGENT_LOG_STATUS.PENDING, 'processing', 'queued', 'started', 'in_progress'].includes(rawStatus)) return 'running';
  if ([AGENT_LOG_STATUS.FAIL, AGENT_LOG_STATUS.CANCELED, 'failed', 'failure', 'error', 'errored', 'cancelled'].includes(rawStatus)) return 'failed';
  return 'unknown';
};

const isCurrentUsageStatementValidation = (source: unknown, usageStatementId?: number) => {
  if (!usageStatementId) return true;
  const sourceStatementId = extractValidationUsageStatementId(source);
  return !sourceStatementId || sourceStatementId === String(usageStatementId);
};

const VerifyScreen = ({ projectId, usageStatementId, initialStatus = 'idle', hideValidationIntro = false, canStartValidation = true, onValidationComplete, onValidationApproved, onActionRequested }: VerifyScreenProps) => {
  const { user } = useCurrentUser();
  const [status, setStatus] = useState<VerifyStatus>(initialStatus);
  const [filter, setFilter] = useState<ResultFilter>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState(4);
  const [sheReviewDecision, setSheReviewDecision] = useState<SheReviewDecision>('pending');
  const [submittedEvidenceOpen, setSubmittedEvidenceOpen] = useState(false);
  const [manualSupplementOpen, setManualSupplementOpen] = useState(false);
  const [manualSupplementText, setManualSupplementText] = useState('');
  const [agentFailureTarget, setAgentFailureTarget] = useState<AgentFailureTarget | null>(null);
  const [openActionKeys, setOpenActionKeys] = useState<string[]>([]);
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
    if (!projectId || !usageStatementId) return;
    let cancelled = false;
    getLatestValidation(projectId)
      .then((latestValidation) => {
        if (cancelled || !isCurrentUsageStatementValidation(latestValidation, usageStatementId)) return;
        const latestValidationId = extractValidationId(latestValidation);
        const latestRunState = extractValidationRunState(latestValidation);
        if (latestValidationId) setValidationId(latestValidationId);
        if (latestRunState === 'done') {
          setStatus('done');
          setValidationStatusText('최신 검증 결과를 불러왔습니다.');
        } else if (latestRunState === 'running' && latestValidationId) {
          setStatus('loading');
          setValidationStatusText('기존 검증 작업을 확인하고 있습니다.');
        }
      })
      .catch(() => {
        // 최신 결과가 없어도 새 검증은 시작할 수 있으므로 조용히 무시합니다.
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, usageStatementId]);

  useEffect(() => {
    if (status !== 'loading' || !projectId || !validationId || validationId === EXAMPLE_VALIDATION_ID) return;
    let cancelled = false;
    const pollValidationStatus = async () => {
      try {
        const validationStatus = await getValidationStatus(projectId, validationId);
        if (cancelled) return;
        const runState = extractValidationRunState(validationStatus);
        if (runState === 'done') {
          setStatus('done');
          setValidationStatusText('검증이 완료되었습니다.');
          onValidationComplete?.();
        } else if (runState === 'failed') {
          setValidationId(EXAMPLE_VALIDATION_ID);
          setStatus('done');
          setValidationStatusText('검증 상태 조회 결과 실패가 반환되어 예시 검증 결과를 표시합니다.');
          onValidationComplete?.();
        } else {
          setValidationStatusText('검증 결과를 확인하고 있습니다.');
        }
      } catch {
        if (!cancelled) {
          setValidationId(EXAMPLE_VALIDATION_ID);
          setStatus('done');
          setValidationStatusText('검증 상태 조회 API 응답을 받지 못해 예시 검증 결과를 표시합니다.');
          onValidationComplete?.();
        }
      }
    };
    pollValidationStatus();
    const intervalId = window.setInterval(pollValidationStatus, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [onValidationComplete, projectId, status, validationId]);

  const handleVerify = async () => {
    if (!canStartValidation) return;
    try {
      setStatus('loading');
      setSelectedCategoryId(4);
      setSheReviewDecision('pending');
      setValidationStatusText('검증을 시작했습니다.');
      if (!projectId || !usageStatementId) throw new Error('검증 API 호출에 필요한 ID가 없습니다.');
      const validationRun = await runValidationAgent(projectId, usageStatementId, status === 'done');
      const nextValidationId = extractValidationId(validationRun);
      const runState = extractValidationRunState(validationRun);
      if (nextValidationId) setValidationId(nextValidationId);
      if (runState === 'failed') {
        throw new Error('검증 실행에 실패했습니다.');
      }
      if (runState === 'done' || !nextValidationId) {
        setStatus('done');
        setValidationStatusText('검증이 완료되었습니다.');
        onValidationComplete?.();
      } else {
        setValidationStatusText('검증 결과를 확인하고 있습니다.');
      }
    } catch {
      window.setTimeout(() => {
        setValidationId(EXAMPLE_VALIDATION_ID);
        setStatus('done');
        setValidationStatusText('검증 API 응답을 받지 못해 예시 검증 결과를 표시합니다.');
        onValidationComplete?.();
      }, 450);
    }
  };

  const handleApproveValidation = async () => {
    if (!projectId || !validationId || validationConfirming) return;
    setValidationConfirming(true);
    try {
      if (validationId !== EXAMPLE_VALIDATION_ID) {
        await confirmValidation(projectId, validationId, { decision: 'approved', comment: 'SHE 담당자 검토 완료' });
      }
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
    if (!issues.length) {
      setManualSupplementOpen(true);
      return;
    }
    const firstIssue = issues[0];
    const reason = firstIssue ? `${firstIssue.categoryName} 항목에서 ${firstIssue.title} 문제가 있습니다. ${firstIssue.requiredAction}` : '제출 자료를 다시 확인해 주세요.';
    if (!validationId || validationConfirming) return;
    setValidationConfirming(true);
    try {
      if (projectId && validationId !== EXAMPLE_VALIDATION_ID) {
        await confirmValidation(projectId, validationId, { decision: 'supplement_requested', comment: reason });
      }
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

    const handleManualSupplementSend = async () => {
      const message = manualSupplementText.trim();
      if (!message) return;
      if (!validationId || validationConfirming) return;
      setValidationConfirming(true);
      try {
        if (projectId && validationId !== EXAMPLE_VALIDATION_ID) {
          await confirmValidation(projectId, validationId, { decision: 'supplement_requested', comment: message });
        }
        onActionRequested?.({
        title: '보완 요청',
        reason: message,
        assignee: '프로젝트 담당자',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('ko-KR'),
        requestedAt: new Date().toLocaleString('ko-KR'),
        });
        setManualSupplementText('');
        setManualSupplementOpen(false);
        setSheReviewDecision('supplement_requested');
      } catch {
        setAgentFailureTarget('legal-validation');
      } finally {
        setValidationConfirming(false);
      }
  };

  const renderProgress = () => (
    <InlineLoader title="유효성 검증을 진행하고 있어요" body={validationStatusText || '사용내역서와 증빙 자료를 항목별로 맞춰 보고, 법령 기준과 인정 가능 금액을 함께 계산하고 있습니다.'} />
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
      <Button size="lg" onClick={handleVerify} disabled={status === 'loading'} style={{ flexShrink: 0, alignSelf: 'center' }}>{status === 'loading' ? '분석 중...' : status === 'done' ? '재검증하기' : '검증하기'}</Button>
    </div>
  );

  const renderEmpty = () => (
    <div style={{ padding: '48px 32px', borderRadius: 18, border: `2px dashed ${C.g200}`, textAlign: 'center', background: C.white }}>
      <div style={{ fontSize: 15, fontWeight: 900, color: C.g800, marginBottom: 6 }}>{canStartValidation ? (hideValidationIntro ? '검증 결과가 아직 없습니다' : '검증 준비 완료') : '업로드 완료 대기'}</div>
      <div style={{ fontSize: 13, color: C.g400, marginBottom: 16 }}>{canStartValidation ? '업로드한 사용내역서와 증빙을 기준으로 산안비 적정성을 검증합니다.' : '프로젝트 담당자가 업로드 완료를 눌러야 유효성 검증을 시작할 수 있습니다.'}</div>
      <button type="button" onClick={handleVerify} disabled={status === 'loading' || !canStartValidation} style={{ border: 'none', borderRadius: 999, padding: '9px 18px', background: canStartValidation ? C.primary : C.g200, color: canStartValidation ? C.white : C.g400, fontFamily: 'inherit', fontSize: 13, fontWeight: 900, cursor: status === 'loading' ? 'wait' : canStartValidation ? 'pointer' : 'not-allowed', boxShadow: canStartValidation ? '0 10px 22px rgba(27, 94, 59, .24)' : 'none' }}>{status === 'loading' ? '분석 중...' : '유효성 검증'}</button>
    </div>
  );

  const renderCategoryTable = () => {
    const thStyle: CSSProperties = { padding: '7px 8px', fontSize: 12, lineHeight: 1.25 };
    const tdStyle: CSSProperties = { padding: '7px 8px', fontSize: 12, lineHeight: 1.3 };
    const totalTdStyle: CSSProperties = { ...tdStyle, padding: '10px 8px' };
    const tableUsageTotal = sumBy(filteredCategories, 'usageAmount');
    const tableRecognizedTotal = sumBy(filteredCategories, 'recognizedAmount');
    const tableDisputedTotal = sumBy(filteredCategories, 'disputedAmount');

    return <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '11px 14px', borderBottom: `1px solid ${C.g100}`, display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 900, color: C.g800 }}>9개 항목 판정</span>
            <span style={{ fontSize: 11, fontWeight: 900, color: C.ok, background: '#F4FBF6', border: '1px solid #D6EEDB', borderRadius: 999, padding: '4px 8px' }}>인정률 {recognizedRate}%</span>
          </div>
          <div style={{ fontSize: 11, color: C.g400, marginTop: 2 }}>부적정 항목 우선 정렬</div>
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: '전체' },
            { id: 'inappropriate', label: '부적정' },
            { id: 'conditional', label: '조건부' },
            { id: 'appropriate', label: '적정' },
          ].map((item) => {
            const active = filter === item.id;
            return <button key={item.id} type="button" onClick={() => setFilter(item.id as ResultFilter)} style={{ border: active ? 'none' : `1px solid ${C.g200}`, background: active ? C.primary : C.white, color: active ? C.white : C.g600, borderRadius: 999, padding: '7px 13px', fontSize: 11, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer', boxShadow: active ? '0 9px 18px rgba(27, 94, 59, .22)' : '0 7px 16px rgba(31, 55, 43, .08)' }}>{item.label}</button>;
          })}
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th style={thStyle}>항목</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>사용내역서</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>인정 가능</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>쟁점 금액</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>판정</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>리스크</th>
            </tr>
          </thead>
          <tbody>
            {filteredCategories.map((item) => {
              const selected = item.categoryId === selectedCategory?.categoryId;
              const meta = decisionMeta[item.decision];
              const risk = riskMeta[item.riskLevel];
              return <tr key={item.categoryId} onClick={() => setSelectedCategoryId(item.categoryId)} style={{ cursor: 'pointer' }}>
                <td style={{ ...tdStyle, background: selected ? C.bg : undefined, fontWeight: 800, color: selected ? C.primary : C.g800 }}>{renderCategoryTableName(item)}</td>
                <td style={{ ...tdStyle, background: selected ? C.bg : undefined, textAlign: 'right', fontWeight: 600 }}>{fmt(item.usageAmount)}</td>
                <td style={{ ...tdStyle, background: selected ? C.bg : undefined, textAlign: 'right', fontWeight: 700, color: item.recognizedAmount === item.usageAmount ? C.ok : C.warn }}>{fmt(item.recognizedAmount)}</td>
                <td style={{ ...tdStyle, background: selected ? C.bg : undefined, textAlign: 'right', fontWeight: 900, color: item.disputedAmount > 0 ? C.danger : C.g400 }}>{item.disputedAmount > 0 ? fmt(item.disputedAmount) : '-'}</td>
                <td style={{ ...tdStyle, background: selected ? C.bg : undefined, textAlign: 'center' }}><span style={compactChipStyle(meta.color, meta.bg, meta.border)}>{meta.label}</span></td>
                <td style={{ ...tdStyle, background: selected ? C.bg : undefined, textAlign: 'center' }}><span style={compactChipStyle(risk.color, risk.bg)}>{risk.label}</span></td>
              </tr>;
            })}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ ...totalTdStyle, background: C.g100, fontWeight: 900, color: C.g800 }}>합계</td>
              <td style={{ ...totalTdStyle, background: C.g100, textAlign: 'right', fontWeight: 900, color: C.g800 }}>{fmt(tableUsageTotal)}</td>
              <td style={{ ...totalTdStyle, background: C.g100, textAlign: 'right', fontWeight: 900, color: C.ok }}>{fmt(tableRecognizedTotal)}</td>
              <td style={{ ...totalTdStyle, background: C.g100, textAlign: 'right', fontWeight: 900, color: tableDisputedTotal > 0 ? C.danger : C.g400 }}>{tableDisputedTotal > 0 ? fmt(tableDisputedTotal) : '-'}</td>
              <td style={{ ...totalTdStyle, background: C.g100 }} />
              <td style={{ ...totalTdStyle, background: C.g100 }} />
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>;
  };

  const renderEvidenceBlock = (item: CategoryValidationResult | null) => {
    if (!item) {
      return <Card style={{ padding: '18px 20px' }}>
        <div style={{ fontSize: 15, fontWeight: 900, color: C.g800 }}>선택 항목 없음</div>
        <div style={{ fontSize: 12, color: C.g400, lineHeight: 1.6, marginTop: 6 }}>표시할 항목별 검증 결과가 없습니다. 증빙과 사용내역서를 업로드한 뒤 다시 검증해 주세요.</div>
      </Card>;
    }
    const meta = decisionMeta[item.decision];
    return <Card style={{ padding: '18px 20px', border: `1px solid ${meta.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 900, color: C.g800 }}>{item.categoryId}. {item.categoryName}</div>
          <div style={{ fontSize: 12, color: C.g400, marginTop: 5 }}>선택 항목 상세 판단</div>
        </div>
        <span style={chipStyle(meta.color, meta.bg, meta.border)}>{meta.label}</span>
      </div>

      <section style={{ marginBottom: 14 }}>
        <button type="button" onClick={() => setSubmittedEvidenceOpen((open) => !open)} style={{ width: '100%', border: `1px solid ${C.g100}`, background: C.white, borderRadius: 10, padding: '9px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
          <span style={{ fontSize: 12, fontWeight: 900, color: C.g800 }}>제출 증빙</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 900, color: C.g400 }}>
            {item.evidenceSummary.submittedFiles.length}건
            <span style={{ color: C.g600 }}>{submittedEvidenceOpen ? '접기' : '펼치기'}</span>
          </span>
        </button>
        {submittedEvidenceOpen && <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 8 }}>
          {item.evidenceSummary.submittedFiles.map((file) => <div key={`${file.kind}-${file.name}`} style={{ display: 'grid', gridTemplateColumns: '74px minmax(0,1fr)', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 10, border: `1px solid ${C.g100}`, background: C.white }}>
            <span style={chipStyle(C.g600, C.g100)}>{fileKindLabel[file.kind]}</span>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 800, color: C.g800 }}>{file.name}</span>
          </div>)}
        </div>}
      </section>

      {(item.evidenceSummary.problematicFiles.length > 0 || item.evidenceSummary.missingTypes.length > 0) && <section style={{ marginBottom: 14 }}>
        <div style={{ padding: '12px 13px', borderRadius: 12, background: '#ffffff', border: `1px solid ${meta.border}` }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {item.evidenceSummary.problematicFiles.length > 0 && <div>
              <div style={{ fontSize: 11, fontWeight: 900, color: C.g800, marginBottom: 5 }}>문제 파일</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {item.evidenceSummary.problematicFiles.map((file) => <div key={file.fileName} style={{ padding: '8px 9px', borderRadius: 8, background: C.white, border: `1px solid ${C.g100}` }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: C.g800 }}>{file.fileName}</div>
                  <div style={{ fontSize: 11, color: C.g600, lineHeight: 1.2, marginTop: 3 }}>{file.reason}</div>
                </div>)}
              </div>
            </div>}
            {item.evidenceSummary.missingTypes.length > 0 && <div>
              <div style={{ fontSize: 11, fontWeight: 900, color: C.g800, marginBottom: 5 }}>누락 자료</div>
              <div style={{ padding: '8px 9px', borderRadius: 8, background: C.white, border: `1px solid ${C.g100}`, fontSize: 12, color: C.g800, lineHeight: 1.2 }}>
                {item.evidenceSummary.missingTypes.join(', ')}
              </div>
            </div>}
          </div>
        </div>
      </section>}

      <section>
        <div style={{ fontSize: 12, fontWeight: 900, color: C.g800, marginBottom: 8 }}>법령 agent 판단 근거</div>
        {item.legalBasis.map((basis) => <div key={`${basis.lawName}-${basis.article || ''}`} style={{ padding: '11px 12px', borderRadius: 10, background: '#F7F8FA', marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: C.g800 }}>{basis.lawName} {basis.article || ''} {basis.clause || ''}</div>
          <div style={{ fontSize: 11, color: C.g600, lineHeight: 1.65, marginTop: 5 }}>{basis.summary}</div>
          <div style={{ fontSize: 11, color: C.g800, lineHeight: 1.65, marginTop: 5 }}>{basis.agentReasoning}</div>
        </div>)}
      </section>
    </Card>;
  };

  const renderActionList = (list: (ValidationIssue & { categoryName: string; decision: ValidationDecision; riskLevel: ValidationRiskLevel })[]) => (
    <Card style={{ padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 900, color: C.g800 }}>담당자 조치 목록</div>
          <div style={{ fontSize: 12, color: C.g400, marginTop: 4 }}>현장에 바로 요청할 수 있는 보완 작업입니다.</div>
        </div>
        <span style={chipStyle(C.danger, C.dangerBg, '#FFCDD2')}>{list.length}건</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.map((issue) => {
          const meta = decisionMeta[issue.decision];
          const actionKey = `${issue.categoryName}-${issue.title}`;
          const open = openActionKeys.includes(actionKey);
          const toggleOpen = () => {
            setOpenActionKeys((prev) => prev.includes(actionKey) ? prev.filter((key) => key !== actionKey) : [...prev, actionKey]);
          };
          return <div key={`${issue.categoryName}-${issue.title}`} style={{ borderRadius: 12, border: `1px solid ${open ? meta.border : C.g200}`, background: open ? meta.bg : C.white, overflow: 'hidden' }}>
            <div role="button" tabIndex={0} onClick={toggleOpen} onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggleOpen();
              }
            }} style={{ width: '100%', border: 'none', background: 'transparent', padding: '12px 14px', cursor: 'pointer', fontFamily: 'inherit', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, alignItems: 'center', textAlign: 'left' }}>
              <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 18, color: C.g400, fontSize: 13, fontWeight: 900, flexShrink: 0 }}>{open ? '-' : '+'}</span>
                <div style={{ minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <div title={issue.title} style={{ fontSize: 13, fontWeight: 900, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{issue.title}</div>
                </div>
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                <span style={chipStyle(meta.color, meta.bg, meta.border)}>{meta.label}</span>
              </div>
            </div>
            {open && <div style={{ padding: '0 14px 14px 42px' }}>
              <div style={{ display: 'grid', gap: 8, borderTop: `1px solid ${meta.border}`, paddingTop: 12 }}>
                <div style={{ fontSize: 12, color: C.g600, lineHeight: 1.65 }}><strong style={{ color: C.g800 }}>사유:</strong> {issue.description}</div>
                <div style={{ fontSize: 12, color: C.g600, lineHeight: 1.65 }}><strong style={{ color: C.g800 }}>요청 사항:</strong> {issue.requiredAction}</div>
                <div style={{ fontSize: 12, color: C.g600, lineHeight: 1.65 }}><strong style={{ color: C.g800 }}>추가해야 할 자료:</strong> {issue.recommendedFiles.join(', ')}</div>
              </div>
            </div>}
          </div>;
        })}
      </div>
    </Card>
  );

  const renderSheReviewPanel = () => {
    if (!can(user, 'confirmFinalReport')) return null;

    const decisionMetaByStatus: Record<SheReviewDecision, { label: string; color: string; bg: string; description: string }> = {
      pending: { label: '검토 대기', color: C.g600, bg: C.g100, description: 'AI 판단 결과와 근거를 확인한 뒤 검토 완료 처리하거나 프로젝트 담당자에게 보완 요청을 보낼 수 있습니다.' },
      review_completed: { label: '검토 완료', color: C.ok, bg: '#F4FBF6', description: 'SHE 담당자가 검증 결과를 확인했습니다. 유효성 검토를 완료하고 보고서 탭으로 이동합니다.' },
      supplement_requested: { label: '보완 요청', color: C.warn, bg: C.warnBg, description: '프로젝트 담당자에게 보완 요청 상태를 반영했습니다. 사용내역서 또는 증빙 자료를 수정한 뒤 다시 업로드 완료를 누르면 재검토할 수 있습니다.' },
    };
    const current = decisionMetaByStatus[sheReviewDecision];
    const reviewButtonStyle = (color: string, active: boolean): CSSProperties => ({
      border: active ? 'none' : `1px solid ${C.g200}`,
      borderRadius: 999,
      padding: '9px 18px',
      minWidth: 82,
      background: active ? color : C.white,
      color: active ? C.white : C.g600,
      fontFamily: 'inherit',
      fontSize: 13,
      fontWeight: 900,
      cursor: !validationId || validationConfirming ? 'not-allowed' : 'pointer',
      textAlign: 'center',
      opacity: !validationId || validationConfirming ? 0.5 : 1,
      boxShadow: active ? '0 10px 22px rgba(27, 94, 59, .22)' : '0 7px 16px rgba(31, 55, 43, .08)',
    });

    return (
      <Card style={{ padding: '18px 20px', marginBottom: 12, border: `1px solid ${current.color}` }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 7 }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: C.g800 }}>SHE 최종 판단</div>
              <span style={chipStyle(current.color, current.bg)}>{current.label}</span>
            </div>
            <div style={{ fontSize: 12, color: C.g600, lineHeight: 1.6 }}>{!validationId ? '검증 작업 ID를 확인한 뒤 승인 또는 보완 요청을 보낼 수 있습니다.' : current.description}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', marginLeft: 'auto' }}>
            <button type="button" onClick={handleApproveValidation} disabled={!validationId || validationConfirming} style={reviewButtonStyle(C.ok, sheReviewDecision === 'review_completed')}>{validationConfirming ? '처리 중' : '검토 완료'}</button>
            <button type="button" onClick={handleSupplementRequest} disabled={!validationId || validationConfirming} style={reviewButtonStyle(C.warn, sheReviewDecision === 'supplement_requested')}>보완 요청</button>
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
          <Button size="sm" onClick={handleVerify} disabled={status === 'loading'} style={{ marginTop: 16 }}>{status === 'loading' ? '분석 중...' : '재검증하기'}</Button>
        </Card>
      </div>;
    }

    return <div className="screen-enter">
      <Card style={{ padding: '1px 5px', marginBottom: 8, background: 'transparent', border: 'none', boxShadow: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 14, color: C.g600 }}>검증일 {result.checkedAt}</div>
          </div>
          <Button size="sm" onClick={handleVerify} disabled={status === 'loading'}>{status === 'loading' ? '분석 중...' : '재검증하기'}</Button>
        </div>
      </Card>

      {renderSheReviewPanel()}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(300px, 1.0fr)', gap: 12, alignItems: 'start', marginBottom: 12 }}>
        {renderCategoryTable()}
        {renderEvidenceBlock(selectedCategory)}
      </div>
      {renderActionList(issues)}
    </div>;
  };

  return <div style={{ background: 'transparent' }}>
    {status !== 'done' && !hideValidationIntro && renderIntro()}
    {status === 'loading' && renderProgress()}
    {status === 'idle' && renderEmpty()}
    {status === 'done' && renderDashboard()}
    <CenterModal open={Boolean(agentFailureTarget)} title="처리 실패" body={agentFailureTarget ? getAgentFailureMessage(agentFailureTarget) : ''} actionLabel="확인" onAction={() => setAgentFailureTarget(null)} />
    <Modal open={manualSupplementOpen} onClose={() => setManualSupplementOpen(false)} maxWidth={560} zIndex={980}>
      <div style={{ background: C.white, border: `1px solid ${C.g200}`, borderRadius: 18, boxShadow: '0 18px 44px rgba(0,0,0,.16)', padding: 22 }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: C.g800, marginBottom: 6 }}>보완 요청 작성</div>
        <div style={{ fontSize: 13, color: C.g600, lineHeight: 1.6, marginBottom: 14 }}>담당자 조치 목록이 비어 있습니다. 프로젝트 담당자에게 보낼 보완 요청 내용을 직접 입력해 주세요.</div>
        <textarea value={manualSupplementText} onChange={(event) => setManualSupplementText(event.target.value)} placeholder="예: 사용내역서의 보호구 항목 증빙이 부족합니다. 지급대장과 착용 사진을 추가 제출해 주세요." style={{ width: '100%', minHeight: 140, resize: 'vertical', boxSizing: 'border-box', border: `1px solid ${C.g200}`, borderRadius: 12, padding: '12px 14px', outline: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, color: C.g800, lineHeight: 1.6 }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Button size="sm" variant="outline" onClick={() => setManualSupplementOpen(false)}>취소</Button>
          <Button size="sm" onClick={handleManualSupplementSend} disabled={!manualSupplementText.trim() || !validationId || validationConfirming}>{validationConfirming ? '처리 중' : '요청 전송'}</Button>
        </div>
      </div>
    </Modal>
  </div>;
};

export default VerifyScreen;
