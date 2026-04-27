'use client';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import { AppFrame, ProjectStageStepper } from '../../../components/common';
import { C } from '../../../lib/theme';
import { CURRENT_USER, getProjectById, STATUS_META } from '../../../lib/project-data';
import { can } from '../../../lib/permissions';
import { getAvailableProjectActions, getProjectStageId, type ProjectActionTargetTab } from '../../../lib/project-actions';
import { getStageLabel } from '../../../lib/project-stages';
import { workflowStorage } from '../../../lib/workflow-storage';
import UploadScreen from '../../../features/project-tab/UploadScreen';
import ArchiveScreen from '../../../features/project-tab/ArchiveScreen';
import VerifyScreen from '../../../features/project-tab/VerifyScreen';
import { buildArchiveDataFromUploads } from '../../../lib/mock-data';
import type { ArchiveSeed, EvidenceCategory, EvidenceFile } from '../../../types/domain';
type DetailTab = 'overview' | 'upload' | 'validation' | 'actions' | 'report' | 'archive';
const TABS: Array<{
    id: DetailTab;
    label: string;
}> = [
    { id: 'overview', label: '개요' },
    { id: 'upload', label: '증빙 업로드' },
    { id: 'archive', label: '아카이브' },
    { id: 'validation', label: '유효성 검증' },
    { id: 'actions', label: '조치 요청/보완' },
    { id: 'report', label: '보고서' },
];
const DETAIL_TABS = new Set<DetailTab>(['overview', 'upload', 'validation', 'actions', 'report', 'archive']);
export default function ProjectDetailPage() {
    const router = useRouter();
    const params = useParams<{
        projectId: string;
    }>();
    const searchParams = useSearchParams();
    const projectId = params?.projectId || '';
    const project = useMemo(() => getProjectById(projectId), [projectId]);
    const projectActions = useMemo(() => getAvailableProjectActions(CURRENT_USER, project), [project]);
    const currentStageLabel = getStageLabel(getProjectStageId(project));
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
    const canUploadEvidence = can(CURRENT_USER, 'uploadEvidence');
    const canRunValidation = can(CURRENT_USER, 'runValidation');
    const canReviewReport = can(CURRENT_USER, 'reviewReport');
    const canRequestAction = can(CURRENT_USER, 'requestAction');
    const availableTabs = TABS.filter((tab) => {
        if (tab.id === 'upload')
            return canUploadEvidence;
        if (tab.id === 'validation')
            return canRunValidation;
        if (tab.id === 'actions')
            return canRequestAction;
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
    const updateTab = (tab: DetailTab | ProjectActionTargetTab) => {
        if (!availableTabIds.has(tab))
            return;
        setActiveTab(tab);
        router.replace(`/projects/${project.id}?tab=${tab}`);
    };
    const historyCard = (<Card style={{ padding: '14px 16px', width: 240, boxShadow: '0 10px 24px rgba(27,94,59,.10)' }}>
      <div data-ui="app-projects-project-id-page.header-history-title" style={{ fontSize: 12, color: C.g400, fontWeight: 900, marginBottom: 10 }}>최근 이력</div>
      <div data-ui="app-projects-project-id-page.header-history-date-controls" style={{ display: 'grid', gridTemplateColumns: 'auto 92px', gap: 6, alignItems: 'center', marginBottom: 8 }}>
        <button data-ui="app-projects-project-id-page.header-history-date-all" onClick={() => {
            setSelectedHeaderHistoryDate('all');
            setHistoryDateMenuOpen(false);
        }} style={{ border: 'none', borderRadius: 999, padding: '6px 10px', fontSize: 10, fontWeight: 900, color: selectedHeaderHistoryDate === 'all' ? C.white : C.g600, background: selectedHeaderHistoryDate === 'all' ? C.primary : C.g100, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
          전체 날짜
        </button>
        
        <div data-ui="app-projects-project-id-page.header-history-date-menu-wrap" ref={historyDateMenuRef} style={{ position: 'relative', minWidth: 0 }}>
          <button data-ui="app-projects-project-id-page.header-history-date-menu-button" type="button" onClick={() => setHistoryDateMenuOpen((open) => !open)} style={{ width: '100%', border: `1px solid ${C.g200}`, borderRadius: 999, padding: '6px 9px', fontSize: 10, fontWeight: 900, color: selectedHeaderHistoryDate === 'all' ? C.g400 : C.primary, background: C.white, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {selectedHeaderHistoryDate === 'all' ? '날짜 선택' : selectedHeaderHistoryDate}
          </button>
          {historyDateMenuOpen && (<div data-ui="app-projects-project-id-page.header-history-date-menu" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 30, background: C.white, border: `1px solid ${C.g200}`, borderRadius: 12, boxShadow: '0 8px 20px rgba(27,94,59,.14)', padding: 4 }}>
              {headerHistoryItems.map((item) => (<button data-ui="app-projects-project-id-page.header-history-date-menu-item" key={item.date} type="button" onClick={() => {
                    setSelectedHeaderHistoryDate(item.date);
                    setHistoryDateMenuOpen(false);
                }} style={{ width: '100%', border: 'none', background: selectedHeaderHistoryDate === item.date ? C.bg : 'transparent', color: selectedHeaderHistoryDate === item.date ? C.primary : C.g600, borderRadius: 9, padding: '7px 8px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 10, fontWeight: 900, textAlign: 'left' }}>
                  {item.date}
                </button>))}
            </div>)}
        </div>
      </div>
      <div data-ui="app-projects-project-id-page.header-history-list" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
        {visibleHeaderHistoryItems.map((item) => (<div data-ui="app-projects-project-id-page.header-history-row" key={`${item.date}-${item.title}`} style={{ padding: '11px 12px', borderRadius: 12, background: C.g100, border: `1px solid ${C.g200}` }}>
            <div data-ui="app-projects-project-id-page.header-history-row-meta" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
              <span data-ui="app-projects-project-id-page.header-history-row-date" style={{ fontSize: 10, color: C.g400, fontWeight: 900 }}>{item.date}</span>
              <span data-ui="app-projects-project-id-page.header-history-row-count" style={{ fontSize: 10, color: item.count > 0 ? C.primary : C.g400, fontWeight: 900 }}>{item.count}건</span>
            </div>
            <div data-ui="app-projects-project-id-page.header-history-row-title" style={{ fontSize: 12, color: C.g800, fontWeight: 900, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
            <div data-ui="app-projects-project-id-page.header-history-row-summary" style={{ fontSize: 11, color: C.g600, lineHeight: 1.45 }}>
              {item.summary}
            </div>
          </div>))}
      </div>
    </Card>);
    const tabContent = {
        overview: (<div data-ui="app-projects-project-id-page.div-1" style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr', gap: 18 }}>
        <Card style={{ padding: '22px 24px' }}>
          <div data-ui="app-projects-project-id-page.div-2" style={{ fontSize: 14, fontWeight: 800, color: C.g800, marginBottom: 12 }}>현재 단계</div>
          <ProjectStageStepper currentStage={project.stageIndex}/>
          <div data-ui="app-projects-project-id-page.div-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 18 }}>
            <div data-ui="app-projects-project-id-page.div-4">
              <div data-ui="app-projects-project-id-page.div-5" style={{ fontSize: 11, fontWeight: 700, color: C.g400 }}>최근 현황</div>
              <div data-ui="app-projects-project-id-page.div-6" style={{ fontSize: 13, color: C.g600, marginTop: 6, lineHeight: 1.7 }}>{project.recentActivity}</div>
            </div>
            <div data-ui="app-projects-project-id-page.div-7">
              <div data-ui="app-projects-project-id-page.div-8" style={{ fontSize: 11, fontWeight: 700, color: C.g400 }}>다음 해야 할 일</div>
              <div data-ui="app-projects-project-id-page.div-9" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {projectActions.map((action) => (<button data-ui="app-projects-project-id-page.button-1" key={action.kind} onClick={() => updateTab(action.targetTab)} style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 12, border: `1px solid ${action.priority === 'primary' ? C.light : C.g200}`, background: action.priority === 'primary' ? C.bg : C.white, cursor: 'pointer', fontFamily: 'inherit' }}>
                    <div data-ui="app-projects-project-id-page.div-10" style={{ fontSize: 13, color: action.priority === 'primary' ? C.primary : C.g800, fontWeight: 900 }}>{action.label}</div>
                    <div data-ui="app-projects-project-id-page.div-11" style={{ fontSize: 12, color: C.g600, marginTop: 4, lineHeight: 1.55 }}>{action.description}</div>
                  </button>))}
              </div>
            </div>
          </div>
        </Card>
        <Card style={{ padding: '22px 24px' }}>
          <div data-ui="app-projects-project-id-page.div-12" style={{ fontSize: 14, fontWeight: 800, color: C.g800, marginBottom: 12 }}>프로젝트 기본정보</div>
          <div data-ui="app-projects-project-id-page.div-13" style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: '10px 12px', fontSize: 13 }}>
            {[
                ['관리자', project.manager],
                ['참여자', project.participants.join(', ')],
                ['계약번호', project.contractNumber],
                ['기간', project.period],
                ['현재 단계', currentStageLabel],
            ].map(([label, value]) => (<Fragment key={String(label)}>
                <div data-ui="app-projects-project-id-page.div-14" style={{ color: C.g400, fontWeight: 700 }}>{label}</div>
                <div data-ui="app-projects-project-id-page.div-15" style={{ color: C.g800, fontWeight: 700 }}>{value}</div>
              </Fragment>))}
          </div>
        </Card>
      </div>),
        upload: (<UploadScreen contractName={project.name} contractMeta={{
                name: project.name,
                num: project.contractNumber,
                period: project.period,
                round: `${project.stageIndex + 1}차`,
            }} onMatchComplete={(payload: {
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
        actions: (<Card style={{ padding: '22px 24px' }}>
        <div data-ui="app-projects-project-id-page.div-16" style={{ fontSize: 14, fontWeight: 800, color: C.g800, marginBottom: 10 }}>현장 조치 요청/보완 관리</div>
        <div data-ui="app-projects-project-id-page.div-17" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div data-ui="app-projects-project-id-page.div-18" style={{ border: `1px solid ${C.g200}`, borderRadius: 16, padding: 16 }}>
            <div data-ui="app-projects-project-id-page.div-19" style={{ fontSize: 12, fontWeight: 800, color: C.g800 }}>조치 요청 목록</div>
            <div data-ui="app-projects-project-id-page.div-20" style={{ fontSize: 12, color: C.g400, marginTop: 8 }}>프로젝트 관리자와 조치 담당자 기준으로 누가 언제 어떤 보완을 요청했는지 관리</div>
          </div>
          <div data-ui="app-projects-project-id-page.div-21" style={{ border: `1px solid ${C.g200}`, borderRadius: 16, padding: 16 }}>
            <div data-ui="app-projects-project-id-page.div-22" style={{ fontSize: 12, fontWeight: 800, color: C.g800 }}>보완 제출 현황</div>
            <div data-ui="app-projects-project-id-page.div-23" style={{ fontSize: 12, color: C.g400, marginTop: 8 }}>현장 참여자가 올린 보완 증빙과 미처리 건을 추적</div>
          </div>
        </div>
      </Card>),
        report: (<VerifyScreen initialTab="report" initialStatus="done" contractName={project.name}/>),
        archive: (<ArchiveScreen matchReady={matchReady} onDismissMatchReady={() => {
                workflowStorage.setMatchReady(false);
                setMatchReady(false);
            }} archiveSeed={archiveSeed}/>),
    };
    return (<AppFrame title={project.name} description="프로젝트별 단계, 검토 상태, 조치 요청, 보고서 수정 이력을 한 화면에서 관리하는 상세 화면입니다." actions={<Button size="sm" onClick={() => { window.location.href = '/projects'; }}>목록으로</Button>}>
      <Card style={{ padding: '18px 20px', marginBottom: 18 }}>
        <div data-ui="app-projects-project-id-page.div-24">
          <div data-ui="app-projects-project-id-page.div-25">
            <div data-ui="app-projects-project-id-page.div-26" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <span data-ui="app-projects-project-id-page.span-1" style={{ fontSize: 12, color: C.g400, fontWeight: 700 }}>{project.contractNumber}</span>
              <span data-ui="app-projects-project-id-page.span-2" style={{ fontSize: 10, fontWeight: 800, color: STATUS_META[project.status].color, background: STATUS_META[project.status].bg, borderRadius: 999, padding: '4px 10px' }}>
                {STATUS_META[project.status].label}
              </span>
            </div>
            <ProjectStageStepper currentStage={project.stageIndex}/>
          </div>
        </div>
      </Card>

      <div data-ui="app-projects-project-id-page.div-31" style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {availableTabs.map((tab) => (<button data-ui="app-projects-project-id-page.button-2" key={tab.id} onClick={() => updateTab(tab.id)} style={{ padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, background: activeTab === tab.id ? C.primary : C.white, color: activeTab === tab.id ? '#fff' : C.g600, boxShadow: activeTab === tab.id ? `0 2px 10px ${C.primary}30` : '0 1px 4px rgba(0,0,0,.06)' }}>
            {tab.label}
          </button>))}
      </div>

      <div data-ui="app-projects-project-id-page.main-content-body" style={{ minWidth: 0 }}>
        {tabContent[activeTab]}
      </div>
      <aside data-ui="app-projects-project-id-page.floating-history-sidebar" className="floating-history-sidebar">
        {historyCard}
      </aside>
    </AppFrame>);
}
