import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChangeEventHandler, CSSProperties } from 'react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import CenterModal from '../../components/ui/CenterModal';
import { getAgentFailureMessage, type AgentFailureTarget } from '../../lib/agent-failure';
import { getReportDetail, isAgentRunningError, runReportAgent, saveReportDraft, waitForAgentButtonEnabled } from '../../lib/agent-api';
import type { ReportDraft } from '../../lib/report-draft';
import { C } from '../../lib/theme';

interface ReportScreenProps {
  contractName: string;
  projectId?: string;
  usageStatementId?: number;
  validationComplete?: boolean;
  reportGenerationEnabled?: boolean;
  reportDisabledReason?: string;
}

type ReportGenerationStatus = 'idle' | 'generating' | 'done';
type ReportWorkflowStatus = 'editing' | 'saved';

const REPORT_STEPS = ['항목별 판정 요약', '부적정 사유 정리', '보완 요청 문안 생성', '보고서 초안 저장'];

const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  usage_statement: '사용내역서',
  receipt: '영수증',
  transaction_statement: '거래명세서',
  site_photo: '현장사진',
  item_photo: '물품 사진',
  wearing_photo: '착용 확인 사진',
  work_photo: '작업 사진',
  tech_guidance_photo: '기술지도 사진',
  tax_invoice: '세금계산서',
  tax_invoice_confirm: '세금계산서 확인서',
  third_party_lookup: '제3자발급사실조회서',
  appointment_report: '선임 신고서',
  pay_stub: '급여명세서',
  wage_statement: '임금 지급 명세서',
  work_log: '업무일지',
  daily_output_log: '일일 출력일보',
  inspection_log: '점검일지',
  supply_ledger: '지급대장',
  inventory_ledger: '재고대장',
  edu_confirm: '교육 이수증',
  edu_attendance: '교육 참석자 명단',
  transfer_confirm: '이체확인증',
  health_checkup_result: '건강검진 결과서',
  health_checkup_contract: '건강검진 계약서',
  tech_guidance_contract: '기술지도 계약서',
  tech_guidance_report: '기술지도 보고서',
  analysis_table: '분석표',
  purchase_detail: '구매내역서',
  other_document: '기타 자료',
};

const normalizeEvidenceTypeLabel = (value: string) => {
  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase().replace(/[\s-]+/g, '_');
  return EVIDENCE_TYPE_LABELS[normalized] || trimmed;
};

const isAppropriateDecisionText = (value: string) => {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '');
  return ['적정', 'appropriate', 'valid', 'pass', 'passed'].includes(normalized);
};

const isReviewRequiredDecisionText = (value: string) => {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '');
  return ['검토필요', 'reviewrequired', 'needsreview'].includes(normalized);
};

const isGenericReviewRequiredText = (value: string) =>
  /(?:검토\s*필요|she\s*검토|review\s*required|needs?\s*review)/i.test(value);

const hasActionableIssueDetails = (draft: ReportDraft) => draft.issue_details.length > 0;

const normalizeReportSectionTable = (
  sectionId: string,
  table: ReportDraft['report_sections'][number]['tables'][number],
  hasIssues = true,
): ReportDraft['report_sections'][number]['tables'][number] => {
  if (sectionId === 'issue_details') {
    return {
      ...table,
      title: table.title?.replace(/^6\.(\d+)/, '5.$1') ?? table.title,
    };
  }
  if (sectionId === 'evidence_validation') {
    return {
      ...table,
      rows: table.rows.map((row) => row.map((cell, cellIndex) => cellIndex === 0 ? normalizeEvidenceTypeLabel(cell) : cell)),
    };
  }
  if (sectionId === 'execution_summary' && !hasIssues) {
    const noteIndex = table.headers.findIndex((header) => header.includes('비고'));
    const countIndex = table.headers.findIndex((header) => header.includes('건수'));
    if (noteIndex < 0) return table;
    return {
      ...table,
      rows: table.rows.map((row) => {
        const note = row[noteIndex] || '';
        if (!isGenericReviewRequiredText(note)) return row;
        return row.map((cell, index) => {
          if (index === noteIndex) return '특이사항 없음';
          if (index === countIndex) return '0건';
          return cell;
        });
      }),
    };
  }
  if (sectionId === 'item_reviews') {
    const decisionIndex = table.headers.findIndex((header) => header.includes('판정'));
    const reasonIndex = table.headers.findIndex((header) => header.includes('요약') || header.includes('사유'));
    if (decisionIndex < 0 || reasonIndex < 0) return table;
    return {
      ...table,
      rows: table.rows.map((row) => {
        const decision = row[decisionIndex] || '';
        const reason = row[reasonIndex] || '';
        const shouldNormalizeReason = isAppropriateDecisionText(decision) && isGenericReviewRequiredText(reason);
        const shouldNormalizeDecision = !hasIssues && isReviewRequiredDecisionText(decision);
        if (!shouldNormalizeReason && !shouldNormalizeDecision) return row;
        return row.map((cell, index) => {
          if (index === decisionIndex && shouldNormalizeDecision) return '적정';
          if (index === reasonIndex) return '특이사항 없음';
          return cell;
        });
      }),
    };
  }
  return table;
};

