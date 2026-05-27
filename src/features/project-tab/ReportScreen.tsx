import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import CenterModal from '../../components/ui/CenterModal';
import { getAgentFailureMessage, type AgentFailureTarget } from '../../lib/agent-failure';
import { runAgent } from '../../lib/agent-api';
import { AGENT_TYPE_CODE } from '../../lib/project-data';
import { buildReportDraftJson, type ReportDraft } from '../../lib/report-draft';
import { C } from '../../lib/theme';
import { VALIDATION_DASHBOARD_RESULT } from '../../lib/evidence-utils';

interface ReportScreenProps {
  contractName: string;
  projectId?: string;
  usageStatementId?: number;
  validationComplete?: boolean;
}

type ReportGenerationStatus = 'idle' | 'generating' | 'done';
type ReportWorkflowStatus = 'editing' | 'saved';

const REPORT_STEPS = ['항목별 판정 요약', '부적정 사유 정리', '보완 요청 문안 생성', '보고서 초안 저장'];

const isReportDraft = (value: unknown): value is ReportDraft => {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<ReportDraft>;
  return typeof draft.report_no === 'string' && Array.isArray(draft.report_sections);
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

const ReportScreen = ({ contractName, projectId, usageStatementId, validationComplete = false }: ReportScreenProps) => {
  const [reportStatus, setReportStatus] = useState<ReportGenerationStatus>('idle');
  const [reportProgress, setReportProgress] = useState(0);
  const [reportWorkflowStatus, setReportWorkflowStatus] = useState<ReportWorkflowStatus>('editing');
  const [reportDraft, setReportDraft] = useState<ReportDraft | null>(null);
  const [savedAt, setSavedAt] = useState('');
  const [exportNoticeOpen, setExportNoticeOpen] = useState(false);
  const [docxExporting, setDocxExporting] = useState(false);
  const [agentFailureTarget, setAgentFailureTarget] = useState<AgentFailureTarget | null>(null);
  const result = VALIDATION_DASHBOARD_RESULT;

  useEffect(() => {
    if (!reportDraft || reportDraft.report_sections.some((section) => section.section_id === 'tax_settlement')) return;
    const templateDraft = buildReportDraftJson(null, result, contractName);
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
  }, [contractName, reportDraft, result]);

  const handleReportGenerate = async () => {
    if (reportStatus === 'generating') return;
    const buildExampleDraft = () => buildReportDraftJson(null, result, contractName);
    try {
      setReportStatus('generating');
      setReportProgress(25);
      let nextDraft: ReportDraft;
      if (validationComplete && projectId && usageStatementId) {
        const response = await runAgent(projectId, AGENT_TYPE_CODE.REPORT, { usageStatementId });
        const reportDraft = response.result.reportDraft;
        if (!isReportDraft(reportDraft)) throw new Error('보고서 Agent 응답에 reportDraft가 없습니다.');
        nextDraft = reportDraft;
      } else {
        nextDraft = buildExampleDraft();
      }
      setReportProgress(100);
      setReportDraft(nextDraft);
      setReportStatus('done');
      setReportWorkflowStatus('editing');
      setSavedAt('');
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

  const reportWorkflowMeta = {
    editing: { label: '초안 편집 가능', color: C.warn, bg: C.warnBg, description: '검증 결과를 기반으로 생성된 초안입니다. 담당자 검토 후 저장해 주세요.' },
    saved: { label: '저장됨', color: C.ok, bg: '#F4FBF6', description: savedAt ? `마지막 저장: ${savedAt}` : '저장된 초안입니다.' },
  }[reportWorkflowStatus];
  const reportActionButtonStyle: CSSProperties = {
    fontSize: 13,
    padding: '9px 14px',
    boxShadow: `0 6px 14px ${C.primaryShadow}`,
  };

  return <div className="screen-enter" style={{ background: 'transparent' }}>
    <Card style={{ padding: '18px 20px', marginBottom: 18 }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: C.g800 }}>보고서 생성</div>
          <div style={{ fontSize: 12, color: C.g400, marginTop: 5, lineHeight: 1.6 }}>{validationComplete ? '유효성 검증의 판정, 법령 근거, 보완 요청을 보고서 초안으로 정리합니다.' : '유효성 검증 결과가 없으면 예시 검증 결과로 보고서 초안을 생성합니다.'}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end', marginLeft: 'auto' }}>
          <Button size="sm" onClick={handleReportGenerate} disabled={reportStatus === 'generating'} style={reportActionButtonStyle}>{reportStatus === 'generating' ? '생성 중...' : reportStatus === 'done' ? '다시 생성하기' : '보고서 생성하기'}</Button>
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

    <CenterModal open={exportNoticeOpen} title="DOCX 추출" body="편집된 보고서를 DOCX 파일로 생성했습니다." actionLabel="확인" onAction={() => setExportNoticeOpen(false)} />
    <CenterModal open={Boolean(agentFailureTarget)} title="처리 실패" body={agentFailureTarget ? getAgentFailureMessage(agentFailureTarget) : ''} actionLabel="확인" onAction={() => setAgentFailureTarget(null)} />
  </div>;
};

export default ReportScreen;
