import { useState } from 'react';
import type { CSSProperties } from 'react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import CenterModal from '../../components/ui/CenterModal';
import { getAgentFailureMessage, type AgentFailureTarget } from '../../lib/agent-failure';
import { getReportDetail, runReportAgent } from '../../lib/agent-api';
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
const SAMPLE_REPORT_AGENT_LOG_URL = '/templates/report-agent-sample-log.json';

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

const normalizeReportSectionTable = (
  sectionId: string,
  table: ReportDraft['report_sections'][number]['tables'][number],
): ReportDraft['report_sections'][number]['tables'][number] => {
  if (sectionId === 'supplement_actions') {
    return {
      ...table,
      headers: ['No.', '보완 항목', '실행 내용'],
      rows: table.rows.map((row) => [row[0] || '', row[1] || '', row[2] || '']),
    };
  }
  if (sectionId === 'evidence_validation') {
    return {
      ...table,
      rows: table.rows.map((row) => row.map((cell, cellIndex) => cellIndex === 0 ? normalizeEvidenceTypeLabel(cell) : cell)),
    };
  }
  return table;
};

const normalizeReportDraftEvidenceLabels = (draft: ReportDraft): ReportDraft => ({
  ...draft,
  evidence_validation_summaries: draft.evidence_validation_summaries.map((item) => ({
    ...item,
    evidence_type_name: normalizeEvidenceTypeLabel(item.evidence_type_name || item.evidence_type_code),
  })),
  report_sections: draft.report_sections.map((section) => ({
    ...section,
    tables: section.tables.map((table) => normalizeReportSectionTable(section.section_id, table)),
  })),
});

const isReportDraft = (value: unknown): value is ReportDraft => {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<ReportDraft>;
  return typeof draft.report_no === 'string' && Array.isArray(draft.report_sections);
};

const asRecord = (value: unknown) => value && typeof value === 'object' ? value as Record<string, unknown> : {};