const normalizeReportDraftEvidenceLabels = (draft: ReportDraft): ReportDraft => {
  const hasIssues = hasActionableIssueDetails(draft);
  return {
    ...draft,
    category_summaries: draft.category_summaries.map((item) => {
      if (hasIssues || !isGenericReviewRequiredText(item.note)) return item;
      return { ...item, count: 0, note: '특이사항 없음' };
    }),
    item_reviews: draft.item_reviews.map((item) => {
      const shouldNormalizeReason = isAppropriateDecisionText(item.decision_label || item.decision) && isGenericReviewRequiredText(item.summary_reason);
      const shouldNormalizeDecision = !hasIssues && isReviewRequiredDecisionText(item.decision_label || item.decision);
      if (!shouldNormalizeReason && !shouldNormalizeDecision) return item;
      return {
        ...item,
        decision: shouldNormalizeDecision ? 'appropriate' : item.decision,
        decision_label: shouldNormalizeDecision ? '적정' : item.decision_label,
        summary_reason: '특이사항 없음',
        risk_level: shouldNormalizeDecision ? '낮음' : item.risk_level,
      };
    }),
    needs_human_review: hasIssues ? draft.needs_human_review : [],
    evidence_validation_summaries: draft.evidence_validation_summaries.map((item) => ({
      ...item,
      evidence_type_name: normalizeEvidenceTypeLabel(item.evidence_type_name || item.evidence_type_code),
    })),
    report_sections: draft.report_sections
      .filter((section) =>
        section.section_id !== 'tax_settlement'
        && section.section_id !== 'supplement_actions'
        && (hasIssues || section.section_id !== 'issue_details')
      )
      .map((section) => ({
        ...section,
        title:
          section.section_id === 'item_reviews' ? '4. 법령 적정성 검토 결과'
          : section.section_id === 'issue_details' ? '5. 부적정 및 검토 필요 상세 내역'
          : section.section_id === 'overall_opinion' ? `${hasIssues ? '6' : '5'}. 종합 의견`
          : section.title,
        tables: section.tables.map((table) => normalizeReportSectionTable(section.section_id, table, hasIssues)),
      })),
  };
};

const isReportDraft = (value: unknown): value is ReportDraft => {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<ReportDraft>;
  return typeof draft.report_no === 'string' && Array.isArray(draft.report_sections);
};

const getReportDraftSignature = (draft: ReportDraft | null) => {
  if (!draft) return null;
  return JSON.stringify(draft);
};

const asRecord = (value: unknown) => value && typeof value === 'object' ? value as Record<string, unknown> : {};

const readReportDraftFromAgentResponse = (response: Awaited<ReturnType<typeof runReportAgent>>) => {
  if (!response) return null;
  const result = asRecord(response.result);
  const report = asRecord(result.report);
  const reportNested = asRecord(report.result);
  return response.reportDraft
    || result.reportDraft
    || report.reportDraft
    || reportNested.reportDraft;
};

const readReportDraftFromDetail = (detail: Awaited<ReturnType<typeof getReportDetail>>) => {
  const details = typeof detail.details === 'string' ? JSON.parse(detail.details) as Record<string, unknown> : detail.details;
  const payload = asRecord(details.payload);
  return payload.reportDraft || details.reportDraft;
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
  fontSize: 12,
  fontWeight: 800,
  lineHeight: 1,
  whiteSpace: 'nowrap',
});

