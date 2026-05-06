'use client';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Card from '../../../components/ui/Card';
import Modal from '../../../components/ui/Modal';
import { ChevronIcon } from '../../../components/ui';
import { AppFrame } from '../../../components/common';
import { C } from '../../../lib/theme';
import { getMonthlyUsageStatements, getProjectById, STATUS_META } from '../../../lib/project-data';
import { addActionNotification, closeResolvedActionNotificationsForProject } from '../../../lib/action-notifications';
import { can } from '../../../lib/permissions';
import { workflowStorage } from '../../../lib/workflow-storage';
import { useCurrentUser } from '../../../lib/dev-user';
import UploadScreen from '../../../features/project-tab/UploadScreen';
import ArchiveScreen from '../../../features/project-tab/ArchiveScreen';
import VerifyScreen from '../../../features/project-tab/VerifyScreen';
import { CATS, USAGE_LINE_ITEMS, buildArchiveDataFromUploads, fmt } from '../../../lib/mock-data';
import type { ArchiveSeed, EvidenceCategory, EvidenceFile } from '../../../types/domain';
type DetailTab = 'overview' | 'upload' | 'validation' | 'report' | 'archive';
const TABS: Array<{
    id: DetailTab;
    label: string;
}> = [
    { id: 'overview', label: '사용내역서' },
    { id: 'upload', label: '증빙 업로드' },
    { id: 'archive', label: '아카이브' },
    { id: 'validation', label: '유효성 검증' },
    { id: 'report', label: '보고서' },
];
const DETAIL_TABS = new Set<DetailTab>(['overview', 'upload', 'validation', 'report', 'archive']);
const SUPPLEMENT_REQUESTED_FILES = ['영수증', '현장사진', '지급대장', '선임확인서'];
export default function ProjectDetailPage() {
    const router = useRouter();
    const params = useParams<{
        projectId: string;
    }>();
    const searchParams = useSearchParams();
    const { user } = useCurrentUser();
    const projectId = params?.projectId || '';
    const project = useMemo(() => getProjectById(projectId, user), [projectId, user]);
    const monthlyStatements = useMemo(() => getMonthlyUsageStatements(project.id), [project.id]);
    const latestStatement = monthlyStatements[monthlyStatements.length - 1];
    const headerHistoryItems = [
        {
            date: '2026-04-23',
            count: 1,
            title: '최근 현황',
            summary: project.recentActivity,
        },
        {
            date: '2026-04-22',
            count: project.hasUploads ? 3 : 0,
            title: '증빙 제출',
            summary: project.hasUploads ? '증빙자료 업로드 이력이 있습니다.' : '아직 제출된 증빙자료가 없습니다.',
        },
        {
            date: '2026-04-21',
            count: project.hasActionRequest ? 1 : 0,
            title: '조치 요청',
            summary: project.hasActionRequest ? '미처리 조치 요청이 있습니다.' : '미처리 조치 요청이 없습니다.',
        },
    ];
    const canUploadEvidence = can(user, 'uploadEvidence');
    const canRunValidation = can(user, 'runValidation');
    const canReviewReport = can(user, 'reviewReport');
    const availableTabs = TABS.filter((tab) => {
        if (tab.id === 'upload')
            return canUploadEvidence;
        if (tab.id === 'validation')
            return canRunValidation;
        if (tab.id === 'report')
            return canReviewReport;
        return true;
    });
    const availableTabIds = new Set(availableTabs.map((tab) => tab.id));
    const requestedTabParam = searchParams.get('tab') as DetailTab | null;
    const requestedTab = requestedTabParam && DETAIL_TABS.has(requestedTabParam) && availableTabIds.has(requestedTabParam) ? requestedTabParam : 'overview';
    const [activeTab, setActiveTab] = useState<DetailTab>(requestedTab);
    const [archiveSeed, setArchiveSeed] = useState<ArchiveSeed | null>(null);
    const [matchReady, setMatchReady] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(latestStatement.month);
    const [usageStatementPage, setUsageStatementPage] = useState(0);
    const [validationStatusByMonth, setValidationStatusByMonth] = useState<Record<string, 'idle' | 'running' | 'done'>>({});
    const [uploadCount, setUploadCount] = useState(0);
    const [selectedHeaderHistoryDate, setSelectedHeaderHistoryDate] = useState('all');
    const [historyDateMenuOpen, setHistoryDateMenuOpen] = useState(false);
    const [monthMenuOpen, setMonthMenuOpen] = useState(false);
    const [projectHeaderOpen, setProjectHeaderOpen] = useState(true);
    const [actionGuideOpen, setActionGuideOpen] = useState(false);
    const [actionCompletionSent, setActionCompletionSent] = useState(false);
    const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
    const historyDateMenuRef = useRef<HTMLDivElement | null>(null);
    const monthMenuRef = useRef<HTMLDivElement | null>(null);
    const visibleHeaderHistoryItems = selectedHeaderHistoryDate === 'all'
        ? headerHistoryItems
        : headerHistoryItems.filter((item) => item.date === selectedHeaderHistoryDate);
    const selectedStatement = monthlyStatements.find((statement) => statement.month === selectedMonth) || latestStatement;
    const selectedValidationStatus = validationStatusByMonth[selectedStatement.month] || 'idle';
    const canViewActionGuide = user.role === 'project_manager' && project.hasActionRequest;
    const shouldShowActionBadge = project.hasActionRequest;
    const shouldPulseActionBadge = canViewActionGuide && !actionCompletionSent;
    useEffect(() => {
        setArchiveSeed(workflowStorage.getArchiveSeed(project.id));
        setMatchReady(workflowStorage.getMatchReady(project.id));
        setActionGuideOpen(user.role === 'project_manager' && project.hasActionRequest);
        setActionCompletionSent(false);
    }, [project.id, project.hasActionRequest, user.role]);
    useEffect(() => {
        setSelectedMonth(latestStatement.month);
    }, [latestStatement.month]);
    useEffect(() => {
        setUsageStatementPage(0);
    }, [selectedMonth]);
    useEffect(() => {
        setActiveTab(requestedTab);
    }, [requestedTab]);
    useEffect(() => {
        if (!historyDateMenuOpen)
            return;
        const handlePointerDown = (event: PointerEvent) => {
            if (historyDateMenuRef.current?.contains(event.target as Node))
                return;
            setHistoryDateMenuOpen(false);
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape')
                setHistoryDateMenuOpen(false);
        };
        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [historyDateMenuOpen]);
    useEffect(() => {
        if (!monthMenuOpen)
            return;
        const handlePointerDown = (event: PointerEvent) => {
            if (monthMenuRef.current?.contains(event.target as Node))
                return;
            setMonthMenuOpen(false);
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape')
                setMonthMenuOpen(false);
        };
        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [monthMenuOpen]);
    const updateTab = (tab: DetailTab) => {
        if (!availableTabIds.has(tab))
            return;
        setActiveTab(tab);
        router.replace(`/projects/${project.id}?tab=${tab}`);
    };
    const runArchiveValidation = () => {
        if (!canRunValidation || selectedValidationStatus === 'running')
            return;
        const month = selectedStatement.month;
        setValidationStatusByMonth((prev) => ({ ...prev, [month]: 'running' }));
        window.setTimeout(() => {
            setValidationStatusByMonth((prev) => ({ ...prev, [month]: 'done' }));
            updateTab('validation');
        }, 900);
    };
    const sendActionCompletionNotification = () => {
        if (!canViewActionGuide || actionCompletionSent)
            return;
        addActionNotification({
            projectId: project.id,
            projectName: project.name,
            categoryName: project.actionRequestDetails?.title || '보완 자료',
            title: `${project.actionRequestDetails?.title || '보완 자료'} 조치 완료`,
            message: `${project.name} 담당자가 요청된 보완 자료 조치를 완료했습니다. 제출 자료를 확인한 뒤 유효성 검증을 다시 수행해 주세요.`,
            requestedFiles: [],
            senderName: user.name,
            recipientRole: 'she_manager',
        });
        setActionCompletionSent(true);
    };
    const actionGuideModal = canViewActionGuide && project.actionRequestDetails ? (
        <Modal open={actionGuideOpen} onClose={() => setActionGuideOpen(false)} zIndex={960} maxWidth={680}>
          <div style={{ background: C.white, borderRadius: 18, border: `1px solid ${C.g200}`, boxShadow: '0 18px 44px rgba(0,0,0,.16)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 22px 16px', borderBottom: `1px solid ${C.g100}`, display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 900, color: C.danger }}>부족한 서류 안내</span>
                  <span style={{ fontSize: 11, fontWeight: 900, color: C.g600, background: C.g100, borderRadius: 999, padding: '4px 8px' }}>기한 {project.actionRequestDetails.dueDate}</span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, color: C.g800, lineHeight: 1.35 }}>{project.actionRequestDetails.title}</div>
                <div style={{ fontSize: 12, color: C.g400, fontWeight: 900, marginTop: 6 }}>요청 {project.actionRequestDetails.requestedAt} · 담당 {project.actionRequestDetails.assignee}</div>
              </div>
              <button type="button" aria-label="부족한 서류 안내 닫기" onClick={() => setActionGuideOpen(false)} style={{ border: 'none', background: 'transparent', color: C.g400, cursor: 'pointer', fontSize: 24, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: '18px 22px 20px' }}>
              <div style={{ fontSize: 13, color: C.g600, lineHeight: 1.7, marginBottom: 14 }}>{project.actionRequestDetails.reason}</div>
              <div style={{ fontSize: 12, fontWeight: 900, color: C.g800, marginBottom: 8 }}>제출해야 할 서류</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {SUPPLEMENT_REQUESTED_FILES.map((file) => (
                  <span key={file} style={{ fontSize: 12, fontWeight: 900, color: C.primary, background: C.bg, border: `1px solid ${C.light}`, borderRadius: 999, padding: '5px 10px' }}>{file}</span>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                <button type="button" onClick={() => setActionGuideOpen(false)} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '9px 14px', background: C.white, color: C.g600, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer' }}>닫기</button>
                <button type="button" onClick={sendActionCompletionNotification} disabled={actionCompletionSent} style={{ border: 'none', borderRadius: 999, padding: '9px 16px', background: actionCompletionSent ? C.g100 : C.primary, color: actionCompletionSent ? C.g400 : C.white, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: actionCompletionSent ? 'default' : 'pointer' }}>
                  {actionCompletionSent ? '조치 완료 알림 전송됨' : '조치 완료'}
                </button>
              </div>
            </div>
          </div>
        </Modal>
    ) : null;
    const historyCard = (<section data-ui="project-detail.40" style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ width: '100%', color: C.g800, fontFamily: 'inherit', padding: '8px 4px', display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-start', gap: 4 }}>
        <span data-ui="project-detail.1" style={{ fontSize: 14, color: C.g800, fontWeight: 900 }}>최근 이력</span>
      </div>
      <div data-ui="project-detail.41" style={{ marginTop: 6, minHeight: 0, display: 'flex', flexDirection: 'column', flex: '1 1 auto' }}>
      <div data-ui="project-detail.2" style={{ display: 'grid', gridTemplateColumns: 'auto 92px', gap: 6, alignItems: 'center', marginBottom: 8 }}>
        <button data-ui="project-detail.3" onClick={() => {
            setSelectedHeaderHistoryDate('all');
            setHistoryDateMenuOpen(false);
        }} style={{ border: 'none', borderRadius: 999, padding: '6px 10px', fontSize: 12, fontWeight: 900, color: selectedHeaderHistoryDate === 'all' ? C.white : C.g600, background: selectedHeaderHistoryDate === 'all' ? C.primary : C.g100, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>전체 날짜</button>
        
        <div data-ui="project-detail.4" ref={historyDateMenuRef} style={{ position: 'relative', minWidth: 0 }}>
          <button data-ui="project-detail.5" type="button" onClick={() => setHistoryDateMenuOpen((open) => !open)} style={{ width: '100%', border: `1px solid ${C.g200}`, borderRadius: 999, padding: '6px 9px', fontSize: 12, fontWeight: 900, color: selectedHeaderHistoryDate === 'all' ? C.g400 : C.primary, background: C.white, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {selectedHeaderHistoryDate === 'all' ? '날짜 선택' : selectedHeaderHistoryDate}
          </button>
          {historyDateMenuOpen && (<div data-ui="project-detail.6" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 30, background: C.white, border: `1px solid ${C.g200}`, borderRadius: 12, boxShadow: '0 8px 20px rgba(27,94,59,.14)', padding: 4 }}>
              {headerHistoryItems.map((item) => (<button data-ui="project-detail.7" key={item.date} type="button" onClick={() => {
                    setSelectedHeaderHistoryDate(item.date);
                    setHistoryDateMenuOpen(false);
                }} style={{ width: '100%', border: 'none', background: selectedHeaderHistoryDate === item.date ? C.bg : 'transparent', color: selectedHeaderHistoryDate === item.date ? C.primary : C.g600, borderRadius: 9, padding: '7px 8px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 900, textAlign: 'center' }}>
                  {item.date}
                </button>))}
            </div>)}
        </div>
      </div>
      <div data-ui="project-detail.8" style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '1 1 auto', minHeight: 0, overflowY: 'auto' }}>
        {visibleHeaderHistoryItems.map((item) => (<div data-ui="project-detail.9" key={`${item.date}-${item.title}`} style={{ padding: '11px 12px', borderRadius: 12, background: C.g100, border: `1px solid ${C.g200}` }}>
            <div data-ui="project-detail.10" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
              <span data-ui="project-detail.11" style={{ fontSize: 12, color: C.g400, fontWeight: 900 }}>{item.date}</span>
              <span data-ui="project-detail.12" style={{ fontSize: 12, color: item.count > 0 ? C.primary : C.g400, fontWeight: 900 }}>{item.count}건</span>
            </div>
            <div data-ui="project-detail.13" style={{ fontSize: 14, color: C.g800, fontWeight: 900, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
            <div data-ui="project-detail.14" style={{ fontSize: 13, color: C.g600, lineHeight: 1.45 }}>
              {item.summary}
            </div>
          </div>))}
      </div>
      </div>
    </section>);
    
    const projectInfoGrid = (<div data-ui="project-detail.info-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, minWidth: 0 }}>
      {[
              ['계약번호', project.contractNumber],
              ['건설업체', project.constructionCompany],
              ['관리자', project.manager],
              ['공사기간', project.period],
              ['공사금액', `${project.constructionAmount}원`],
              ['소재지', project.location],
          ].map(([label, value]) => (
            <div key={label} style={{ minWidth: 0, padding: '11px 12px', borderRadius: 12, background: C.g100, border: `1px solid ${C.g200}` }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: C.g400, marginBottom: 4 }}>{label}</div>
              <div title={value} style={{ fontSize: 13, fontWeight: 900, color: C.g800, lineHeight: 1.45, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
            </div>
          ))}
    </div>);
    const overviewUsageRows = [
        ['1. 안전·보건관리자 임금 등', '6,445,770', '6,445,770', '12,891,540'],
        ['2. 안전시설비 등', '8,725,660', '15,188,000', '23,913,660'],
        ['3. 보호구 등', '2,458,000', '543,000', '3,001,000'],
        ['4. 안전보건진단비 등', '-', '600,000', '600,000'],
        ['5. 안전보건교육비 등', '1,049,545', '305,000', '1,354,545'],
        ['6. 근로자 건강장해예방비 등', '1,741,800', '5,111,500', '6,853,300'],
        ['7. 건설재해예방전문지도기관 기술지도비', '-', '-', '-'],
        ['8. 본사 전담조직 근로자 임금 등', '-', '-', '-'],
        ['9. 위험성평가 등에 따른 소요비용', '-', '-', '-'],
        ['계', '20,420,775', '28,193,270', '48,614,045'],
    ];
    const usageDetailPageSize = 5;
    const usageDetailPages = Array.from({ length: Math.ceil(USAGE_LINE_ITEMS.length / usageDetailPageSize) }, (_, index) => USAGE_LINE_ITEMS.slice(index * usageDetailPageSize, (index + 1) * usageDetailPageSize));
    const usageStatementPageCount = 1 + usageDetailPages.length;
    const selectedUsageDetailPage = usageDetailPages[usageStatementPage - 1] || [];
    const usageInfoGridStyle = { display: 'grid', gridTemplateColumns: '120px minmax(170px, 1fr) 120px minmax(170px, 1fr)', minWidth: 620 } as const;
    const usageSummaryGridStyle = { display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) 130px 130px 130px', minWidth: 650 } as const;
    const usageDetailGridStyle = { display: 'grid', gridTemplateColumns: '64px minmax(220px, 1fr) minmax(180px, .75fr) 130px', minWidth: 594 } as const;
    const usageTableScrollStyle = { width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'auto', overflowY: 'hidden' } as const;
    const tabContent = {
        overview: (<Card style={{ padding: '22px 24px', minWidth: 0, overflow: 'hidden' }}>
        <div data-ui="project-detail.15" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap', minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: C.g800 }}>{selectedStatement.label} 사용내역서</div>
            <div style={{ fontSize: 12, color: C.g400, marginTop: 4 }}>{usageStatementPage === 0 ? '1페이지 · 기본 정보 및 9개 항목 요약' : `${usageStatementPage + 1}페이지 · 세부 사용내역 항목`}</div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 'auto' }}>
            <button type="button" onClick={() => setUsageStatementPage((page) => Math.max(0, page - 1))} disabled={usageStatementPage === 0} style={{ width: 34, height: 34, border: `1px solid ${C.g200}`, borderRadius: 10, background: C.white, color: usageStatementPage === 0 ? C.g400 : C.g800, cursor: usageStatementPage === 0 ? 'not-allowed' : 'pointer', fontSize: 18, fontWeight: 900, fontFamily: 'inherit' }}>{'<'}</button>
            <span style={{ minWidth: 58, textAlign: 'center', fontSize: 12, fontWeight: 900, color: C.g600 }}>{usageStatementPage + 1} / {usageStatementPageCount}</span>
            <button type="button" onClick={() => setUsageStatementPage((page) => Math.min(usageStatementPageCount - 1, page + 1))} disabled={usageStatementPage >= usageStatementPageCount - 1} style={{ width: 34, height: 34, border: `1px solid ${C.g200}`, borderRadius: 10, background: C.white, color: usageStatementPage >= usageStatementPageCount - 1 ? C.g400 : C.g800, cursor: usageStatementPage >= usageStatementPageCount - 1 ? 'not-allowed' : 'pointer', fontSize: 18, fontWeight: 900, fontFamily: 'inherit' }}>{'>'}</button>
          </div>
        </div>
        {usageStatementPage === 0 ? <>
        <div className="thin-x-scroll" style={{ ...usageTableScrollStyle, marginBottom: 16 }}>
        <div data-ui="project-detail.16" style={{ ...usageInfoGridStyle, border: `1px solid ${C.g200}`, borderRadius: 12, overflow: 'hidden', fontSize: 13 }}>
          {[
                ['건설업체명', project.constructionCompany, '공사명', project.constructionName],
                ['소재지', project.location, '대표자', project.representative],
                ['공사금액', `${project.constructionAmount}원`, '공사기간', project.period],
                ['발주자', project.client, '공정률', project.progressRate],
                ['계상된 안전관리비', `${project.plannedAmount}원`, '사용률', project.usageRate],
                ['원본파일', selectedStatement.sourceFileName, '개정번호', `${selectedStatement.revisionNo}차`],
                ['업로드일', selectedStatement.uploadedAt, '업로드 담당자', selectedStatement.uploadedBy],
                ['문서작성일', selectedStatement.documentWrittenDate, '검증상태', selectedStatement.validationStatus],
                ['증빙 파일', `${selectedStatement.evidenceCount}개`, '이슈 항목', `${selectedStatement.issueCount}건`],
            ].map(([labelA, valueA, labelB, valueB]) => (<Fragment key={`${labelA}-${labelB}`}>
              <div data-ui="project-detail.17" style={{ padding: '9px 11px', background: C.g100, color: C.g600, fontWeight: 900, borderRight: `1px solid ${C.g200}`, borderBottom: `1px solid ${C.g200}` }}>{labelA}</div>
              <div data-ui="project-detail.18" title={valueA} style={{ padding: '9px 11px', color: C.g800, fontWeight: 800, borderRight: `1px solid ${C.g200}`, borderBottom: `1px solid ${C.g200}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{valueA}</div>
              <div style={{ padding: '9px 11px', background: C.g100, color: C.g600, fontWeight: 900, borderRight: `1px solid ${C.g200}`, borderBottom: `1px solid ${C.g200}` }}>{labelB}</div>
              <div title={valueB} style={{ padding: '9px 11px', color: C.g800, fontWeight: 800, borderBottom: `1px solid ${C.g200}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{valueB}</div>
            </Fragment>))}
        </div>
        </div>
        <div className="thin-x-scroll" style={usageTableScrollStyle}>
        <div style={{ border: `1px solid ${C.g200}`, borderRadius: 12, overflow: 'hidden', minWidth: usageSummaryGridStyle.minWidth }}>
          <div style={{ ...usageSummaryGridStyle, background: C.g100, borderBottom: `1px solid ${C.g200}` }}>
            {['항목', '전회', '금회', '누계'].map((head) => <div key={head} style={{ padding: '10px 12px', fontSize: 13, color: C.g600, fontWeight: 900, textAlign: head === '항목' ? 'left' : 'right', borderRight: head === '누계' ? 'none' : `1px solid ${C.g200}` }}>{head}</div>)}
          </div>
          {overviewUsageRows.map(([item, previous, current, cumulative], index) => {
                const isTotal = item === '계';
                return (<div key={item} style={{ ...usageSummaryGridStyle, background: isTotal ? C.g100 : C.white, borderBottom: index === overviewUsageRows.length - 1 ? 'none' : `1px solid ${C.g200}` }}>
                <div style={{ padding: '10px 12px', fontSize: 13, color: C.g800, fontWeight: isTotal ? 900 : 800, borderRight: `1px solid ${C.g200}` }}>{item}</div>
                {[previous, current, cumulative].map((amount, amountIndex) => <div key={`${item}-${amountIndex}`} style={{ padding: '10px 12px', fontSize: 13, color: C.g800, fontWeight: isTotal ? 900 : 800, textAlign: 'right', borderRight: amountIndex === 2 ? 'none' : `1px solid ${C.g200}` }}>{amount}</div>)}
              </div>);
            })}
        </div>
        </div>
        </> : <>
        <div className="thin-x-scroll" style={usageTableScrollStyle}>
        <div style={{ border: `1px solid ${C.g200}`, borderRadius: 12, overflow: 'hidden', minWidth: usageDetailGridStyle.minWidth }}>
          <div style={{ ...usageDetailGridStyle, background: C.g100, borderBottom: `1px solid ${C.g200}` }}>
            {['번호', '세부 항목', '9개 항목', '금액'].map((head) => <div key={head} style={{ padding: '10px 12px', fontSize: 13, color: C.g600, fontWeight: 900, textAlign: head === '금액' ? 'right' : 'left', borderRight: head === '금액' ? 'none' : `1px solid ${C.g200}` }}>{head}</div>)}
          </div>
          {selectedUsageDetailPage.map((line, index) => {
            const absoluteIndex = (usageStatementPage - 1) * usageDetailPageSize + index + 1;
            const category = CATS.find((cat) => cat.id === line.categoryId);
            return <div key={line.id} style={{ ...usageDetailGridStyle, borderBottom: index === selectedUsageDetailPage.length - 1 ? 'none' : `1px solid ${C.g200}` }}>
              <div style={{ padding: '10px 12px', fontSize: 13, color: C.g600, fontWeight: 800, borderRight: `1px solid ${C.g200}` }}>{absoluteIndex}</div>
              <div title={line.name} style={{ padding: '10px 12px', fontSize: 13, color: C.g800, fontWeight: 900, borderRight: `1px solid ${C.g200}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{line.name}</div>
              <div title={category?.label || ''} style={{ padding: '10px 12px', fontSize: 13, color: C.g600, fontWeight: 800, borderRight: `1px solid ${C.g200}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{category?.label || '-'}</div>
              <div style={{ padding: '10px 12px', fontSize: 13, color: C.g800, fontWeight: 900, textAlign: 'right' }}>{fmt(line.amount)}</div>
            </div>;
          })}
        </div>
        </div>
        </>}
      </Card>),
        upload: (<UploadScreen contractName={project.name} contractMeta={{
                name: project.name,
                num: project.contractNumber,
                period: project.period,
                round: selectedStatement.label,
            }} requireUsageStatementFirst={project.status === 'upload_pending' && !project.hasUploads} onUploadCountChange={setUploadCount} onMatchComplete={(payload: {
                files: Record<EvidenceCategory, EvidenceFile[]>;
            }) => {
                const nextSeed = buildArchiveDataFromUploads(payload.files);
                workflowStorage.setArchiveSeed(project.id, nextSeed);
                workflowStorage.setMatchReady(project.id, true);
                setArchiveSeed(nextSeed);
                setMatchReady(true);
                updateTab('archive');
            }}/>),
        validation: (<VerifyScreen projectId={project.id} initialTab="dashboard" initialStatus={selectedValidationStatus === 'done' ? 'done' : 'idle'} hideValidationIntro contractName={`${project.name} · ${selectedStatement.label}`} onValidationApproved={() => {
                setValidationStatusByMonth((prev) => ({ ...prev, [selectedStatement.month]: 'done' }));
                closeResolvedActionNotificationsForProject(project.id);
                updateTab('report');
            }}/>),
        report: (<VerifyScreen projectId={project.id} initialTab="report" initialStatus="done" contractName={`${project.name} · ${selectedStatement.label}`}/>),
        archive: (<ArchiveScreen matchReady={matchReady} onDismissMatchReady={() => {
                workflowStorage.setMatchReady(project.id, false);
                setMatchReady(false);
            }} archiveSeed={archiveSeed} validationStatus={selectedValidationStatus} onRunValidation={runArchiveValidation} onArchiveSeedChange={(nextSeed) => {
                workflowStorage.setArchiveSeed(project.id, nextSeed);
                setArchiveSeed(nextSeed);
            }} canRunValidation={canRunValidation} contractName={project.name} contractMeta={{
                name: project.name,
                num: project.contractNumber,
                period: project.period,
                round: selectedStatement.label,
            }}/>),
    };
    return (<AppFrame title={project.name} mainClassName={`project-detail-main-with-history${rightSidebarOpen ? '' : ' project-detail-main-right-closed'}`}>
      <Card style={{ padding: '18px 20px', marginBottom: 14, overflow: 'visible', position: 'relative', zIndex: 20 }}>
        <div data-ui="project-detail.19" style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div data-ui="project-detail.20" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', minWidth: 0 }}>
            <h2 data-ui="project-detail.21" style={{ fontSize: 22, fontWeight: 900, color: C.g800, lineHeight: 1.25, margin: 0, minWidth: 240, flex: '1 1 360px' }}>{project.constructionName} 계약 정산</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 220px', maxWidth: '100%', minWidth: 0 }}>
              <div data-ui="project-detail.22" ref={monthMenuRef} style={{ position: 'relative', flex: '0 0 142px', maxWidth: '100%', minWidth: 0 }}>
                <button data-ui="project-detail.23" type="button" onClick={() => setMonthMenuOpen((open) => !open)} style={{ width: '100%', border: `1px solid ${C.g200}`, borderRadius: 12, padding: '9px 11px', background: C.white, color: C.g800, fontFamily: 'inherit', cursor: 'pointer', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 16px', alignItems: 'center', gap: 8, textAlign: 'left' }}>
                  <span style={{ minWidth: 0, fontSize: 13, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedStatement.label}</span>
                  <span aria-hidden="true" style={{ color: C.g400, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ChevronIcon direction={monthMenuOpen ? 'up' : 'down'} size={16} />
                  </span>
                </button>
                {monthMenuOpen && (<div data-ui="project-detail.24" style={{ position: 'absolute', top: 'calc(100% + 7px)', right: 0, zIndex: 80, width: 142, maxWidth: 'calc(100vw - 40px)', maxHeight: 260, overflowY: 'auto', background: C.white, border: `1px solid ${C.g200}`, borderRadius: 12, padding: 6, boxShadow: '0 8px 20px rgba(27,94,59,.14)', scrollbarWidth: 'thin' }}>
                  {monthlyStatements.map((statement) => {
                      const active = selectedStatement.month === statement.month;
                      return (<button data-ui="project-detail.25" key={statement.month} type="button" onClick={() => {
                              setSelectedMonth(statement.month);
                              setMonthMenuOpen(false);
                          }} style={{ width: '100%', border: 'none', borderRadius: 9, padding: '9px 10px', background: active ? C.bg : 'transparent', color: active ? C.primary : C.g600, cursor: 'pointer', fontFamily: 'inherit', display: 'block', textAlign: 'left' }}>
                        <span style={{ fontSize: 13, fontWeight: 900, whiteSpace: 'nowrap' }}>{statement.label}</span>
                      </button>);
                  })}
                </div>)}
              </div>
              <button type="button" onClick={() => setProjectHeaderOpen((open) => !open)} style={{ flex: '0 0 auto', border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.g600, height: 32, padding: '0 9px', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer' }}>
                <ChevronIcon direction={projectHeaderOpen ? 'up' : 'down'} size={14} />
              </button>
            </div>
          </div>
          {projectHeaderOpen && <div data-ui="project-detail.26" style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 2, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: C.g400 }}>프로젝트 기본 정보</span>
              {shouldShowActionBadge && (canViewActionGuide ? (
                <button type="button" data-ui="project-detail.27" className={shouldPulseActionBadge ? 'action-request-pulse' : undefined} onClick={() => setActionGuideOpen(true)} style={{ border: 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, color: STATUS_META.action_required.color, background: STATUS_META.action_required.bg, borderRadius: 999, padding: '4px 10px', cursor: 'pointer' }}>
                  조치 요청
                </button>
              ) : (
                <span data-ui="project-detail.27" style={{ fontSize: 12, fontWeight: 800, color: STATUS_META.action_required.color, background: STATUS_META.action_required.bg, borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap' }}>
                  조치 요청
                </span>
              ))}
            </div>
            {projectInfoGrid}
          </div>}
        </div>
      </Card>
      {actionGuideModal}

      <div data-ui="project-detail.28" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {availableTabs.map((tab) => (<button data-ui="project-detail.29" key={tab.id} onClick={() => updateTab(tab.id)} style={{ padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, fontWeight: 800, background: activeTab === tab.id ? C.primary : C.white, color: activeTab === tab.id ? '#fff' : C.g600, boxShadow: activeTab === tab.id ? `0 2px 10px ${C.primaryShadow}` : '0 1px 4px rgba(0,0,0,.06)' }}>
              {tab.label}
            </button>))}
        </div>
        {activeTab === 'upload' && uploadCount > 0 && (<div data-ui="project-detail.30" style={{ padding: '10px 13px', borderRadius: 12, background: C.bg, color: C.primary, fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap' }}>
          총 {uploadCount}개 파일 업로드 완료 - AI 자동 분류 중이에요.
        </div>)}
      </div>

      <div data-ui="project-detail.31" style={{ minWidth: 0 }}>
        {tabContent[activeTab]}
      </div>
      <button type="button" aria-label={rightSidebarOpen ? '우측 사이드바 닫기' : '우측 사이드바 열기'} onClick={() => setRightSidebarOpen((open) => !open)} className="project-detail-right-toggle" style={{ right: rightSidebarOpen ? 205 : 10 }}>
        <ChevronIcon direction={rightSidebarOpen ? 'right' : 'left'} size={17} color={C.primary}/>
      </button>
      <aside data-ui="project-detail.32" className={rightSidebarOpen ? 'project-detail-sidebar' : 'project-detail-sidebar project-detail-sidebar-closed'}>
        <div data-ui="project-detail.38" className="project-detail-side-stack">
          {historyCard}
        </div>
      </aside>
    </AppFrame>);
}
