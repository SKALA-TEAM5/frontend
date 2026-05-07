import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import CenterModal from '../../components/ui/CenterModal';
import Modal from '../../components/ui/Modal';
import { addActionNotification } from '../../lib/action-notifications';
import { getAgentFailureMessage, type AgentFailureTarget } from '../../lib/agent-failure';
import { useCurrentUser } from '../../lib/dev-user';
import { can } from '../../lib/permissions';
import { getProjectById } from '../../lib/project-data';
import { buildReportDraftJson, type ReportDraft } from '../../lib/report-draft';
import { C } from '../../lib/theme';
import { VALIDATION_DASHBOARD_RESULT, fmt } from '../../lib/evidence-utils';
import type { CategoryValidationResult, ValidationDecision, ValidationIssue, ValidationRiskLevel } from '../../types/domain';

interface VerifyScreenProps {
  contractName: string;
  projectId?: string;
  initialTab?: VerifyTab;
  initialStatus?: VerifyStatus;
  hideValidationIntro?: boolean;
  onValidationApproved?: () => void;
}

type VerifyStatus = 'idle' | 'loading' | 'done';
type VerifyTab = 'dashboard' | 'report';
type ReportGenerationStatus = 'idle' | 'generating' | 'done';
type ReportWorkflowStatus = 'editing' | 'saved';
type SheReviewDecision = 'pending' | 'approved' | 'supplement_requested';
type ResultFilter = 'all' | ValidationDecision;
type AmountTooltip = {
  label: string;
  value: number;
  rate: number;
  color: string;
  detail: string;
  placement: 'top' | 'middle' | 'bottom' | 'left';
} | null;
type SummaryWidgetTooltip = {
  source: 'highRisk' | 'decision' | 'evidence';
  title: string;
  accent: string;
  rows: Array<{ label: string; value?: string; detail?: string; color?: string }>;
  placement?: 'right' | 'left';
} | null;

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

