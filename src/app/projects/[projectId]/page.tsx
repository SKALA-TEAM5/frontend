'use client';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import { AppFrame, ProjectStageStepper } from '../../../components/common';
import { C } from '../../../lib/theme';
import { getProjectById, STATUS_META } from '../../../lib/project-data';
import { can } from '../../../lib/permissions';
import { workflowStorage } from '../../../lib/workflow-storage';
import { useCurrentUser } from '../../../lib/dev-user';
import UploadScreen from '../../../features/project-tab/UploadScreen';
import ArchiveScreen from '../../../features/project-tab/ArchiveScreen';
import VerifyScreen from '../../../features/project-tab/VerifyScreen';
import { buildArchiveDataFromUploads } from '../../../lib/mock-data';
import type { ArchiveSeed, EvidenceCategory, EvidenceFile } from '../../../types/domain';
type DetailTab = 'overview' | 'upload' | 'validation' | 'report' | 'archive';
const TABS: Array<{
    id: DetailTab;
    label: string;
}> = [
    { id: 'overview', label: '개요' },
    { id: 'upload', label: '증빙 업로드' },
    { id: 'archive', label: '아카이브' },
    { id: 'validation', label: '유효성 검증' },
    { id: 'report', label: '보고서' },
];
const DETAIL_TABS = new Set<DetailTab>(['overview', 'upload', 'validation', 'report', 'archive']);
export default function ProjectDetailPage() {
    const router = useRouter();
    const params = useParams<{
        projectId: string;
    }>();
    const searchParams = useSearchParams();
    const { user } = useCurrentUser();
    const projectId = params?.projectId || '';
    const project = useMemo(() => getProjectById(projectId, user), [projectId, user]);
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
    const [uploadCount, setUploadCount] = useState(0);
    const [selectedHeaderHistoryDate, setSelectedHeaderHistoryDate] = useState('all');
    const [historyDateMenuOpen, setHistoryDateMenuOpen] = useState(false);
    const historyDateMenuRef = useRef<HTMLDivElement | null>(null);
    const visibleHeaderHistoryItems = selectedHeaderHistoryDate === 'all'
        ? headerHistoryItems
        : headerHistoryItems.filter((item) => item.date === selectedHeaderHistoryDate);
    useEffect(() => {
        setArchiveSeed(workflowStorage.getArchiveSeed());
        setMatchReady(workflowStorage.getMatchReady());
    }, [project.id]);
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
    const updateTab = (tab: DetailTab) => {
        if (!availableTabIds.has(tab))
            return;
        setActiveTab(tab);
        router.replace(`/projects/${project.id}?tab=${tab}`);
    };
    const historyCard = (<Card style={{ padding: '14px 16px', width: 240, boxShadow: '0 10px 24px rgba(27,94,59,.10)' }}>
      <div data-ui="app-projects-project-id-page.header-history-title" style={{ fontSize: 14, color: C.g400, fontWeight: 900, marginBottom: 10 }}>최근 이력</div>
      <div data-ui="app-projects-project-id-page.header-history-date-controls" style={{ display: 'grid', gridTemplateColumns: 'auto 92px', gap: 6, alignItems: 'center', marginBottom: 8 }}>
        <button data-ui="app-projects-project-id-page.header-history-date-all" onClick={() => {
            setSelectedHeaderHistoryDate('all');
            setHistoryDateMenuOpen(false);
        }} style={{ border: 'none', borderRadius: 999, padding: '6px 10px', fontSize: 12, fontWeight: 900, color: selectedHeaderHistoryDate === 'all' ? C.white : C.g600, background: selectedHeaderHistoryDate === 'all' ? C.primary : C.g100, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>전체 날짜</button>
        
        <div data-ui="app-projects-project-id-page.header-history-date-menu-wrap" ref={historyDateMenuRef} style={{ position: 'relative', minWidth: 0 }}>
          <button data-ui="app-projects-project-id-page.header-history-date-menu-button" type="button" onClick={() => setHistoryDateMenuOpen((open) => !open)} style={{ width: '100%', border: `1px solid ${C.g200}`, borderRadius: 999, padding: '6px 9px', fontSize: 12, fontWeight: 900, color: selectedHeaderHistoryDate === 'all' ? C.g400 : C.primary, background: C.white, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {selectedHeaderHistoryDate === 'all' ? '날짜 선택' : selectedHeaderHistoryDate}
          </button>
          {historyDateMenuOpen && (<div data-ui="app-projects-project-id-page.header-history-date-menu" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 30, background: C.white, border: `1px solid ${C.g200}`, borderRadius: 12, boxShadow: '0 8px 20px rgba(27,94,59,.14)', padding: 4 }}>
              {headerHistoryItems.map((item) => (<button data-ui="app-projects-project-id-page.header-history-date-menu-item" key={item.date} type="button" onClick={() => {
                    setSelectedHeaderHistoryDate(item.date);
                    setHistoryDateMenuOpen(false);
                }} style={{ width: '100%', border: 'none', background: selectedHeaderHistoryDate === item.date ? C.bg : 'transparent', color: selectedHeaderHistoryDate === item.date ? C.primary : C.g600, borderRadius: 9, padding: '7px 8px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 900, textAlign: 'left' }}>
                  {item.date}
                </button>))}
            </div>)}
        </div>
      </div>
      <div data-ui="app-projects-project-id-page.header-history-list" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
        {visibleHeaderHistoryItems.map((item) => (<div data-ui="app-projects-project-id-page.header-history-row" key={`${item.date}-${item.title}`} style={{ padding: '11px 12px', borderRadius: 12, background: C.g100, border: `1px solid ${C.g200}` }}>
            <div data-ui="app-projects-project-id-page.header-history-row-meta" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
              <span data-ui="app-projects-project-id-page.header-history-row-date" style={{ fontSize: 12, color: C.g400, fontWeight: 900 }}>{item.date}</span>
              <span data-ui="app-projects-project-id-page.header-history-row-count" style={{ fontSize: 12, color: item.count > 0 ? C.primary : C.g400, fontWeight: 900 }}>{item.count}건</span>
            </div>
            <div data-ui="app-projects-project-id-page.header-history-row-title" style={{ fontSize: 14, color: C.g800, fontWeight: 900, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
            <div data-ui="app-projects-project-id-page.header-history-row-summary" style={{ fontSize: 13, color: C.g600, lineHeight: 1.45 }}>
              {item.summary}
            </div>
          </div>))}
      </div>
    </Card>);
    const tabContent = {
        overview: (<Card style={{ padding: '28px 32px' }}>
        <div data-ui="app-projects-project-id-page.overview-title" style={{ fontSize: 18, fontWeight: 900, color: C.g800, marginBottom: 20 }}>프로젝트 기본정보</div>
        <div data-ui="app-projects-project-id-page.overview-grid" style={{ display: 'grid', gridTemplateColumns: '130px minmax(0,1fr) 130px minmax(0,1fr)', gap: '16px 18px', fontSize: 15, maxWidth: 860 }}>
          {[
                ['건설업체명', project.constructionCompany],
                ['대표자', project.representative],
                ['발주처', project.client],
                ['공사명', project.constructionName],
                ['공사금액', `${project.constructionAmount}원`],
                ['공사기간', project.period],
                ['관리자', project.manager],
                ['소재지', project.location],
                ['공정률', project.progressRate],
                ['정산차수', project.settlementRound],
                ['계상금액', `${project.plannedAmount}원`],
                ['누계금액', `${project.accumulatedAmount}원`],
                ['사용률', project.usageRate],
            ].map(([label, value]) => (<Fragment key={String(label)}>
              <div data-ui="app-projects-project-id-page.overview-label" style={{ color: C.g400, fontWeight: 900 }}>{label}</div>
              <div data-ui="app-projects-project-id-page.overview-value" style={{ color: C.g800, fontWeight: 800 }}>{value}</div>
            </Fragment>))}
        </div>
      </Card>),
        upload: (<UploadScreen contractName={project.name} contractMeta={{
                name: project.name,
                num: project.contractNumber,
                period: project.period,
                round: `${project.stageIndex + 1}차`,
            }} requireUsageStatementFirst={project.status === 'upload_pending' && !project.hasUploads} onUploadCountChange={setUploadCount} onMatchComplete={(payload: {
                files: Record<EvidenceCategory, EvidenceFile[]>;
            }) => {
                const nextSeed = buildArchiveDataFromUploads(payload.files);
                workflowStorage.setArchiveSeed(nextSeed);
                workflowStorage.setMatchReady(true);
                setArchiveSeed(nextSeed);
                setMatchReady(true);
                updateTab('archive');
            }}/>),
        validation: (<VerifyScreen initialTab="dashboard" initialStatus="idle" contractName={project.name}/>),
        report: (<VerifyScreen initialTab="report" initialStatus="done" contractName={project.name}/>),
        archive: (<ArchiveScreen matchReady={matchReady} onDismissMatchReady={() => {
                workflowStorage.setMatchReady(false);
                setMatchReady(false);
            }} archiveSeed={archiveSeed}/>),
    };
    return (<AppFrame title={project.name} mainClassName="project-detail-main-with-history" actions={<Button size="sm" onClick={() => { window.location.href = '/projects'; }}>목록으로</Button>}>
      <Card style={{ padding: '20px 24px', marginBottom: 14 }}>
        <div data-ui="app-projects-project-id-page.project-top-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div data-ui="app-projects-project-id-page.project-title-row" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 data-ui="app-projects-project-id-page.project-title" style={{ fontSize: 24, fontWeight: 900, color: C.g800, lineHeight: 1.25 }}>{project.constructionName} 계약 정산</h2>
            <span data-ui="app-projects-project-id-page.project-status-badge" style={{ fontSize: 12, fontWeight: 800, color: STATUS_META[project.status].color, background: STATUS_META[project.status].bg, borderRadius: 999, padding: '4px 10px' }}>
              {STATUS_META[project.status].label}
            </span>
          </div>
          <ProjectStageStepper currentStage={project.stageIndex}/>
          <div data-ui="app-projects-project-id-page.project-summary-box" style={{ minHeight: 62, border: `1px solid ${C.g200}`, borderRadius: 16, display: 'grid', gridTemplateColumns: '72px minmax(150px, 1.35fr) minmax(132px, 1.05fr) minmax(120px, .95fr)', gap: 12, alignItems: 'center', color: C.g800, fontSize: 16, lineHeight: 1.45, fontWeight: 700, background: '#FCFEFD', padding: '12px 16px' }}>
            {[
              ['관리자', project.manager],
              ['공사명', project.constructionName],
              ['공사기간', project.period],
              ['금액', `${project.constructionAmount}원`],
          ].map(([label, value]) => (<div data-ui="app-projects-project-id-page.project-summary-item" key={label} style={{ minWidth: 0 }}>
                <div data-ui="app-projects-project-id-page.project-summary-label" style={{ fontSize: 12, color: C.g400, fontWeight: 900, marginBottom: 2, whiteSpace: 'nowrap' }}>{label}</div>
                <div data-ui="app-projects-project-id-page.project-summary-value" title={value} style={{ fontSize: 14, color: C.g800, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
              </div>))}
          </div>
        </div>
      </Card>

      <div data-ui="app-projects-project-id-page.div-31" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {availableTabs.map((tab) => (<button data-ui="app-projects-project-id-page.button-2" key={tab.id} onClick={() => updateTab(tab.id)} style={{ padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, fontWeight: 800, background: activeTab === tab.id ? C.primary : C.white, color: activeTab === tab.id ? '#fff' : C.g600, boxShadow: activeTab === tab.id ? `0 2px 10px ${C.primary}30` : '0 1px 4px rgba(0,0,0,.06)' }}>
              {tab.label}
            </button>))}
        </div>
        {activeTab === 'upload' && uploadCount > 0 && (<div data-ui="app-projects-project-id-page.upload-summary" style={{ padding: '10px 13px', borderRadius: 12, background: C.bg, color: C.primary, fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap' }}>
          총 {uploadCount}개 파일 업로드 완료 - AI 자동 분류 중이에요.
        </div>)}
      </div>

      <div data-ui="app-projects-project-id-page.main-content-body" style={{ minWidth: 0 }}>
        {tabContent[activeTab]}
      </div>
      <aside data-ui="app-projects-project-id-page.floating-history-sidebar" className="floating-history-sidebar">
        {historyCard}
      </aside>
    </AppFrame>);
}

