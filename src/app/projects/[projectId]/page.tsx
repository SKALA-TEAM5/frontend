'use client';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Card from '../../../components/ui/Card';
import { AppFrame, ProjectStageStepper } from '../../../components/common';
import { C } from '../../../lib/theme';
import { getMonthlyUsageStatements, getProjectById, PROJECT_STAGES, STATUS_META } from '../../../lib/project-data';
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
    const [validationStatusByMonth, setValidationStatusByMonth] = useState<Record<string, 'idle' | 'running' | 'done'>>({});
    const [uploadCount, setUploadCount] = useState(0);
    const [selectedHeaderHistoryDate, setSelectedHeaderHistoryDate] = useState('all');
    const [historyDateMenuOpen, setHistoryDateMenuOpen] = useState(false);
    const historyDateMenuRef = useRef<HTMLDivElement | null>(null);
    const visibleHeaderHistoryItems = selectedHeaderHistoryDate === 'all'
        ? headerHistoryItems
        : headerHistoryItems.filter((item) => item.date === selectedHeaderHistoryDate);
    const selectedStatement = monthlyStatements.find((statement) => statement.month === selectedMonth) || latestStatement;
    const selectedValidationStatus = validationStatusByMonth[selectedStatement.month] || 'idle';
    useEffect(() => {
        setArchiveSeed(workflowStorage.getArchiveSeed(project.id));
        setMatchReady(workflowStorage.getMatchReady(project.id));
    }, [project.id]);
    useEffect(() => {
        setSelectedMonth(latestStatement.month);
    }, [latestStatement.month]);
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
    const historyCard = (<Card style={{ padding: '14px 16px', width: 240 }}>
      <div data-ui="project-detail.1" style={{ fontSize: 14, color: C.g400, fontWeight: 900, marginBottom: 10 }}>최근 이력</div>
      <div data-ui="project-detail.2" style={{ display: 'grid', gridTemplateColumns: 'auto 92px', gap: 6, alignItems: 'center', marginBottom: 8 }}>
        <button data-ui="project-detail.3" onClick={() => {
            setSelectedHeaderHistoryDate('all');
            setHistoryDateMenuOpen(false);
        }} style={{ border: 'none', borderRadius: 999, padding: '6px 10px', fontSize: 12, fontWeight: 900, color: selectedHeaderHistoryDate === 'all' ? C.white : C.g600, background: selectedHeaderHistoryDate === 'all' ? C.primary : C.g100, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>전체 날짜</button>
        
        <div data-ui="project-detail.4" ref={historyDateMenuRef} style={{ position: 'relative', minWidth: 0 }}>
          <button data-ui="project-detail.5" type="button" onClick={() => setHistoryDateMenuOpen((open) => !open)} style={{ width: '100%', border: `1px solid ${C.g200}`, borderRadius: 999, padding: '6px 9px', fontSize: 12, fontWeight: 900, color: selectedHeaderHistoryDate === 'all' ? C.g400 : C.primary, background: C.white, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {selectedHeaderHistoryDate === 'all' ? '날짜 선택' : selectedHeaderHistoryDate}
          </button>
          {historyDateMenuOpen && (<div data-ui="project-detail.6" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 30, background: C.white, border: `1px solid ${C.g200}`, borderRadius: 12, boxShadow: '0 8px 20px rgba(27,94,59,.14)', padding: 4 }}>
              {headerHistoryItems.map((item) => (<button data-ui="project-detail.7" key={item.date} type="button" onClick={() => {
                    setSelectedHeaderHistoryDate(item.date);
                    setHistoryDateMenuOpen(false);
                }} style={{ width: '100%', border: 'none', background: selectedHeaderHistoryDate === item.date ? C.bg : 'transparent', color: selectedHeaderHistoryDate === item.date ? C.primary : C.g600, borderRadius: 9, padding: '7px 8px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 900, textAlign: 'left' }}>
                  {item.date}
                </button>))}
            </div>)}
        </div>
      </div>
      <div data-ui="project-detail.8" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
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
    </Card>);
    
    const projectInfoCard = (<Card style={{ padding: '15px 16px', width: 240 }}>
      <div data-ui="project-detail.33" style={{ fontSize: 14, color: C.g400, fontWeight: 900, marginBottom: 10 }}>프로젝트 정보</div>
      <div data-ui="project-detail.34" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
                ['계약번호', project.contractNumber],
                ['건설업체', project.constructionCompany],
                ['관리자', project.manager],
                ['공사기간', project.period],
                ['공사금액', `${project.constructionAmount}원`],
                ['소재지', project.location],
            ].map(([label, value]) => (<div data-ui="project-detail.35" key={label} style={{ borderBottom: `1px solid ${C.g100}`, paddingBottom: 9 }}>
            <div data-ui="project-detail.36" style={{ fontSize: 12, fontWeight: 900, color: C.g400, marginBottom: 3 }}>{label}</div>
            <div data-ui="project-detail.37" title={value} style={{ fontSize: 13, fontWeight: 900, color: C.g800, lineHeight: 1.4, wordBreak: 'keep-all', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{value}</div>
          </div>))}
      </div>
    </Card>);
    const tabContent = {
        overview: (<Card style={{ padding: '28px 32px' }}>
        <div data-ui="project-detail.15" style={{ fontSize: 18, fontWeight: 900, color: C.g800, marginBottom: 20 }}>{selectedStatement.label} 사용내역서 정보</div>
        <div data-ui="project-detail.16" style={{ display: 'grid', gridTemplateColumns: '130px minmax(0,1fr) 130px minmax(0,1fr)', gap: '16px 18px', fontSize: 15, maxWidth: 860 }}>
          {[
                ['보고월', selectedStatement.label],
                ['원본파일', selectedStatement.sourceFileName],
                ['개정번호', `${selectedStatement.revisionNo}차`],
                ['문서작성일', selectedStatement.documentWrittenDate],
                ['업로드일', selectedStatement.uploadedAt],
                ['업로드 담당자', selectedStatement.uploadedBy],
                ['파싱상태', selectedStatement.parseStatus],
                ['검증상태', selectedStatement.validationStatus],
                ['금회금액', `${selectedStatement.currentAmount}원`],
                ['누계금액', `${selectedStatement.cumulativeAmount}원`],
                ['증빙 파일', `${selectedStatement.evidenceCount}개`],
                ['이슈 항목', `${selectedStatement.issueCount}건`],
            ].map(([label, value]) => (<Fragment key={String(label)}>
              <div data-ui="project-detail.17" style={{ color: C.g400, fontWeight: 900 }}>{label}</div>
              <div data-ui="project-detail.18" style={{ color: C.g800, fontWeight: 800 }}>{value}</div>
            </Fragment>))}
        </div>
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
        validation: (<VerifyScreen initialTab="dashboard" initialStatus={selectedValidationStatus === 'done' ? 'done' : 'idle'} hideValidationIntro contractName={`${project.name} · ${selectedStatement.label}`}/>),
        report: (<VerifyScreen initialTab="report" initialStatus="done" contractName={`${project.name} · ${selectedStatement.label}`}/>),
        archive: (<ArchiveScreen matchReady={matchReady} onDismissMatchReady={() => {
                workflowStorage.setMatchReady(project.id, false);
                setMatchReady(false);
            }} archiveSeed={archiveSeed} validationStatus={selectedValidationStatus} onRunValidation={runArchiveValidation}/>),
    };
    return (<AppFrame title={project.name} mainClassName="project-detail-main-with-history">
      <Card style={{ padding: '18px 20px', marginBottom: 14, overflow: 'hidden' }}>
        <div data-ui="project-detail.19" style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div data-ui="project-detail.20" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', minWidth: 0 }}>
            <h2 data-ui="project-detail.21" style={{ fontSize: 22, fontWeight: 900, color: C.g800, lineHeight: 1.25, margin: 0, minWidth: 240, flex: '1 1 360px' }}>{project.constructionName} 계약 정산</h2>
            <div data-ui="project-detail.22" style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', justifyContent: 'flex-end', flex: '0 1 auto', minWidth: 0 }}>
              {monthlyStatements.map((statement) => {
                const active = selectedStatement.month === statement.month;
                return (<button data-ui="project-detail.23" key={statement.month} type="button" onClick={() => setSelectedMonth(statement.month)} style={{ border: `1px solid ${active ? C.primary : C.g200}`, borderRadius: 999, padding: '7px 11px', background: active ? C.primary : C.white, color: active ? C.white : C.g600, fontFamily: 'inherit', fontSize: 13, fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {statement.label.replace('년 ', '.').replace('월', '')}
                </button>);
              })}
            </div>
          </div>
          <div data-ui="project-detail.24" style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: C.g400 }}>월별 진행 현황</span>
            </div>
            <div data-ui="project-detail.25" style={{ display: 'grid', gridTemplateColumns: `repeat(${monthlyStatements.length}, minmax(0, 1fr))`, gap: 10, minWidth: 0 }}>
              {monthlyStatements.map((statement, index) => {
                const active = statement.month === selectedStatement.month;
                const isLast = index === monthlyStatements.length - 1;
                const stageLabel = PROJECT_STAGES[statement.stageIndex] || '등록';
                return (<div key={statement.month} style={{ minWidth: 0 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: isLast ? '38px' : '38px minmax(0, 1fr)', alignItems: 'center', gap: 8, marginBottom: 6, minWidth: 0 }}>
                    <button type="button" onClick={() => setSelectedMonth(statement.month)} style={{ width: 38, height: 38, borderRadius: 999, border: `1px solid ${active ? '#B88400' : '#D9C58A'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: active ? '#B88400' : '#FFF8E1', color: active ? C.white : '#8A6D00', fontFamily: 'inherit', fontSize: 12, fontWeight: 900, cursor: 'pointer', padding: 0, flexShrink: 0 }}>
                      {statement.label.replace(/^2026년 /, '')}
                    </button>
                    {!isLast && <div style={{ flex: 1, height: 4, borderRadius: 99, background: '#EAD79A' }}/>}
                  </div>
                  <div title={`${statement.label} · ${stageLabel}`} style={{ fontSize: 12, fontWeight: 800, color: active ? '#8A6D00' : C.g600, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {stageLabel}
                  </div>
                </div>);
              })}
            </div>
          </div>
          <div data-ui="project-detail.26" style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 2, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: C.g400 }}>{selectedStatement.label} 진행 단계</span>
              <span data-ui="project-detail.27" style={{ fontSize: 12, fontWeight: 800, color: STATUS_META[project.status].color, background: STATUS_META[project.status].bg, borderRadius: 999, padding: '4px 10px' }}>
                {STATUS_META[project.status].label}
              </span>
            </div>
            <ProjectStageStepper currentStage={selectedStatement.stageIndex}/>
          </div>
        </div>
      </Card>

      <div data-ui="project-detail.28" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {availableTabs.map((tab) => (<button data-ui="project-detail.29" key={tab.id} onClick={() => updateTab(tab.id)} style={{ padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, fontWeight: 800, background: activeTab === tab.id ? C.primary : C.white, color: activeTab === tab.id ? '#fff' : C.g600, boxShadow: activeTab === tab.id ? `0 2px 10px ${C.primary}30` : '0 1px 4px rgba(0,0,0,.06)' }}>
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
      <aside data-ui="project-detail.32" className="project-detail-sidebar">
        <div data-ui="project-detail.38" className="project-detail-side-stack">
          <div data-ui="project-detail.39" className="project-detail-info-sticky">
            {projectInfoCard}
          </div>
          {historyCard}
        </div>
      </aside>
    </AppFrame>);
}