const reportGateChipStyle = (color: string, bg: string, border: string): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 22,
  padding: '4px 8px',
  borderRadius: 999,
  border: `1px solid ${border}`,
  background: bg,
  color,
  fontSize: 11,
  fontWeight: 800,
  lineHeight: 1,
  whiteSpace: 'nowrap',
});

const reportGateCardStyle: CSSProperties = {
  display: 'grid',
  gap: 8,
  margin: '16px auto 0',
  width: 'min(100%, 680px)',
  justifySelf: 'center',
  textAlign: 'left',
};

const reportInputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid transparent',
  borderRadius: 6,
  background: 'transparent',
  color: C.g800,
  fontFamily: 'inherit',
  fontSize: 15,
  fontWeight: 400,
  lineHeight: 1.75,
  outline: 'none',
  padding: '6px 8px',
};

const getTextareaHeight = (value: string, minHeight: number, lineHeightPx = 23, verticalPaddingPx = 18) => {
  const lineCount = Math.max(1, value.split('\n').length);
  const wrappedLineCount = value.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(line.length / 34)), 0);
  return Math.max(minHeight, Math.max(lineCount, wrappedLineCount) * lineHeightPx + verticalPaddingPx);
};

const getReportCellHeight = (sectionId: string, cellIndex: number, value: string) => {
  if (sectionId === 'item_reviews') {
    const wrapAt = cellIndex === 4 ? 46 : cellIndex === 1 ? 10 : 12;
    const minHeight = cellIndex === 4 ? 58 : 46;
    const wrappedLineCount = value.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(line.length / wrapAt)), 0);
    return Math.max(minHeight, wrappedLineCount * 24 + 18);
  }
  if (sectionId === 'issue_details') {
    const wrapAt = cellIndex === 0 ? 10 : 66;
    const wrappedLineCount = value.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(line.length / wrapAt)), 0);
    return Math.max(42, wrappedLineCount * 23 + 16);
  }
  return getTextareaHeight(value, 38);
};

interface AutoHeightTextareaProps {
  className?: string;
  value: string;
  onChange: ChangeEventHandler<HTMLTextAreaElement>;
  style: CSSProperties;
}

const AutoHeightTextarea = ({ className, value, onChange, style }: AutoHeightTextareaProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      className={className}
      value={value}
      onChange={onChange}
      style={{ ...style, resize: 'none', overflow: 'hidden' }}
    />
  );
};