const readReportDraftFromAgentResponse = (response: Awaited<ReturnType<typeof runReportAgent>>) => {
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

const readReportDraftFromSampleLog = (log: Record<string, unknown>) => {
  const payload = asRecord(log.payload);
  const payloadResult = asRecord(payload.result);
  const payloadResultNested = asRecord(payloadResult.result);
  return payloadResultNested.reportDraft;
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

const reportInputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid transparent',
  borderRadius: 6,
  background: 'transparent',
  color: C.g800,
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 500,
  lineHeight: 1.75,
  outline: 'none',
  padding: '6px 8px',
};

const ReportScreen = ({ projectId, usageStatementId, validationComplete = false, reportGenerationEnabled = validationComplete, reportDisabledReason = '법령 검증 결과가 success 또는 HIL 상태일 때만 보고서를 생성할 수 있습니다.' }: ReportScreenProps) => {
  const [reportStatus, setReportStatus] = useState<ReportGenerationStatus>('idle');
  const [reportProgress, setReportProgress] = useState(0);
  const [reportWorkflowStatus, setReportWorkflowStatus] = useState<ReportWorkflowStatus>('editing');
  const [reportDraft, setReportDraft] = useState<ReportDraft | null>(null);
  const [savedAt, setSavedAt] = useState('');
  const [exportNoticeOpen, setExportNoticeOpen] = useState(false);
  const [docxExporting, setDocxExporting] = useState(false);
  const [agentFailureTarget, setAgentFailureTarget] = useState<AgentFailureTarget | null>(null);

  const showReportDraft = (draft: ReportDraft) => {
    setReportProgress(100);
    setReportDraft(normalizeReportDraftEvidenceLabels(draft));
    setReportStatus('done');
    setReportWorkflowStatus('editing');
    setSavedAt('');
  };

  const handleReportGenerate = async () => {
    if (reportStatus === 'generating') return;
    try {
      if (!validationComplete || !reportGenerationEnabled || !projectId || !usageStatementId) {
        throw new Error('보고서 생성에 필요한 법령 검증 결과가 없습니다.');
      }
      setReportStatus('generating');
      setReportProgress(25);
      const response = await runReportAgent(projectId, usageStatementId);
      const reportDraft = readReportDraftFromAgentResponse(response)
        || readReportDraftFromDetail(await getReportDetail(projectId, usageStatementId));
      if (!isReportDraft(reportDraft)) throw new Error('보고서 Agent 응답에 reportDraft가 없습니다.');
      showReportDraft(reportDraft);
    } catch {
      setReportStatus('idle');
      setReportProgress(0);
      setAgentFailureTarget('server-request');
    }
  };

  const handleSampleReportLoad = async () => {
    if (reportStatus === 'generating') return;
    try {
      setReportStatus('generating');
      setReportProgress(25);
      const response = await fetch(SAMPLE_REPORT_AGENT_LOG_URL);
      if (!response.ok) throw new Error('sample report log load failed');
      const log = await response.json() as Record<string, unknown>;
      const reportDraft = readReportDraftFromSampleLog(log);
      if (!isReportDraft(reportDraft)) throw new Error('샘플 로그에 reportDraft가 없습니다.');
      showReportDraft(reportDraft);
    } catch {
      setReportStatus('idle');
      setReportProgress(0);
      setAgentFailureTarget('server-request');
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
      if (sectionId === 'supplement_actions' && table.headers[0] === 'No.') return '44px minmax(210px, 1.1fr) minmax(420px, 2fr)';
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
        : section.section_id === 'supplement_actions'
          ? 920
          : table.headers[0] === 'No.'
            ? 860
            : Math.max(720, columnCount * 132);
      return <div key={tableIndex} style={{ marginTop: tableIndex === 0 ? 0 : 16 }}>
        {table.title !== null && (
          <div style={{ padding: '4px 0 8px', fontSize: 13, fontWeight: 700, color: C.g800 }}>{table.title}</div>
        )}
        <div className="thin-x-scroll" style={{ width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'auto' }}>
          <div style={{ width: 'max-content', minWidth, maxWidth: 'none', border: `1px solid ${C.g200}`, borderBottom: 'none', borderRadius: 6, overflow: 'hidden', background: C.white }}>
            {table.headers.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: columnTemplate, background: '#F1F5F3', borderBottom: `1px solid ${C.g200}` }}>
              {table.headers.map((header) => <div key={header} style={{ padding: '9px 10px', borderRight: `1px solid ${C.g200}`, fontSize: 13, fontWeight: 700, color: C.g800, textAlign: 'center' }}>{header}</div>)}
            </div>}
            {table.rows.map((row, rowIndex) => (
              <div key={rowIndex} style={{ display: 'grid', gridTemplateColumns: columnTemplate, borderBottom: `1px solid ${C.g200}` }}>
                {row.map((cell, cellIndex) => {
                  const isLabel = isTemplateLabelCell(section.section_id, table.headers.length > 0, cellIndex, rowIndex, cell) || isLockedDataCell(section.section_id, tableIndex, table, cellIndex);
                  const commonCellStyle: CSSProperties = { minHeight: 38, borderRight: cellIndex === row.length - 1 ? 'none' : `1px solid ${C.g200}`, background: isLabel ? '#F1F5F3' : C.white, color: isLabel ? C.g600 : C.g800, textAlign: table.headers.length > 0 && cellIndex > 0 ? 'center' : 'left', fontSize: 13, fontWeight: isLabel ? 700 : 500 };
                  return isLabel
                    ? <div key={cellIndex} style={{ ...commonCellStyle, padding: '9px 10px', display: 'flex', alignItems: 'center' }}>{cell}</div>
                    : <textarea className="report-edit-field" key={cellIndex} value={cell} onChange={(event) => updateReportTableCell(sectionIndex, tableIndex, rowIndex, cellIndex, event.target.value)} style={{ ...reportInputStyle, ...commonCellStyle, resize: 'vertical', border: 'none', borderRight: commonCellStyle.borderRight, borderRadius: 0, padding: '9px 10px' }} />;
                })}
              </div>
            ))}
          </div>
        </div>
      </div>;
    };

    return <div className="report-document-scroll" style={{ borderRadius: 14, background: '#F7F8FA', padding: '22px 18px', maxHeight: 'min(820px, calc(100vh - 188px))', minHeight: 520, overflowY: 'auto', overflowX: 'hidden' }}>
      <div style={{ width: '100%', maxWidth: 920, boxSizing: 'border-box', minWidth: 0, margin: '0 auto', background: C.white, border: '1px solid #E0E7E2', boxShadow: '0 10px 24px rgba(31,47,39,.07)', padding: '40px 48px', display: 'grid', gap: 28 }}>
        <div style={{ textAlign: 'center', padding: '14px 0 8px' }}>
          <textarea className="report-edit-field" value={reportDraft.title} onChange={(event) => updateReportTopField('title', event.target.value)} style={{ ...reportInputStyle, resize: 'vertical', textAlign: 'center', fontSize: 22, fontWeight: 800, lineHeight: 1.45, minHeight: 72 }} />
        </div>
        {reportDraft.report_sections.map((section, sectionIndex) => (
          <section key={section.section_id} style={{ display: 'grid', gap: 12, minWidth: 0 }}>
            {section.section_id !== 'cover' && (
              <input className="report-edit-field" value={section.title} onChange={(event) => updateReportSectionTitle(sectionIndex, event.target.value)} style={{ ...reportInputStyle, border: 'none', borderBottom: `1px solid ${C.g200}`, borderRadius: 0, padding: '8px 0 9px', fontSize: 17, fontWeight: 800, background: 'transparent' }} />
            )}
            {section.paragraphs.map((paragraph, paragraphIndex) => (
              <textarea className="report-edit-field" key={paragraphIndex} value={paragraph} onChange={(event) => updateReportParagraph(sectionIndex, paragraphIndex, event.target.value)} style={{ ...reportInputStyle, minHeight: paragraph.length > 90 ? 86 : 46, resize: 'vertical', border: section.kind === 'opinion' ? `1px solid ${C.g200}` : '1px solid transparent', background: section.kind === 'opinion' ? C.white : 'transparent' }} />
            ))}
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
    fontSize: 12,
    padding: '8px 13px',
    boxShadow: `0 6px 14px ${C.primaryShadow}`,
  };

  return <div className="screen-enter" style={{ background: 'transparent', maxWidth: 1040, margin: '0 auto' }}>
    <Card style={{ padding: '14px 16px', marginBottom: 14, boxShadow: '0 1px 2px rgba(31,47,39,.04)' }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.g800 }}>보고서 생성</div>
            {reportStatus === 'done' && <span style={{ ...chipStyle(reportWorkflowMeta.color, reportWorkflowMeta.bg), minHeight: 22, fontSize: 10 }}>{reportWorkflowMeta.label}</span>}
          </div>
          <div style={{ fontSize: 12, color: canGenerateReport ? C.g400 : C.warn, marginTop: 5, lineHeight: 1.6 }}>{canGenerateReport ? '법령 검증의 판정, 법령 근거, 보완 요청을 보고서 초안으로 정리합니다.' : reportGenerateDisabledReason}</div>
          {reportStatus === 'done' && <div style={{ fontSize: 11, color: C.g400, marginTop: 4 }}>{reportWorkflowMeta.description}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end', marginLeft: 'auto' }}>
          <span title={!canGenerateReport ? reportGenerateDisabledReason : undefined} style={{ display: 'inline-flex' }}>
            <Button size="sm" onClick={handleReportGenerate} disabled={reportStatus === 'generating' || !canGenerateReport} style={{ ...reportActionButtonStyle, boxShadow: canGenerateReport ? reportActionButtonStyle.boxShadow : 'none' }}>{reportStatus === 'generating' ? '생성 중...' : reportStatus === 'done' ? '다시 생성하기' : '보고서 생성하기'}</Button>
          </span>
          <Button size="sm" variant="outline" onClick={handleSampleReportLoad} disabled={reportStatus === 'generating'} style={reportActionButtonStyle}>샘플 로그 보기</Button>
          {reportStatus === 'done' && <Button size="sm" variant="outline" onClick={handleSaveDraft} style={{ ...reportActionButtonStyle, boxShadow: 'none' }}>저장</Button>}
          <Button size="sm" variant="outline" onClick={handleDocxExport} disabled={reportStatus !== 'done' || !reportDraft || docxExporting} style={reportActionButtonStyle}>{docxExporting ? '추출 중...' : 'DOCX 추출'}</Button>
        </div>
      </div>
      {reportStatus === 'generating' && <div style={{ marginTop: 16 }}>
        <div style={{ height: 9, background: C.g100, borderRadius: 99, overflow: 'hidden', marginBottom: 10 }}><div style={{ height: '100%', width: `${reportProgress}%`, background: `linear-gradient(90deg,${C.primary},${C.light})`, borderRadius: 99, transition: 'width .3s' }} /></div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{REPORT_STEPS.map((step, index) => <span key={step} style={{ fontSize: 11, fontWeight: 800, color: reportProgress >= ((index + 1) * 100) / REPORT_STEPS.length ? C.primary : C.g400, background: C.g100, borderRadius: 999, padding: '5px 9px' }}>{step}</span>)}</div>
      </div>}
    </Card>

    {validationComplete && reportStatus === 'idle' && <Card style={{ padding: '22px 24px', marginBottom: 18, background: '#F7F8FA', boxShadow: 'none', border: `1px solid ${C.g200}` }}>
      <div style={{ fontSize: 13, fontWeight: 900, color: C.g800 }}>보고서가 아직 생성되지 않았습니다</div>
      <div style={{ fontSize: 12, color: C.g600, lineHeight: 1.6, marginTop: 5 }}>보고서 생성하기를 눌러야 초안과 항목별 검토 결과가 생성됩니다.</div>
    </Card>}

    {reportStatus === 'done' && renderReportEditor()}

    <CenterModal open={exportNoticeOpen} title="DOCX 추출" body="편집된 보고서를 DOCX 파일로 생성했습니다." actionLabel="확인" onAction={() => setExportNoticeOpen(false)} />
    <CenterModal open={Boolean(agentFailureTarget)} title="처리 실패" body={agentFailureTarget ? getAgentFailureMessage(agentFailureTarget) : ''} actionLabel="확인" onAction={() => setAgentFailureTarget(null)} />
  </div>;
};

export default ReportScreen;