const VerifyScreen = ({ contractName, projectId, initialTab = 'dashboard', initialStatus = 'idle', hideValidationIntro = false, onValidationApproved }: VerifyScreenProps) => {
  const { user } = useCurrentUser();
  const [status, setStatus] = useState<VerifyStatus>(initialStatus);
  const [progress, setProgress] = useState(0);
  const [stepsDone, setStepsDone] = useState<string[]>([]);
  const [filter, setFilter] = useState<ResultFilter>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState(4);
  const [reportStatus, setReportStatus] = useState<ReportGenerationStatus>('idle');
  const [reportProgress, setReportProgress] = useState(0);
  const [reportWorkflowStatus, setReportWorkflowStatus] = useState<ReportWorkflowStatus>('editing');
  const [sheReviewDecision, setSheReviewDecision] = useState<SheReviewDecision>('pending');
  const [reportDraft, setReportDraft] = useState<ReportDraft | null>(null);
  const [savedAt, setSavedAt] = useState('');
  const [exportNoticeOpen, setExportNoticeOpen] = useState(false);
  const [docxExporting, setDocxExporting] = useState(false);
  const [amountTooltip, setAmountTooltip] = useState<AmountTooltip>(null);
  const [summaryWidgetTooltip, setSummaryWidgetTooltip] = useState<SummaryWidgetTooltip>(null);
  const [submittedEvidenceOpen, setSubmittedEvidenceOpen] = useState(false);
  const [manualSupplementOpen, setManualSupplementOpen] = useState(false);
  const [manualSupplementText, setManualSupplementText] = useState('');
  const [agentFailureTarget, setAgentFailureTarget] = useState<AgentFailureTarget | null>(null);
  const [sentActionKeys, setSentActionKeys] = useState<string[]>([]);
  const [openActionKeys, setOpenActionKeys] = useState<string[]>([]);
  const verifyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reportTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeTab: VerifyTab = initialTab;
  const result = VALIDATION_DASHBOARD_RESULT;
  const categories = result.categories ?? [];

  const STEPS = ['사용내역서 금액 구조화', '9개 항목별 증빙 매칭', '누락 및 문제 파일 탐지', '법령 agent 기준 검토', '인정 가능 금액 산정'];
  const REPORT_STEPS = ['항목별 판정 요약', '부적정 사유 정리', '보완 요청 문안 생성', '보고서 초안 저장'];

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => getDecisionWeight(b.decision) - getDecisionWeight(a.decision) || a.categoryId - b.categoryId),
    [categories],
  );
  const filteredCategories = filter === 'all' ? sortedCategories : sortedCategories.filter((item) => item.decision === filter);
  const selectedCategory = categories.find((item) => item.categoryId === selectedCategoryId) || sortedCategories[0] || null;
  const issues = useMemo(() => flattenIssues(categories), [categories]);
  const totalUsage = sumBy(categories, 'usageAmount');
  const totalRecognized = sumBy(categories, 'recognizedAmount');
  const totalDisputed = sumBy(categories, 'disputedAmount');
  const recognizedRate = totalUsage > 0 ? Math.round((totalRecognized / totalUsage) * 100) : 0;
  const counts = {
    appropriate: categories.filter((item) => item.decision === 'appropriate').length,
    conditional: categories.filter((item) => item.decision === 'conditional').length,
    inappropriate: categories.filter((item) => item.decision === 'inappropriate').length,
    highRisk: categories.filter((item) => item.riskLevel === 'high').length,
  };

  const clearVerifyTimer = () => {
    if (!verifyTimerRef.current) return;
    clearInterval(verifyTimerRef.current);
    verifyTimerRef.current = null;
  };

  const clearReportTimer = () => {
    if (!reportTimerRef.current) return;
    clearInterval(reportTimerRef.current);
    reportTimerRef.current = null;
  };

  useEffect(() => () => {
    clearVerifyTimer();
    clearReportTimer();
  }, []);

  useEffect(() => {
    if (initialStatus === 'done') setStatus('done');
  }, [initialStatus]);

  useEffect(() => {
    if (!reportDraft || reportDraft.report_sections.some((section) => section.section_id === 'tax_settlement')) return;
    const templateDraft = buildReportDraftJson(projectId ? getProjectById(projectId, user) : null, result, contractName);
    const taxSection = templateDraft.report_sections.find((section) => section.section_id === 'tax_settlement');
    if (!taxSection) return;
    setReportDraft((current) => {
      if (!current || current.report_sections.some((section) => section.section_id === 'tax_settlement')) return current;
      const evidenceIndex = current.report_sections.findIndex((section) => section.section_id === 'evidence_validation');
      const insertIndex = evidenceIndex >= 0 ? evidenceIndex + 1 : Math.min(4, current.report_sections.length);
      const report_sections = [...current.report_sections];
      report_sections.splice(insertIndex, 0, taxSection);
      return { ...current, report_sections };
    });
  }, [contractName, projectId, reportDraft, result, user]);

  const handleVerify = () => {
    clearVerifyTimer();
    try {
      setStatus('loading');
      setProgress(0);
      setStepsDone([]);
      setSelectedCategoryId(4);
      setReportStatus('idle');
      setReportDraft(null);
      setReportWorkflowStatus('editing');
      setSheReviewDecision('pending');
      setSavedAt('');
      let p = 0;
      let stepIndex = 0;
      verifyTimerRef.current = setInterval(() => {
        try {
          p += Math.random() * 12 + 7;
          if (p >= ((stepIndex + 1) * 100) / STEPS.length && stepIndex < STEPS.length) {
            setStepsDone((prev) => [...prev, STEPS[stepIndex]]);
            stepIndex += 1;
          }
          if (p >= 100) {
            clearVerifyTimer();
            setStatus('done');
          }
          setProgress(Math.min(p, 100));
        } catch {
          clearVerifyTimer();
          setStatus('idle');
          setAgentFailureTarget('legal-validation');
        }
      }, 320);
    } catch {
      setStatus('idle');
      setAgentFailureTarget('legal-validation');
    }
  };

  const handleReportGenerate = () => {
    if (status !== 'done') return;
    clearReportTimer();
    try {
      setReportStatus('generating');
      setReportProgress(0);
      let p = 0;
      reportTimerRef.current = setInterval(() => {
        try {
          p += Math.random() * 17 + 10;
          if (p >= 100) {
            clearReportTimer();
            setReportDraft(buildReportDraftJson(projectId ? getProjectById(projectId, user) : null, result, contractName));
            setReportStatus('done');
            setReportWorkflowStatus('editing');
            setSavedAt('');
          }
          setReportProgress(Math.min(p, 100));
        } catch {
          clearReportTimer();
          setReportStatus('idle');
          setAgentFailureTarget('report-generation');
        }
      }, 280);
    } catch {
      setReportStatus('idle');
      setAgentFailureTarget('report-generation');
    }
  };

  const handleSaveDraft = () => {
    setReportWorkflowStatus('saved');
    setSavedAt(new Date().toLocaleString('ko-KR'));
  };

  const handleDocxExport = async () => {
    if (!reportDraft || docxExporting) return;
    setDocxExporting(true);
    try {
      const response = await fetch('/api/report-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reportDraft),
      });
      if (!response.ok) throw new Error('DOCX export failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${reportDraft.report_no || 'report'}.docx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setExportNoticeOpen(true);
    } catch {
      setAgentFailureTarget('server-request');
    } finally {
      setDocxExporting(false);
    }
  };

  const updateReportTopField = (key: keyof Pick<ReportDraft, 'title' | 'report_no' | 'site_name' | 'report_period_label' | 'written_date_label' | 'department_label' | 'reviewer_label' | 'conclusion'>, value: string) => {
    setReportDraft((current) => current ? { ...current, [key]: value } : current);
    setReportWorkflowStatus('editing');
  };

  const updateReportSectionTitle = (sectionIndex: number, value: string) => {
    setReportDraft((current) => {
      if (!current) return current;
      const report_sections = current.report_sections.map((section, index) => index === sectionIndex ? { ...section, title: value } : section);
      return { ...current, report_sections };
    });
    setReportWorkflowStatus('editing');
  };

  const updateReportParagraph = (sectionIndex: number, paragraphIndex: number, value: string) => {
    setReportDraft((current) => {
      if (!current) return current;
      const report_sections = current.report_sections.map((section, index) => index === sectionIndex
        ? { ...section, paragraphs: section.paragraphs.map((paragraph, pIndex) => pIndex === paragraphIndex ? value : paragraph) }
        : section);
      return { ...current, report_sections };
    });
    setReportWorkflowStatus('editing');
  };

  const updateReportTableTitle = (sectionIndex: number, tableIndex: number, value: string) => {
    setReportDraft((current) => {
      if (!current) return current;
      const report_sections = current.report_sections.map((section, index) => index === sectionIndex
        ? { ...section, tables: section.tables.map((table, tIndex) => tIndex === tableIndex ? { ...table, title: value || null } : table) }
        : section);
      return { ...current, report_sections };
    });
    setReportWorkflowStatus('editing');
  };

  const updateReportTableCell = (sectionIndex: number, tableIndex: number, rowIndex: number, cellIndex: number, value: string) => {
    setReportDraft((current) => {
      if (!current) return current;
      const report_sections = current.report_sections.map((section, index) => index === sectionIndex
        ? {
          ...section,
          tables: section.tables.map((table, tIndex) => tIndex === tableIndex
            ? { ...table, rows: table.rows.map((row, rIndex) => rIndex === rowIndex ? row.map((cell, cIndex) => cIndex === cellIndex ? value : cell) : row) }
            : table),
        }
        : section);
      return { ...current, report_sections };
    });
    setReportWorkflowStatus('editing');
  };

  const handleSendActionNotification = (issue: ValidationIssue & { categoryName: string; decision: ValidationDecision; riskLevel: ValidationRiskLevel }) => {
    if (!can(user, 'requestAction')) return;
    const notificationKey = `${issue.categoryName}-${issue.title}`;
    const isAmountCorrection = issue.title.includes('금액') || issue.description.includes('초과') || issue.requiredAction.includes('정정');
    const message = isAmountCorrection
      ? `${issue.categoryName} 항목에서 ${issue.title} 문제가 있습니다. 인정 범위를 초과하거나 사용내역서와 증빙 금액이 맞지 않으니 초과분을 정정해 주세요.`
      : `${issue.categoryName} 항목에서 ${issue.title} 문제가 있습니다. ${issue.recommendedFiles.join(', ')} 자료를 제출해 주세요.`;
    const targetProject = projectId ? getProjectById(projectId, user) : null;
    addActionNotification({
      projectId,
      projectName: contractName,
      categoryName: issue.categoryName,
      title: issue.title,
      message,
      requestedFiles: issue.recommendedFiles,
      senderName: user.name,
      recipientUserName: targetProject?.manager,
      statusCode: 'open',
    });
    setSentActionKeys((prev) => prev.includes(notificationKey) ? prev : [...prev, notificationKey]);
  };

  const handleApproveValidation = () => {
    setSheReviewDecision('approved');
    onValidationApproved?.();
  };

  const handleSupplementRequest = () => {
    if (!can(user, 'requestAction')) return;
    if (!issues.length) {
      setManualSupplementOpen(true);
      return;
    }
    issues.forEach((issue) => handleSendActionNotification(issue));
    setSheReviewDecision('supplement_requested');
  };

  const handleManualSupplementSend = () => {
    const message = manualSupplementText.trim();
    if (!message) return;
    const targetProject = projectId ? getProjectById(projectId, user) : null;
    addActionNotification({
      projectId,
      projectName: contractName,
      categoryName: '수기 보완 요청',
      title: 'SHE 담당자 보완 요청',
      message,
      requestedFiles: [],
      senderName: user.name,
      recipientUserName: targetProject?.manager,
      statusCode: 'open',
    });
    setManualSupplementText('');
    setManualSupplementOpen(false);
    setSheReviewDecision('supplement_requested');
  };

  const renderProgress = () => (
    <Card style={{ marginBottom: 18, padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: C.g800 }}>AI 검증 실행 중</div>
        <div style={{ fontSize: 12, fontWeight: 900, color: C.primary }}>{Math.round(progress)}%</div>
      </div>
      <div style={{ height: 9, background: C.g100, borderRadius: 99, overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ height: '100%', width: `${progress}%`, background: `linear-gradient(90deg,${C.primary},${C.light})`, borderRadius: 99, transition: 'width .3s' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
        {STEPS.map((step, index) => {
          const done = stepsDone.includes(step);
          return <div key={step} style={{ padding: '9px 10px', borderRadius: 10, background: done ? C.bg : C.g100, color: done ? C.primary : C.g400, fontSize: 12, fontWeight: 800 }}>{done ? '완료' : `대기 ${index + 1}`} · {step}</div>;
        })}
      </div>
    </Card>
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
      <div style={{ fontSize: 15, fontWeight: 900, color: C.g800, marginBottom: 6 }}>{hideValidationIntro ? '검증 결과가 아직 없습니다' : '검증 준비 완료'}</div>
      <div style={{ fontSize: 13, color: C.g400, marginBottom: 16 }}>업로드한 사용내역서와 증빙을 기준으로 산안비 적정성을 검증합니다.</div>
      <button type="button" onClick={handleVerify} disabled={status === 'loading'} style={{ border: 'none', borderRadius: 999, padding: '9px 18px', background: C.primary, color: C.white, fontFamily: 'inherit', fontSize: 13, fontWeight: 900, cursor: status === 'loading' ? 'wait' : 'pointer', boxShadow: '0 10px 22px rgba(27, 94, 59, .24)' }}>{status === 'loading' ? '분석 중...' : '유효성 검증'}</button>
    </div>
  );

  const renderSummary = () => {
    const radius = 48;
    const circumference = 2 * Math.PI * radius;
    const recognizedLength = (totalRecognized / totalUsage) * circumference;
    const disputedLength = circumference - recognizedLength;
    const recognizedColor = C.ok;
    const disputedColor = C.danger;
    const totalTooltip: NonNullable<AmountTooltip> = { label: '총 사용내역서 금액', value: totalUsage, rate: 100, color: C.primary, detail: result.usageStatementFile, placement: 'top' };
    const recognizedTooltip: NonNullable<AmountTooltip> = { label: '인정 가능 금액', value: totalRecognized, rate: recognizedRate, color: recognizedColor, detail: `부적정/보완 금액 ${fmt(totalDisputed)} · ${counts.inappropriate + counts.conditional}개 항목 확인 필요`, placement: 'middle' };
    const disputedTooltip: NonNullable<AmountTooltip> = { label: '부적정/보완 금액', value: totalDisputed, rate: 100 - recognizedRate, color: C.danger, detail: `${counts.inappropriate + counts.conditional}개 항목에서 정정 또는 보완 자료가 필요합니다.`, placement: 'left' };
    const tooltipTop = amountTooltip?.placement === 'top' ? -6 : amountTooltip?.placement === 'bottom' ? 50 : 20;
    const tooltipPosition: CSSProperties = amountTooltip?.placement === 'left'
      ? { right: 'calc(100% - 70px)', top: 34 }
      : { left: 'calc(100% + 10px)', top: tooltipTop };
    const decisionBars = [
      { label: '적정', count: counts.appropriate, color: C.ok },
      { label: '조건부', count: counts.conditional, color: C.warn },
      { label: '부적정', count: counts.inappropriate, color: C.danger },
    ];
    const evidenceIssueBars = [
      { label: '문제 파일', count: categories.reduce((sum, item) => sum + item.evidenceSummary.problematicFiles.length, 0), color: C.danger },
      { label: '누락 자료', count: categories.reduce((sum, item) => sum + item.evidenceSummary.missingTypes.length, 0), color: C.warn },
      { label: '조치 요청', count: issues.length, color: C.primary },
    ];
    const maxEvidenceIssueCount = Math.max(1, ...evidenceIssueBars.map((item) => item.count));
    const highRiskRows = categories
      .filter((item) => item.riskLevel === 'high')
      .map((item) => ({
        label: item.categoryName,
        value: decisionMeta[item.decision].label,
        detail: item.issues[0]?.title || `쟁점 금액 ${fmt(item.disputedAmount)}`,
        color: decisionMeta[item.decision].color,
      }));
    const decisionRows = decisionBars.map((bar) => ({
      label: bar.label,
      value: `${bar.count}건`,
      detail: categories.filter((item) => decisionMeta[item.decision].label === bar.label).map((item) => item.categoryName).join(', ') || '해당 항목 없음',
      color: bar.color,
    }));
    const problematicFiles = categories.flatMap((item) => item.evidenceSummary.problematicFiles.map((file) => `${item.categoryName}: ${file.fileName}`));
    const missingEvidence = categories.flatMap((item) => item.evidenceSummary.missingTypes.map((missing) => `${item.categoryName}: ${missing}`));
    const evidenceRows = [
      { label: '문제 파일', value: `${problematicFiles.length}건`, detail: problematicFiles.join(', ') || '문제 파일 없음', color: C.danger },
      { label: '누락 자료', value: `${missingEvidence.length}건`, detail: missingEvidence.join(', ') || '누락 자료 없음', color: C.warn },
      { label: '조치 요청', value: `${issues.length}건`, detail: issues.map((issue) => `${issue.categoryName}: ${issue.title}`).join(', ') || '조치 요청 없음', color: C.primary },
    ];
    const renderWidgetTooltip = (source: NonNullable<SummaryWidgetTooltip>['source']) => {
      if (!summaryWidgetTooltip || summaryWidgetTooltip.source !== source) return null;
      const placementStyle: CSSProperties = summaryWidgetTooltip.placement === 'left'
        ? { right: 'calc(100% + 10px)', top: 8 }
        : { left: 'calc(100% + 10px)', top: 8 };
      return <div style={{ position: 'absolute', ...placementStyle, zIndex: 1100, width: 286, padding: '11px 12px', borderRadius: 6, background: C.white, border: `1px solid ${C.g200}`, boxShadow: '0 10px 24px rgba(0,0,0,.14)', pointerEvents: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
          <span style={{ width: 9, height: 9, borderRadius: 99, background: summaryWidgetTooltip.accent, flexShrink: 0 }} />
          <div style={{ fontSize: 12, fontWeight: 900, color: C.g800 }}>{summaryWidgetTooltip.title}</div>
        </div>
        <div style={{ display: 'grid', gap: 7 }}>
          {summaryWidgetTooltip.rows.map((row) => <div key={`${row.label}-${row.value || ''}`} style={{ paddingBottom: 7, borderBottom: `1px solid ${C.g100}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 900, color: C.g800 }}>{row.label}</span>
              {row.value && <span style={{ fontSize: 11, fontWeight: 900, color: row.color || summaryWidgetTooltip.accent, whiteSpace: 'nowrap' }}>{row.value}</span>}
            </div>
            {row.detail && <div style={{ marginTop: 3, fontSize: 10, color: C.g600, lineHeight: 1.45 }}>{row.detail}</div>}
          </div>)}
        </div>
      </div>;
    };

    return <div style={{ display: 'grid', gridTemplateColumns: '160px 160px minmax(280px, 340px) minmax(240px, 1fr)', gap: 12, alignItems: 'start', marginBottom: 14, overflow: 'visible' }}>
      <Card style={{ width: '100%', height: 160, boxSizing: 'border-box', padding: 14, position: 'relative', overflow: 'visible', display: 'grid', placeItems: 'center' }}>
        <div style={{ position: 'relative', width: 132, height: 132, display: 'grid', placeItems: 'center' }} onMouseLeave={() => setAmountTooltip(null)}>
          <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden="true">
            <circle cx="66" cy="66" r={radius} fill="none" stroke={C.g100} strokeWidth="16" />
            <circle cx="66" cy="66" r={radius} fill="none" stroke={recognizedColor} strokeWidth="16" strokeLinecap="butt" strokeDasharray={`${recognizedLength} ${circumference - recognizedLength}`} transform="rotate(-90 66 66)" style={{ cursor: 'help' }} onMouseEnter={() => setAmountTooltip(recognizedTooltip)} />
            <circle cx="66" cy="66" r={radius} fill="none" stroke={disputedColor} strokeWidth="16" strokeLinecap="butt" strokeDasharray={`${disputedLength} ${recognizedLength}`} strokeDashoffset={-recognizedLength} transform="rotate(-90 66 66)" style={{ cursor: 'help' }} onMouseEnter={() => setAmountTooltip(disputedTooltip)} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}>
            <div onMouseEnter={() => setAmountTooltip(totalTooltip)} style={{ pointerEvents: 'auto', cursor: 'help', padding: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.g800, lineHeight: 1.18 }}>인정률</div>
              <div style={{ fontSize: 21, fontWeight: 800, color: C.g800, lineHeight: 1.12 }}>{recognizedRate}%</div>
            </div>
          </div>
          {amountTooltip && <div style={{ position: 'absolute', ...tooltipPosition, zIndex: 1000, width: 238, padding: '10px 12px', borderRadius: 6, background: C.white, border: `1px solid ${C.g200}`, boxShadow: '0 8px 20px rgba(0,0,0,.12)', pointerEvents: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
              <span style={{ width: 9, height: 9, borderRadius: 99, background: amountTooltip.color, flexShrink: 0 }} />
              <div style={{ fontSize: 12, fontWeight: 900, color: C.g800 }}>{amountTooltip.label}</div>
            </div>
            <div style={{ fontSize: 17, fontWeight: 900, color: amountTooltip.color }}>{fmt(amountTooltip.value)}</div>
            <div style={{ fontSize: 11, color: C.g600, marginTop: 4, lineHeight: 1.55 }}>비율 {amountTooltip.rate}%</div>
            <div style={{ fontSize: 11, color: C.g600, marginTop: 4, lineHeight: 1.55 }}>{amountTooltip.detail}</div>
          </div>}
        </div>
      </Card>

      <div onMouseEnter={() => setSummaryWidgetTooltip({ source: 'highRisk', title: '고위험 항목 세부', accent: C.danger, rows: highRiskRows.length ? highRiskRows : [{ label: '고위험 항목 없음', detail: '현재 높은 리스크로 분류된 항목이 없습니다.' }] })} onMouseLeave={() => setSummaryWidgetTooltip(null)} style={{ position: 'relative', minWidth: 0 }}>
        <Card style={{ width: '100%', boxSizing: 'border-box', height: 160, borderRadius: 12, padding: '16px 16px', background: C.dangerBg, border: '1px solid #FFCDD2', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: C.danger }}>고위험 항목</div>
          <div style={{ fontSize: 34, fontWeight: 900, color: C.danger, marginTop: 6, lineHeight: 1 }}>{counts.highRisk}건</div>
          <div style={{ fontSize: 11, color: C.g600, marginTop: 9, lineHeight: 1.45 }}>부적정 판정 우선 검토</div>
        </Card>
        {renderWidgetTooltip('highRisk')}
      </div>

      <div onMouseEnter={() => setSummaryWidgetTooltip({ source: 'decision', title: '판정 분포 세부', accent: C.primary, rows: decisionRows })} onMouseLeave={() => setSummaryWidgetTooltip(null)} style={{ position: 'relative', minWidth: 0 }}>
        <Card style={{ width: '100%', boxSizing: 'border-box', minWidth: 0, height: 160, padding: '15px 16px' }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: C.g800, marginBottom: 12 }}>판정 분포</div>
          <div style={{ height: 13, borderRadius: 999, overflow: 'hidden', display: 'flex', background: C.g100, marginBottom: 12 }}>
            {decisionBars.map((bar) => <div key={bar.label} style={{ width: `${(bar.count / categories.length) * 100}%`, background: bar.color }} />)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {decisionBars.map((bar) => <div key={bar.label}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: bar.color }} />
                <span style={{ fontSize: 10, fontWeight: 900, color: C.g600 }}>{bar.label}</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: bar.color, lineHeight: 1 }}>{bar.count}</div>
            </div>)}
          </div>
        </Card>
        {renderWidgetTooltip('decision')}
      </div>

      <div onMouseEnter={() => setSummaryWidgetTooltip({ source: 'evidence', title: '증빙 이슈 세부', accent: C.warn, rows: evidenceRows, placement: 'left' })} onMouseLeave={() => setSummaryWidgetTooltip(null)} style={{ position: 'relative', minWidth: 0 }}>
        <Card style={{ width: '100%', boxSizing: 'border-box', minWidth: 0, height: 160, padding: '15px 16px' }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: C.g800, marginBottom: 11 }}>증빙 이슈</div>
          <div style={{ display: 'grid', gap: 9 }}>
            {evidenceIssueBars.map((item) => <div key={item.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 900, color: C.g600 }}>{item.label}</span>
                <span style={{ fontSize: 11, fontWeight: 900, color: item.color }}>{item.count}건</span>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: C.g100, overflow: 'hidden' }}>
                <div style={{ width: `${(item.count / maxEvidenceIssueCount) * 100}%`, height: '100%', borderRadius: 999, background: item.color }} />
              </div>
            </div>)}
          </div>
        </Card>
        {renderWidgetTooltip('evidence')}
      </div>
    </div>;
  };

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
          const notificationKey = `${issue.categoryName}-${issue.title}`;
          const sent = sentActionKeys.includes(notificationKey);
          const open = openActionKeys.includes(notificationKey);
          const toggleOpen = () => {
            setOpenActionKeys((prev) => prev.includes(notificationKey) ? prev.filter((key) => key !== notificationKey) : [...prev, notificationKey]);
          };
          const renderNotifyButton = () => (
            <button type="button" onClick={(event) => {
              event.stopPropagation();
              handleSendActionNotification(issue);
            }} disabled={sent} style={{ border: `1px solid ${sent ? C.g200 : C.primary}`, borderRadius: 999, padding: '7px 12px', background: sent ? C.g100 : C.white, color: sent ? C.g400 : C.primary, fontSize: 12, fontWeight: 900, fontFamily: 'inherit', cursor: sent ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
              {sent ? '알림 전송됨' : '알림 보내기'}
            </button>
          );
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
                  {can(user, 'requestAction') && <span style={{ flexShrink: 0 }}>{renderNotifyButton()}</span>}
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
      pending: { label: '검토 대기', color: C.g600, bg: C.g100, description: 'AI 판단 결과와 근거를 확인한 뒤 승인하거나 프로젝트 담당자에게 보완 요청을 보낼 수 있습니다.' },
      approved: { label: '승인', color: C.ok, bg: '#F4FBF6', description: 'SHE 담당자가 검증 결과를 승인했습니다. 유효성 검증을 완료하고 보고서 탭으로 이동합니다.' },
      supplement_requested: { label: '보완 요청', color: C.warn, bg: C.warnBg, description: '프로젝트 담당자에게 담당자 조치 목록의 보완 요청 알림을 전송했습니다.' },
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
      cursor: 'pointer',
      textAlign: 'center',
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
            <div style={{ fontSize: 12, color: C.g600, lineHeight: 1.6 }}>{current.description}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', marginLeft: 'auto' }}>
            <button type="button" onClick={handleApproveValidation} style={reviewButtonStyle(C.ok, sheReviewDecision === 'approved')}>승인</button>
            <button type="button" onClick={handleSupplementRequest} style={reviewButtonStyle(C.warn, sheReviewDecision === 'supplement_requested')}>보완 요청</button>
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
      <Card style={{ padding: '1px 5px', marginBottom: 8, background: C.soft, boxShadow: 'none' }}>
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

  const reportInputStyle: CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    border: `1px solid ${C.g200}`,
    borderRadius: 10,
    background: C.white,
    color: C.g800,
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 800,
    lineHeight: 1.5,
    outline: 'none',
    padding: '8px 10px',
  };

  const renderReportEditor = () => {
    if (!reportDraft) return null;
    const isTemplateLabelCell = (sectionId: string, hasHeaders: boolean, cellIndex: number, rowIndex: number, value: string) => {
      if (hasHeaders) return false;
      if (sectionId === 'cover' || sectionId === 'basic_info' || sectionId === 'issue_details') return cellIndex % 2 === 0;
      return rowIndex === 0 && cellIndex === 0 && Boolean(value);
    };
    const isLockedDataCell = (sectionId: string, tableIndex: number, table: ReportDraft['report_sections'][number]['tables'][number], cellIndex: number) =>
      (sectionId === 'execution_summary' && tableIndex === 1 && cellIndex === 0) || (table.headers[0] === 'No.' && cellIndex === 0);
    const getReportColumnTemplate = (sectionId: string, table: ReportDraft['report_sections'][number]['tables'][number]) => {
      if (table.headers.length === 0 && (sectionId === 'cover' || sectionId === 'issue_details')) return '150px minmax(0, 1fr)';
      if (table.headers.length === 0 && sectionId === 'basic_info') return '150px minmax(0, 1fr) 150px minmax(0, 1fr)';
      if (sectionId === 'supplement_actions' && table.headers[0] === 'No.') return '48px minmax(140px, 1fr) minmax(280px, 2.2fr) minmax(110px, .8fr) minmax(100px, .8fr)';
      if (table.headers[0] === 'No.') return `48px repeat(${Math.max(0, table.headers.length - 1)}, minmax(120px, 1fr))`;
      return `repeat(${Math.max(table.headers.length, 1)}, minmax(0, 1fr))`;
    };
    const renderTemplateTable = (sectionIndex: number, tableIndex: number) => {
      const section = reportDraft.report_sections[sectionIndex];
      const table = section.tables[tableIndex];
      const columnCount = Math.max(table.headers.length, ...table.rows.map((row) => row.length));
      const columnTemplate = getReportColumnTemplate(section.section_id, table);
      const minWidth = section.section_id === 'supplement_actions' ? 760 : Math.max(620, columnCount * 112);
      return <div key={tableIndex} style={{ marginTop: tableIndex === 0 ? 0 : 14 }}>
        {table.title !== null && (
          <div style={{ padding: '4px 0 8px', fontSize: 13, fontWeight: 900, color: C.g800 }}>{table.title}</div>
        )}
        <div className="thin-x-scroll" style={{ width: '100%', overflowX: 'auto' }}>
          <div style={{ minWidth, border: `1px solid ${C.g200}`, borderBottom: 'none' }}>
            {table.headers.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: columnTemplate, background: '#EEF3F0', borderBottom: `1px solid ${C.g200}` }}>
              {table.headers.map((header) => <div key={header} style={{ padding: '9px 10px', borderRight: `1px solid ${C.g200}`, fontSize: 12, fontWeight: 900, color: C.g800, textAlign: 'center' }}>{header}</div>)}
            </div>}
            {table.rows.map((row, rowIndex) => (
              <div key={rowIndex} style={{ display: 'grid', gridTemplateColumns: columnTemplate, borderBottom: `1px solid ${C.g200}` }}>
                {row.map((cell, cellIndex) => {
                  const isLabel = isTemplateLabelCell(section.section_id, table.headers.length > 0, cellIndex, rowIndex, cell) || isLockedDataCell(section.section_id, tableIndex, table, cellIndex);
                  const commonCellStyle: CSSProperties = { minHeight: 38, borderRight: cellIndex === row.length - 1 ? 'none' : `1px solid ${C.g200}`, background: isLabel ? '#EEF3F0' : C.white, color: isLabel ? C.g600 : C.g800, textAlign: table.headers.length > 0 && cellIndex > 0 ? 'center' : 'left', fontSize: 12, fontWeight: isLabel ? 900 : 800 };
                  return isLabel
                    ? <div key={cellIndex} style={{ ...commonCellStyle, padding: '9px 10px', display: 'flex', alignItems: 'center' }}>{cell}</div>
                    : <textarea key={cellIndex} value={cell} onChange={(event) => updateReportTableCell(sectionIndex, tableIndex, rowIndex, cellIndex, event.target.value)} style={{ ...reportInputStyle, ...commonCellStyle, resize: 'vertical', border: 'none', borderRight: commonCellStyle.borderRight, borderRadius: 0 }} />;
                })}
              </div>
            ))}
          </div>
        </div>
      </div>;
    };

    return <div style={{ border: `1px solid ${C.g200}`, borderRadius: 16, background: '#F7F8FA', padding: 16, maxHeight: 'min(760px, calc(100vh - 230px))', minHeight: 420, overflowY: 'auto', overflowX: 'hidden' }}>
      <div style={{ maxWidth: 880, margin: '0 auto', background: C.white, border: `1px solid ${C.g200}`, boxShadow: '0 10px 28px rgba(27,94,59,.08)', padding: '34px 36px', display: 'grid', gap: 22 }}>
        <div style={{ textAlign: 'center', padding: '24px 0 10px' }}>
          <textarea value={reportDraft.title} onChange={(event) => updateReportTopField('title', event.target.value)} style={{ ...reportInputStyle, border: 'none', resize: 'vertical', textAlign: 'center', fontSize: 24, fontWeight: 900, lineHeight: 1.4, minHeight: 84 }} />
        </div>
        {reportDraft.report_sections.map((section, sectionIndex) => (
          <section key={section.section_id} style={{ display: 'grid', gap: 10 }}>
            {section.section_id !== 'cover' && (
              <input value={section.title} onChange={(event) => updateReportSectionTitle(sectionIndex, event.target.value)} style={{ ...reportInputStyle, border: 'none', borderBottom: `2px solid ${C.g800}`, borderRadius: 0, padding: '10px 0 8px', fontSize: 17, fontWeight: 900, background: 'transparent' }} />
            )}
            {section.paragraphs.map((paragraph, paragraphIndex) => (
              <textarea key={paragraphIndex} value={paragraph} onChange={(event) => updateReportParagraph(sectionIndex, paragraphIndex, event.target.value)} style={{ ...reportInputStyle, minHeight: paragraph.length > 90 ? 78 : 42, resize: 'vertical', border: section.kind === 'opinion' ? `1px solid ${C.g200}` : 'none', background: section.kind === 'opinion' ? C.white : 'transparent', fontWeight: 700 }} />
            ))}
            {section.tables.map((_, tableIndex) => renderTemplateTable(sectionIndex, tableIndex))}
          </section>
        ))}
      </div>
    </div>;
  };

  const renderReport = () => {
    const canGenerateReport = status === 'done';
    const reportWorkflowMeta = {
      editing: { label: '초안 편집 가능', color: C.warn, bg: C.warnBg, description: '검증 결과를 기반으로 생성된 초안입니다. 담당자 검토 후 저장해 주세요.' },
      saved: { label: '저장됨', color: C.ok, bg: '#F4FBF6', description: savedAt ? `마지막 저장: ${savedAt}` : '저장된 초안입니다.' },
    }[reportWorkflowStatus];
    const reportActionButtonStyle: CSSProperties = {
      fontSize: 13,
      padding: '9px 14px',
      boxShadow: `0 6px 14px ${C.primaryShadow}`,
    };

    return <div className="screen-enter">
      <Card style={{ padding: '18px 20px', marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: C.g800 }}>보고서 생성</div>
            <div style={{ fontSize: 12, color: C.g400, marginTop: 5, lineHeight: 1.6 }}>{canGenerateReport ? '유효성 검증의 판정, 법령 근거, 보완 요청을 보고서 초안으로 정리합니다.' : '유효성 검증을 먼저 완료해야 보고서를 생성할 수 있습니다.'}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end', marginLeft: 'auto' }}>
            <Button size="sm" onClick={handleReportGenerate} disabled={!canGenerateReport || reportStatus === 'generating'} style={reportActionButtonStyle}>{reportStatus === 'generating' ? '생성 중...' : reportStatus === 'done' ? '다시 생성하기' : '보고서 생성하기'}</Button>
            <Button size="sm" variant="outline" onClick={handleDocxExport} disabled={reportStatus !== 'done' || !reportDraft || docxExporting} style={reportActionButtonStyle}>{docxExporting ? '추출 중...' : 'DOCX 추출'}</Button>
          </div>
        </div>
        {reportStatus === 'generating' && <div style={{ marginTop: 16 }}>
          <div style={{ height: 9, background: C.g100, borderRadius: 99, overflow: 'hidden', marginBottom: 10 }}><div style={{ height: '100%', width: `${reportProgress}%`, background: `linear-gradient(90deg,${C.primary},${C.light})`, borderRadius: 99, transition: 'width .3s' }} /></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{REPORT_STEPS.map((step, index) => <span key={step} style={{ fontSize: 11, fontWeight: 800, color: reportProgress >= ((index + 1) * 100) / REPORT_STEPS.length ? C.primary : C.g400, background: C.g100, borderRadius: 999, padding: '5px 9px' }}>{step}</span>)}</div>
        </div>}
      </Card>

      {canGenerateReport && reportStatus === 'idle' && <Card style={{ padding: '22px 24px', marginBottom: 18, background: '#F7F8FA', boxShadow: 'none', border: `1px solid ${C.g200}` }}>
        <div style={{ fontSize: 13, fontWeight: 900, color: C.g800 }}>보고서가 아직 생성되지 않았습니다</div>
        <div style={{ fontSize: 12, color: C.g600, lineHeight: 1.6, marginTop: 5 }}>보고서 생성하기를 눌러야 초안과 항목별 검토 결과가 생성됩니다.</div>
      </Card>}

      {reportStatus === 'done' && <Card style={{ padding: '18px 20px', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: C.g800 }}>보고서 편집/확정</div>
            <div style={{ display: 'inline-flex', marginTop: 8, ...chipStyle(reportWorkflowMeta.color, reportWorkflowMeta.bg) }}>{reportWorkflowMeta.label}</div>
            <div style={{ fontSize: 12, color: C.g400, marginTop: 8 }}>{reportWorkflowMeta.description}</div>
          </div>
          <Button size="sm" variant="outline" onClick={handleSaveDraft} style={reportActionButtonStyle}>저장</Button>
        </div>
        {renderReportEditor()}
      </Card>}

    </div>;
  };

  return <div style={{ background: C.soft }}>
    {activeTab === 'dashboard' && status !== 'done' && !hideValidationIntro && renderIntro()}
    {activeTab === 'dashboard' && status === 'loading' && renderProgress()}
    {activeTab === 'dashboard' && status === 'idle' && renderEmpty()}
    {activeTab === 'dashboard' && status === 'done' && renderDashboard()}
    {activeTab === 'report' && renderReport()}
    <CenterModal open={exportNoticeOpen} title="DOCX 추출" body="편집된 보고서를 DOCX 파일로 생성했습니다." actionLabel="확인" onAction={() => setExportNoticeOpen(false)} />
    <CenterModal open={Boolean(agentFailureTarget)} title="처리 실패" body={agentFailureTarget ? getAgentFailureMessage(agentFailureTarget) : ''} actionLabel="확인" onAction={() => setAgentFailureTarget(null)} />
    <Modal open={manualSupplementOpen} onClose={() => setManualSupplementOpen(false)} maxWidth={560} zIndex={980}>
      <div style={{ background: C.white, border: `1px solid ${C.g200}`, borderRadius: 18, boxShadow: '0 18px 44px rgba(0,0,0,.16)', padding: 22 }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: C.g800, marginBottom: 6 }}>보완 요청 알림 작성</div>
        <div style={{ fontSize: 13, color: C.g600, lineHeight: 1.6, marginBottom: 14 }}>담당자 조치 목록이 비어 있습니다. 프로젝트 담당자에게 보낼 보완 요청 내용을 직접 입력해 주세요.</div>
        <textarea value={manualSupplementText} onChange={(event) => setManualSupplementText(event.target.value)} placeholder="예: 사용내역서의 보호구 항목 증빙이 부족합니다. 지급대장과 착용 사진을 추가 제출해 주세요." style={{ width: '100%', minHeight: 140, resize: 'vertical', boxSizing: 'border-box', border: `1px solid ${C.g200}`, borderRadius: 12, padding: '12px 14px', outline: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, color: C.g800, lineHeight: 1.6 }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Button size="sm" variant="outline" onClick={() => setManualSupplementOpen(false)}>취소</Button>
          <Button size="sm" onClick={handleManualSupplementSend} disabled={!manualSupplementText.trim()}>알림 보내기</Button>
        </div>
      </div>
    </Modal>
  </div>;
};

export default VerifyScreen;