const ReportScreen = ({ projectId, usageStatementId, validationComplete = false, reportGenerationEnabled = validationComplete, reportDisabledReason = '법령 검증 결과가 success 또는 HIL 상태일 때만 보고서를 생성할 수 있습니다.' }: ReportScreenProps) => {
  const [reportStatus, setReportStatus] = useState<ReportGenerationStatus>('idle');
  const [reportProgress, setReportProgress] = useState(0);
  const [reportWorkflowStatus, setReportWorkflowStatus] = useState<ReportWorkflowStatus>('editing');
  const [reportDraft, setReportDraft] = useState<ReportDraft | null>(null);
  const [savedAt, setSavedAt] = useState('');
  const [savePending, setSavePending] = useState(false);
  const [exportNoticeOpen, setExportNoticeOpen] = useState(false);
  const [docxExporting, setDocxExporting] = useState(false);
  const [agentFailureTarget, setAgentFailureTarget] = useState<AgentFailureTarget | null>(null);
  const [agentFailureMessage, setAgentFailureMessage] = useState('');

  const showAgentFailure = (target: AgentFailureTarget, error?: unknown) => {
    setAgentFailureTarget(target);
    setAgentFailureMessage(getAgentFailureMessage(target, error));
  };

  const showReportDraft = (draft: ReportDraft) => {
    setReportProgress(100);
    setReportDraft(normalizeReportDraftEvidenceLabels(draft));
    setReportStatus('done');
    setReportWorkflowStatus('editing');
    setSavedAt('');
  };

  useEffect(() => {
    let alive = true;
    if (!projectId || !usageStatementId || reportStatus === 'generating') return () => {
      alive = false;
    };
    getReportDetail(projectId, usageStatementId)
      .then((detail) => {
        if (!alive) return;
        const draft = readReportDraftFromDetail(detail);
        if (!isReportDraft(draft)) return;
        setReportProgress(100);
        setReportDraft(normalizeReportDraftEvidenceLabels(draft));
        setReportStatus('done');
        setReportWorkflowStatus('saved');
        setSavedAt('');
      })
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, [projectId, reportStatus, usageStatementId]);

  const waitForReportDraft = async (
    initialResponse: Awaited<ReturnType<typeof runReportAgent>>,
    previousDraftSignature?: string | null,
  ) => {
    const initialDraft = readReportDraftFromAgentResponse(initialResponse);
    if (isReportDraft(initialDraft)) return initialDraft;
    if (!projectId || !usageStatementId) return null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const detail = await getReportDetail(projectId, usageStatementId).catch(() => null);
      if (detail) {
        const draft = readReportDraftFromDetail(detail);
        if (isReportDraft(draft) && getReportDraftSignature(draft) !== previousDraftSignature) return draft;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 2500));
    }
    return null;
  };

  const handleReportGenerate = async (forceRegenerate = false) => {
    if (reportStatus === 'generating') return;
    const previousDraftSignature = forceRegenerate ? getReportDraftSignature(reportDraft) : null;
    try {
      if (!validationComplete || !reportGenerationEnabled || !projectId || !usageStatementId) {
        throw new Error('보고서 생성에 필요한 법령 검증 결과가 없습니다.');
      }
      setReportStatus('generating');
      setReportProgress(25);
      let response: Awaited<ReturnType<typeof runReportAgent>> = null;
      try {
        response = await runReportAgent(projectId, usageStatementId);
      } catch (error) {
        if (!isAgentRunningError(error)) throw error;
      }
      setReportProgress(55);
      await waitForAgentButtonEnabled(projectId, usageStatementId, 'report', {
        tolerateDisabledReason: true,
        onPoll: () => setReportProgress((current) => Math.min(current + 8, 88)),
      });
      setReportProgress(92);
      const reportDraft = await waitForReportDraft(response, previousDraftSignature);
      if (!isReportDraft(reportDraft)) throw new Error('보고서 Agent 응답에 reportDraft가 없습니다.');
      showReportDraft(reportDraft);
    } catch (error) {
      setReportStatus(reportDraft ? 'done' : 'idle');
      setReportProgress(0);
      showAgentFailure('server-request', error);
    }
  };

  const handleSaveDraft = async () => {
    if (!projectId || !usageStatementId || !reportDraft || savePending) return;
    setSavePending(true);
    try {
      const detail = await saveReportDraft(projectId, usageStatementId, reportDraft);
      const savedDraft = readReportDraftFromDetail(detail);
      if (isReportDraft(savedDraft)) {
        setReportDraft(normalizeReportDraftEvidenceLabels(savedDraft));
      }
      setReportWorkflowStatus('saved');
      setSavedAt(new Date().toLocaleString('ko-KR'));
    } catch (error) {
      showAgentFailure('server-request', error);
    } finally {
      setSavePending(false);
    }
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
    } catch (error) {
      showAgentFailure('server-request', error);
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
      if (table.headers.length === 0 && (sectionId === 'cover' || sectionId === 'issue_details')) return '144px minmax(0, 1fr)';
      if (table.headers.length === 0 && sectionId === 'basic_info') return '132px minmax(0, 1fr) 132px minmax(0, 1fr)';
      if (sectionId === 'execution_summary' && table.headers[0] === '집행 항목') return 'minmax(300px, 1.15fr) minmax(180px, .85fr) minmax(96px, .45fr) minmax(230px, .9fr)';
      if (sectionId === 'item_reviews' && table.headers[0] === 'No.') return '42px 128px 92px 70px minmax(460px, 1fr)';
      if (table.headers[0] === 'No.') return `44px repeat(${Math.max(0, table.headers.length - 1)}, minmax(132px, 1fr))`;
      return `repeat(${Math.max(table.headers.length, 1)}, minmax(0, 1fr))`;
    };
    const renderTemplateTable = (sectionIndex: number, tableIndex: number) => {
      const section = reportDraft.report_sections[sectionIndex];
      const table = normalizeReportSectionTable(section.section_id, section.tables[tableIndex]);
      const columnCount = Math.max(table.headers.length, ...table.rows.map((row) => row.length));
      const columnTemplate = getReportColumnTemplate(section.section_id, table);
      const minWidth = section.section_id === 'basic_info'
        ? 720
        : section.section_id === 'item_reviews'
          ? 792
        : table.headers[0] === 'No.'
            ? 860
            : Math.max(720, columnCount * 132);
      return <div key={tableIndex} style={{ width: '100%', maxWidth: '100%', minWidth: 0, marginTop: tableIndex === 0 ? 0 : 16 }}>
        {table.title !== null && (
          <div style={{ padding: '4px 0 8px', fontSize: 14, fontWeight: 600, color: C.g800 }}>{table.title}</div>
        )}
        <div className="thin-x-scroll" style={{ display: 'block', width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'auto', overflowY: 'hidden' }}>
          <div style={{ width: '100%', minWidth, boxSizing: 'border-box', border: `1px solid ${C.g200}`, borderBottom: 'none', borderRadius: 6, overflow: 'hidden', background: C.white }}>
            {table.headers.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: columnTemplate, background: '#F1F5F3', borderBottom: `1px solid ${C.g200}` }}>
              {table.headers.map((header) => <div key={header} style={{ padding: '9px 10px', borderRight: `1px solid ${C.g200}`, fontSize: 14, fontWeight: 600, color: C.g800, textAlign: 'left' }}>{header}</div>)}
            </div>}
            {table.rows.map((row, rowIndex) => {
              const rowHeight = Math.max(...row.map((cell, cellIndex) => getReportCellHeight(section.section_id, cellIndex, cell)));
              return (
              <div key={rowIndex} style={{ display: 'grid', gridTemplateColumns: columnTemplate, borderBottom: `1px solid ${C.g200}` }}>
                {row.map((cell, cellIndex) => {
                  const isLabel = isTemplateLabelCell(section.section_id, table.headers.length > 0, cellIndex, rowIndex, cell) || isLockedDataCell(section.section_id, tableIndex, table, cellIndex);
                  const commonCellStyle: CSSProperties = { minHeight: rowHeight, borderRight: cellIndex === row.length - 1 ? 'none' : `1px solid ${C.g200}`, background: isLabel ? '#F1F5F3' : C.white, color: isLabel ? C.g600 : C.g800, textAlign: 'left', fontSize: 14, fontWeight: isLabel ? 600 : 400 };
                  return isLabel
                    ? <div key={cellIndex} style={{ ...commonCellStyle, padding: '9px 10px', display: 'flex', alignItems: 'flex-start', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.65 }}>{cell}</div>
                    : <textarea className="report-edit-field" key={cellIndex} value={cell} rows={1} onChange={(event) => updateReportTableCell(sectionIndex, tableIndex, rowIndex, cellIndex, event.target.value)} style={{ ...reportInputStyle, ...commonCellStyle, height: rowHeight, resize: 'none', overflow: 'hidden', border: 'none', borderRight: commonCellStyle.borderRight, borderRadius: 0, padding: '9px 10px', whiteSpace: 'pre-wrap' }} />;
                })}
              </div>
              );
            })}
          </div>
        </div>
      </div>;
    };

    return <div className="report-document-scroll" style={{ borderRadius: 14, background: '#F7F8FA', padding: '22px 18px', maxHeight: 'min(820px, calc(100vh - 188px))', minHeight: 520, overflowY: 'auto', overflowX: 'hidden' }}>
      <div style={{ width: '100%', maxWidth: 920, boxSizing: 'border-box', minWidth: 0, margin: '0 auto', background: C.white, border: '1px solid #E0E7E2', boxShadow: '0 10px 24px rgba(31,47,39,.07)', padding: '40px 48px', display: 'grid', gap: 28 }}>
        <div style={{ textAlign: 'center', padding: '14px 0 8px' }}>
          <textarea className="report-edit-field" value={reportDraft.title} onChange={(event) => updateReportTopField('title', event.target.value)} style={{ ...reportInputStyle, resize: 'vertical', textAlign: 'center', fontSize: 23, fontWeight: 700, lineHeight: 1.45, minHeight: 72 }} />
        </div>
        {reportDraft.report_sections.map((section, sectionIndex) => (
          <section key={section.section_id} style={{ display: 'grid', gap: 12, minWidth: 0 }}>
            {section.section_id !== 'cover' && (
              <input className="report-edit-field" value={section.title} onChange={(event) => updateReportSectionTitle(sectionIndex, event.target.value)} style={{ ...reportInputStyle, border: 'none', borderBottom: `1px solid ${C.g200}`, borderRadius: 0, padding: '8px 0 9px', fontSize: 18, fontWeight: 700, background: 'transparent' }} />
            )}
            {section.paragraphs.map((paragraph, paragraphIndex) => {
              return (
                <AutoHeightTextarea
                  className="report-edit-field"
                  key={paragraphIndex}
                  value={paragraph}
                  onChange={(event) => updateReportParagraph(sectionIndex, paragraphIndex, event.target.value)}
                  style={{
                    ...reportInputStyle,
                    minHeight: section.kind === 'opinion' ? 96 : paragraph.length > 90 ? 86 : 46,
                    border: section.kind === 'opinion' ? `1px solid ${C.g200}` : '1px solid transparent',
                    background: section.kind === 'opinion' ? C.white : 'transparent',
                  }}
                />
              );
            })}
            {section.tables.map((_, tableIndex) => renderTemplateTable(sectionIndex, tableIndex))}
          </section>
        ))}
      </div>
    </div>;
  };

  const reportWorkflowMeta = {
    editing: { label: '초안 편집 가능', color: C.warn, bg: C.warnBg, description: '법령 검증 결과를 기반으로 생성된 초안입니다. 담당자 검토 후 저장해 주세요.' },
    saved: { label: '저장됨', color: C.ok, bg: '#F4FBF6', description: savedAt ? `마지막 저장: ${savedAt}` : '저장된 초안입니다.' },
  }[reportWorkflowStatus];
  const canGenerateReport = validationComplete && reportGenerationEnabled && Boolean(projectId && usageStatementId);
  const reportGenerateDisabledReason = !projectId || !usageStatementId
    ? '선택된 월의 사용내역서 정보가 없어 보고서를 생성할 수 없습니다.'
    : reportDisabledReason;
  const reportActionButtonStyle: CSSProperties = {
    fontSize: 13,
    padding: '8px 13px',
    boxShadow: `0 6px 14px ${C.primaryShadow}`,
  };
  const renderReportProgress = () => (
    <div style={{ margin: '16px auto 0', width: 'min(100%, 680px)' }}>
      <div style={{ height: 9, background: C.g100, borderRadius: 99, overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ height: '100%', width: `${reportProgress}%`, background: `linear-gradient(90deg,${C.primary},${C.light})`, borderRadius: 99, transition: 'width .3s' }} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
        {REPORT_STEPS.map((step, index) => (
          <span key={step} style={{ fontSize: 12, fontWeight: 700, color: reportProgress >= ((index + 1) * 100) / REPORT_STEPS.length ? C.primary : C.g400, background: C.g100, borderRadius: 999, padding: '5px 9px' }}>
            {step}
          </span>
        ))}
      </div>
    </div>
  );
  const renderReportGate = () => {
    if (reportStatus === 'done' && reportDraft) return null;
    if (canGenerateReport) return null;
    const missingProjectInfo = !projectId || !usageStatementId;
    const statusMeta = missingProjectInfo
      ? { label: '대기', color: C.g500, bg: C.g100, border: C.g200 }
      : { label: '미완료', color: C.warn, bg: C.warnBg, border: '#FFE082' };
    return (
      <div style={reportGateCardStyle}>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.g600 }}>보고서 생성 조건</div>
        <div style={{ border: `1px solid ${C.g200}`, borderRadius: 'var(--ui-radius-panel)', background: C.white, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'center', padding: '11px 12px' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: C.g800 }}>{missingProjectInfo ? '사용내역서 선택' : '법령 검증'}</span>
                <span style={reportGateChipStyle(C.primary, C.bg, C.light)}>필수</span>
              </div>
              <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700, color: C.g500, lineHeight: 1.45 }}>
                {missingProjectInfo ? '보고서를 생성할 월별 사용내역서를 먼저 선택해야 합니다.' : '법령 검증 탭에서 법령 검증을 먼저 실행해야 합니다.'}
              </div>
            </div>
            <span title={reportGenerateDisabledReason} style={reportGateChipStyle(statusMeta.color, statusMeta.bg, statusMeta.border)}>{statusMeta.label}</span>
          </div>
        </div>
      </div>
    );
  };
  const renderReportEmpty = () => (
    <Card style={{ padding: 24, marginBottom: 14, boxShadow: '0 1px 2px rgba(31,47,39,.04)' }}>
      <div style={{ padding: '48px 32px', minHeight: 360, borderRadius: 18, border: `2px dashed ${C.g200}`, textAlign: 'center', background: C.white, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.g800, marginBottom: 6 }}>
          {canGenerateReport ? '보고서 생성 준비 완료' : '보고서 생성 대기'}
        </div>
        <div style={{ fontSize: 14, color: C.g400, marginBottom: 16 }}>
          {canGenerateReport ? '법령 검증 결과를 기반으로 보고서 초안을 생성할 수 있습니다.' : reportGenerateDisabledReason}
        </div>
        <button
          type="button"
          onClick={() => handleReportGenerate(false)}
          disabled={reportStatus === 'generating' || !canGenerateReport}
          style={{ border: 'none', borderRadius: 999, padding: '9px 18px', background: canGenerateReport ? C.primary : C.g200, color: canGenerateReport ? C.white : C.g400, fontFamily: 'inherit', fontSize: 14, fontWeight: 800, cursor: reportStatus === 'generating' ? 'wait' : canGenerateReport ? 'pointer' : 'not-allowed', boxShadow: canGenerateReport ? `0 10px 22px ${C.primaryShadow}` : 'none' }}
        >
          {reportStatus === 'generating' ? '생성 중...' : '보고서 생성'}
        </button>
        {reportStatus === 'generating' && renderReportProgress()}
        {renderReportGate()}
      </div>
    </Card>
  );

  return <div className="screen-enter" style={{ width: '100%', maxWidth: '100%', background: 'transparent', margin: '0 auto' }}>
    {reportStatus === 'done' && reportDraft ? (
      <Card style={{ padding: '14px 16px', marginBottom: 14, boxShadow: '0 1px 2px rgba(31,47,39,.04)' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.g800 }}>보고서 생성</div>
              <span style={{ ...chipStyle(reportWorkflowMeta.color, reportWorkflowMeta.bg), minHeight: 22, fontSize: 11 }}>{reportWorkflowMeta.label}</span>
            </div>
            <div style={{ fontSize: 12, color: C.g400, marginTop: 4 }}>{reportWorkflowMeta.description}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end', marginLeft: 'auto' }}>
            <Button size="sm" onClick={() => handleReportGenerate(true)} disabled={!canGenerateReport} style={{ ...reportActionButtonStyle, boxShadow: canGenerateReport ? reportActionButtonStyle.boxShadow : 'none' }}>다시 생성하기</Button>
            <Button size="sm" variant="outline" onClick={handleSaveDraft} disabled={savePending || !reportDraft} style={{ ...reportActionButtonStyle, boxShadow: 'none' }}>{savePending ? '저장 중...' : '저장'}</Button>
            <Button size="sm" variant="outline" onClick={handleDocxExport} disabled={!reportDraft || docxExporting} style={reportActionButtonStyle}>{docxExporting ? '추출 중...' : 'DOCX 추출'}</Button>
          </div>
        </div>
      </Card>
    ) : renderReportEmpty()}

    {reportStatus === 'done' && renderReportEditor()}

    <CenterModal open={exportNoticeOpen} title="DOCX 추출" body="편집된 보고서를 DOCX 파일로 생성했습니다." actionLabel="확인" onAction={() => setExportNoticeOpen(false)} />
    <CenterModal open={Boolean(agentFailureTarget)} title="처리 실패" body={agentFailureMessage} actionLabel="확인" onAction={() => { setAgentFailureTarget(null); setAgentFailureMessage(''); }} />
  </div>;
};

export default ReportScreen;
