'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { AppFrame, ProjectStageStepper } from '../../components/common';
import PeriodFilter from '../../components/common/PeriodFilter';
import { C } from '../../lib/theme';
import { getAccessibleProjects, getDashboardCounts, getMonthlyUsageStatements, getSheFilterOptions, PROJECT_STAGES, STATUS_META } from '../../lib/project-data';
import { getPrimaryProjectAction } from '../../lib/project-actions';
import { useCurrentUser } from '../../lib/dev-user';
import { REPORT_DATA, fmt } from '../../lib/mock-data';
import { getVisibleProjects, SORT_LABELS, type PeriodMode, type SortOption } from '../../lib/project-list';
import { ACTION_NOTIFICATION_EVENT, getActionNotifications, type ActionNotification } from '../../lib/action-notifications';
import {
  DASHBOARD_WIDGETS,
  DASHBOARD_WIDGET_LAYOUT_STORAGE_KEY,
  DASHBOARD_WIDGET_STORAGE_KEY,
  DEFAULT_WIDGET_IDS,
  DEFAULT_WIDGET_LAYOUT,
  GRID_COLUMN_COUNT,
  GRID_EDIT_PADDING,
  GRID_GAP,
  GRID_ROW_GUIDE_HEIGHT,
  WIDGET_SIZES,
  dashboardEditGridStyle,
  dashboardGridStyle,
  getGridCellMetrics,
  resolveLayoutWithPushDown,
  widgetPlacementStyle,
  type DashboardWidgetId,
  type WidgetHelpId,
  type WidgetPosition,
} from '../../features/dashboard/widget-layout';

const fieldStyle: CSSProperties = {
  width: '100%',
  height: 38,
  padding: '11px 12px',
  borderRadius: 12,
  border: `1px solid ${C.g200}`,
  fontFamily: 'inherit',
  fontSize: 14,
  color: C.g800,
  background: C.white,
};

const sortBarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  marginBottom: 14,
};

const sortButtonStyle = (active: boolean): CSSProperties => ({
  border: 'none',
  padding: 0,
  background: 'transparent',
  color: active ? C.primary : C.g600,
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: active ? 900 : 800,
  cursor: 'pointer',
});

const widgetTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 900,
  color: C.g400,
  marginBottom: 12,
};

const widgetLabelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: C.g400,
};

const widgetValueStyle: CSSProperties = {
  fontSize: 24,
  fontWeight: 900,
  color: C.g800,
  lineHeight: 1.15,
};

const tooltipStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 'calc(100% + 8px)',
  zIndex: 30,
  width: 200,
  padding: '12px 13px',
  borderRadius: 12,
  background: C.white,
  border: `1px solid ${C.g200}`,
  boxShadow: '0 12px 28px rgba(27,94,59,.16)',
};

const tooltipListStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const tooltipItemStyle: CSSProperties = {
  fontSize: 13,
  color: C.g600,
  lineHeight: 1.45,
};

const titleTooltipStyle: CSSProperties = {
  ...tooltipStyle,
  width: 250,
  top: 'calc(100% + 6px)',
};

const widgetHelpText: Record<WidgetHelpId, string> = {
  projectStatus: '접근 가능한 프로젝트의 주요 상태를 요약합니다.',
  todayTasks: '오늘 우선 확인해야 하는 프로젝트 작업을 보여줍니다.',
  recentActivity: '최근 업로드, 요청, 보고서 수정과 같은 프로젝트 활동을 보여줍니다.',
  sla: '조치 요청 등록 후 처리 기한까지 남은 시간을 보여줍니다.',
  openActionRequests: '아직 해결되지 않은 조치 요청 프로젝트 수를 보여줍니다.',
  risk: '검증 결과에서 정산 리스크가 있는 항목을 요약합니다.',
  missingUpload: '증빙 업로드가 아직 부족한 프로젝트를 확인합니다.',
  unreadNotifications: '프로젝트 담당자가 보낸 미확인 조치 완료 알림을 보여줍니다.',
  settlementProgress: '모든 프로젝트의 정산 진행률을 보여줍니다.',
  workload: '담당자별 프로젝트 부담과 조치 요청 부담을 보여줍니다.',
  myProjects: '내가 볼 수 있는 모든 프로젝트를 검색, 필터, 정렬해 보여줍니다.',
};

export default function DashboardPage() {
  const { user } = useCurrentUser();
  const projects = getAccessibleProjects(user);
  const dashboardCounts = getDashboardCounts(user);
  const filterOptions = getSheFilterOptions(user);
  const [projectName, setProjectName] = useState('');
  const [contractNumber, setContractNumber] = useState('');
  const [period, setPeriod] = useState('');
  const [periodMode, setPeriodMode] = useState<PeriodMode>('all');
  const [manager, setManager] = useState(filterOptions.managers[0] || '전체');
  const [status, setStatus] = useState(filterOptions.statuses[0] || '전체');
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [riskTooltip, setRiskTooltip] = useState<'error' | 'warn' | null>(null);
  const [missingUploadTooltip, setMissingUploadTooltip] = useState(false);
  const [openActionTooltip, setOpenActionTooltip] = useState(false);
  const [unreadNotificationTooltip, setUnreadNotificationTooltip] = useState(false);
  const [titleTooltip, setTitleTooltip] = useState<WidgetHelpId | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [visibleWidgetIds, setVisibleWidgetIds] = useState<DashboardWidgetId[]>(DEFAULT_WIDGET_IDS);
  const [draggedWidgetId, setDraggedWidgetId] = useState<DashboardWidgetId | null>(null);
  const [widgetLayout, setWidgetLayout] = useState<Record<DashboardWidgetId, WidgetPosition>>(DEFAULT_WIDGET_LAYOUT);
  const [notifications, setNotifications] = useState<ActionNotification[]>([]);
  const dashboardGridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(DASHBOARD_WIDGET_STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as DashboardWidgetId[];
      const validIds = parsed.filter((id) => DEFAULT_WIDGET_IDS.includes(id));
      if (!validIds.includes('openActionRequests')) {
        validIds.push('openActionRequests');
      }
      if (!validIds.includes('unreadNotifications')) {
        validIds.push('unreadNotifications');
      }
      setVisibleWidgetIds(validIds);
    } catch {
      window.localStorage.removeItem(DASHBOARD_WIDGET_STORAGE_KEY);
    }
    const storedLayout = window.localStorage.getItem(DASHBOARD_WIDGET_LAYOUT_STORAGE_KEY);
    if (!storedLayout) return;
    try {
      const parsed = JSON.parse(storedLayout) as Partial<Record<DashboardWidgetId, WidgetPosition>>;
      setWidgetLayout({ ...DEFAULT_WIDGET_LAYOUT, ...parsed });
    } catch {
      window.localStorage.removeItem(DASHBOARD_WIDGET_LAYOUT_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const syncNotifications = () => setNotifications(getActionNotifications());
    syncNotifications();
    window.addEventListener(ACTION_NOTIFICATION_EVENT, syncNotifications);
    window.addEventListener('storage', syncNotifications);
    return () => {
      window.removeEventListener(ACTION_NOTIFICATION_EVENT, syncNotifications);
      window.removeEventListener('storage', syncNotifications);
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(DASHBOARD_WIDGET_STORAGE_KEY, JSON.stringify(visibleWidgetIds));
  }, [visibleWidgetIds]);
  useEffect(() => {
    window.localStorage.setItem(DASHBOARD_WIDGET_LAYOUT_STORAGE_KEY, JSON.stringify(widgetLayout));
  }, [widgetLayout]);

  const visibleWidgetSet = useMemo(() => new Set(visibleWidgetIds), [visibleWidgetIds]);
  const toggleWidget = (id: DashboardWidgetId) => {
    setVisibleWidgetIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };
  const resetWidgets = () => {
    window.localStorage.removeItem(DASHBOARD_WIDGET_STORAGE_KEY);
    window.localStorage.removeItem(DASHBOARD_WIDGET_LAYOUT_STORAGE_KEY);
    setVisibleWidgetIds(DEFAULT_WIDGET_IDS);
    setWidgetLayout(DEFAULT_WIDGET_LAYOUT);
  };
  const hideWidget = (id: DashboardWidgetId) => setVisibleWidgetIds((current) => current.filter((item) => item !== id));
  const moveWidgetToGridCell = (event: React.DragEvent<HTMLDivElement>) => {
    if (!draggedWidgetId || !dashboardGridRef.current) return;
    const grid = dashboardGridRef.current;
    const rect = grid.getBoundingClientRect();
    const { columnPitch } = getGridCellMetrics(grid);
    const x = Math.max(0, event.clientX - rect.left + grid.scrollLeft - GRID_EDIT_PADDING);
    const y = Math.max(0, event.clientY - rect.top + grid.scrollTop - GRID_EDIT_PADDING);
    const size = WIDGET_SIZES[draggedWidgetId];
    const maxColumn = Math.max(1, GRID_COLUMN_COUNT - size.colSpan + 1);
    const col = Math.min(maxColumn, Math.floor(x / columnPitch) + 1);
    const row = Math.min(Math.max(1, Math.floor(y / (GRID_ROW_GUIDE_HEIGHT + GRID_GAP)) + 1), 24);
    const activeWidgetIds = visibleWidgetIds.includes(draggedWidgetId) ? visibleWidgetIds : [...visibleWidgetIds, draggedWidgetId];
    setWidgetLayout((current) => {
      return resolveLayoutWithPushDown(current, activeWidgetIds, draggedWidgetId, { col, row });
    });
    setVisibleWidgetIds((current) => {
      if (current.includes(draggedWidgetId)) return current;
      return [...current, draggedWidgetId];
    });
  };

  const visibleProjects = useMemo(() => {
    return getVisibleProjects(projects, {
      projectName,
      contractNumber,
      period,
      periodMode,
      manager,
      status,
      allManagerLabel: filterOptions.managers[0],
      allStatusLabel: filterOptions.statuses[0],
    }, sortBy);
  }, [contractNumber, filterOptions.managers, filterOptions.statuses, manager, period, periodMode, projectName, projects, sortBy, status]);

  const workItems = projects.filter((project) => project.status === 'action_required' || project.status === 'drafting_report');
  const recentActivities = [
    {
      project: projects[0],
      date: '2026/04/23 10:14',
      actor: '김현장',
      action: '개인보호구 항목 영수증 업로드',
    },
    {
      project: projects[0],
      date: '2026/04/23 11:02',
      actor: 'SHE',
      action: '현장사진 보완 요청 등록',
    },
    {
      project: projects[1],
      date: '2026/04/23 11:40',
      actor: '박공무',
      action: '보고서 초안 수정',
    },
    {
      project: projects[2],
      date: '2026/04/24 09:18',
      actor: '이프로',
      action: '신규 프로젝트 등록',
    },
  ]
    .filter((item) => item.project)
    .sort((a, b) => new Date(b.date.replace(/\//g, '-')).getTime() - new Date(a.date.replace(/\//g, '-')).getTime())
    .slice(0, 4);
  const actionProjects = projects.filter((project) => project.status === 'action_required');
  const todayTime = new Date(new Date().toDateString()).getTime();
  const slaSummary = actionProjects.reduce(
    (acc, project) => {
      const dueTime = project.actionRequestDetails?.dueDate ? new Date(project.actionRequestDetails.dueDate).getTime() : 0;
      if (!dueTime) {
        acc.open += 1;
        return acc;
      }
      const diffDays = Math.ceil((dueTime - todayTime) / 86400000);
      if (diffDays < 0) acc.overdue += 1;
      else if (diffDays <= 3) acc.dueSoon += 1;
      else acc.open += 1;
      return acc;
    },
    { overdue: 0, dueSoon: 0, open: 0 },
  );
  const errorRows = REPORT_DATA.filter((row) => row.status === 'error');
  const warnRows = REPORT_DATA.filter((row) => row.status === 'warn');
  const riskCards = [
    {
      id: 'error' as const,
      label: '부적정',
      count: errorRows.length,
      color: C.danger,
      rows: errorRows,
      emptyText: '부적정 항목 없음',
    },
    {
      id: 'warn' as const,
      label: '조건부',
      count: warnRows.length,
      color: C.warn,
      rows: warnRows,
      emptyText: '조건부 항목 없음',
    },
  ];
  const missingUploadProjects = projects.filter((project) => !project.hasUploads || project.status === 'upload_pending');
  const unreadSheNotifications = notifications.filter((notification) => notification.recipientRole === 'she_manager' && !notification.read);
  const progressPercent = projects.length
    ? Math.round((projects.reduce((sum, project) => sum + project.stageIndex, 0) / (projects.length * Math.max(PROJECT_STAGES.length - 1, 1))) * 100)
    : 0;
  const managerWorkloads = Array.from(
    projects.reduce((map, project) => {
      const current = map.get(project.manager) || { total: 0, actionRequired: 0 };
      map.set(project.manager, {
        total: current.total + 1,
        actionRequired: current.actionRequired + (project.status === 'action_required' ? 1 : 0),
      });
      return map;
    }, new Map<string, { total: number; actionRequired: number }>()),
  ).sort((a, b) => b[1].total - a[1].total);
  const renderWidgetTitle = (label: string, id: WidgetHelpId, style: CSSProperties = widgetTitleStyle, align: 'left' | 'right' = 'left') => (
    <div
      style={{ position: 'relative', display: 'block', width: 'fit-content', ...style }}
      onMouseEnter={() => setTitleTooltip(id)}
      onMouseLeave={() => setTitleTooltip(null)}
    >
      {label}
      {titleTooltip === id && (
        <div style={{ ...titleTooltipStyle, left: align === 'left' ? 0 : 'auto', right: align === 'right' ? 0 : 'auto' }}>
          <div style={tooltipListStyle}>
            <div style={tooltipItemStyle}>{widgetHelpText[id]}</div>
          </div>
        </div>
      )}
    </div>
  );
  const getLatestMonthLabel = (projectId: string) => {
    const statements = getMonthlyUsageStatements(projectId);
    return statements[statements.length - 1]?.label || '';
  };
  const widgetFrameProps = (id: DashboardWidgetId, style: CSSProperties = {}) => {
    const size = WIDGET_SIZES[id];
    const position = widgetLayout[id] || DEFAULT_WIDGET_LAYOUT[id];
    return {
    draggable: editMode,
    onDragStart: () => setDraggedWidgetId(id),
    onDragOver: (event: React.DragEvent<HTMLDivElement>) => {
      if (!editMode) return;
      event.preventDefault();
    },
    onDrop: (event: React.DragEvent<HTMLDivElement>) => {
      if (!editMode) return;
      event.preventDefault();
      event.stopPropagation();
      moveWidgetToGridCell(event);
    },
    onDragEnd: () => setDraggedWidgetId(null),
    style: {
      ...widgetPlacementStyle(size),
      position: 'relative',
      gridColumn: `${position.col} / span ${size.colSpan}`,
      gridRow: `${position.row} / span ${size.rowSpan}`,
      outline: editMode ? `1px dashed ${C.g200}` : undefined,
      cursor: editMode ? 'grab' : undefined,
      opacity: draggedWidgetId === id ? 0.55 : 1,
      ...style,
    } as CSSProperties,
    };
  };
  const renderWidgetRemoveButton = (id: DashboardWidgetId) => editMode ? (
    <button
      type="button"
      aria-label="위젯 숨기기"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        hideWidget(id);
      }}
      style={{ position: 'absolute', top: 10, right: 10, zIndex: 20, width: 22, height: 22, borderRadius: 999, border: `1px solid ${C.g200}`, background: C.white, color: C.g600, cursor: 'pointer', fontSize: 15, fontWeight: 900, lineHeight: '18px', padding: 0 }}
    >
      -
    </button>
  ) : null;

  return (
    <AppFrame title="프로젝트 대시보드">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <Button size="xs" variant={editMode ? 'primary' : 'outline'} onClick={() => setEditMode((mode) => !mode)}>
          {editMode ? '편집 완료' : '대시보드 편집'}
        </Button>
      </div>

      {editMode && (
        <Card style={{ padding: '16px 18px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: C.g800 }}>표시할 위젯 선택</div>
            <Button size="xs" variant="outline" onClick={resetWidgets}>전체 표시</Button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {DASHBOARD_WIDGETS.map((widget) => {
              const checked = visibleWidgetSet.has(widget.id);
              return (
                <label key={widget.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 10px', borderRadius: 999, border: `1px solid ${checked ? C.light : C.g200}`, background: checked ? C.bg : C.white, color: checked ? C.primary : C.g600, fontSize: 13, fontWeight: 900, cursor: 'pointer' }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleWidget(widget.id)} />
                  {widget.label}
                </label>
              );
            })}
          </div>
        </Card>
      )}

      <div
        ref={dashboardGridRef}
        data-ui="dashboard-widgets"
        onDragOver={(event) => {
          if (!editMode || !draggedWidgetId) return;
          event.preventDefault();
        }}
        onDrop={(event) => {
          if (!editMode || !draggedWidgetId) return;
          event.preventDefault();
          moveWidgetToGridCell(event);
          setDraggedWidgetId(null);
        }}
        style={{ ...dashboardGridStyle, ...(editMode ? dashboardEditGridStyle : {}) }}
      >
        {visibleWidgetSet.size === 0 && (
          <Card style={{ ...widgetPlacementStyle({ colSpan: 2, rowSpan: 1 }), padding: '28px 30px' }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: C.g800, marginBottom: 6 }}>표시 중인 위젯이 없습니다.</div>
            <div style={{ fontSize: 14, color: C.g400 }}>대시보드 편집에서 필요한 위젯을 선택해 주세요.</div>
          </Card>
        )}
        {visibleWidgetSet.has('projectStatus') && (
        <Card {...widgetFrameProps('projectStatus', { padding: '18px 20px', overflow: 'hidden' })}>
          {renderWidgetRemoveButton('projectStatus')}
          {renderWidgetTitle('프로젝트 현황', 'projectStatus', { fontSize: 14, fontWeight: 800, color: C.g400, marginBottom: 8 })}
          <div style={{ fontSize: 16, fontWeight: 900, color: C.g800, lineHeight: 1.22 }}>{user.name}님<br />오늘 확인할 프로젝트가 있습니다.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginTop: 12 }}>
            {[
              { label: '내 프로젝트', value: dashboardCounts.myProjects, color: C.primary, bg: C.bg },
              { label: '조치 요청', value: dashboardCounts.actionRequired, color: C.danger, bg: C.dangerBg },
              { label: '검토 중', value: dashboardCounts.reviewing, color: C.warn, bg: '#FFF8F0' },
              { label: '보고서 작성 중', value: dashboardCounts.reportDrafting, color: '#7B4CE2', bg: '#F5F0FF' },
            ].map((item) => (
              <div key={item.label} style={{ borderRadius: 14, padding: '13px 11px', minHeight: 72, background: item.bg }}>
                <div style={{ fontSize: 12, color: C.g400, fontWeight: 700 }}>{item.label}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: item.color, marginTop: 3 }}>{item.value}</div>
              </div>
            ))}
          </div>
        </Card>
        )}

        {visibleWidgetSet.has('todayTasks') && (
        <Card {...widgetFrameProps('todayTasks', { padding: '22px 20px', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 })}>
          {renderWidgetRemoveButton('todayTasks')}
          {renderWidgetTitle('오늘 할 일', 'todayTasks', { fontSize: 14, fontWeight: 800, color: C.g400, marginBottom: 12 })}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', paddingRight: 4, minHeight: 0, flex: 1 }}>
            {workItems.map((project) => {
              const actionRequest = project.status === 'action_required' ? project.actionRequestDetails : null;
              return (
                <Link key={project.id} href={`/projects/${project.id}`} style={{ textDecoration: 'none' }}>
                  <div style={{ padding: '12px 13px', borderRadius: 14, border: `1px solid ${C.g200}`, background: C.white }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: C.g800, lineHeight: '22px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</div>
                        <span style={{ fontSize: 11, fontWeight: 900, color: C.primary, background: C.bg, border: `1px solid ${C.g200}`, borderRadius: 999, padding: '2px 7px', lineHeight: '16px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {getLatestMonthLabel(project.id)}
                        </span>
                        <div style={{ fontSize: 12, color: C.g600, fontWeight: 800, lineHeight: '22px', whiteSpace: 'nowrap', flexShrink: 0 }}>{getPrimaryProjectAction(user, project).label}</div>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 800, color: STATUS_META[project.status].color, background: STATUS_META[project.status].bg, borderRadius: 999, padding: '3px 8px', lineHeight: '16px', whiteSpace: 'nowrap' }}>
                        {STATUS_META[project.status].label}
                      </span>
                    </div>
                    {actionRequest && (
                      <div style={{ marginTop: 9, padding: '9px 10px', borderRadius: 12, background: C.dangerBg, border: `1px solid #FFD5D5` }}>
                        <div style={{ fontSize: 13, color: C.g800, fontWeight: 900, marginBottom: 5 }}>{actionRequest.title}</div>
                        <div style={{ fontSize: 12, color: C.g600, lineHeight: 1.45 }}>{actionRequest.reason}</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, fontSize: 12, color: C.danger, fontWeight: 900 }}>
                          <span>담당 {actionRequest.assignee}</span>
                          <span>기한 {actionRequest.dueDate}</span>
                          <span>등록 {actionRequest.requestedAt}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
        )}

        {visibleWidgetSet.has('recentActivity') && (
        <Card {...widgetFrameProps('recentActivity', { padding: '22px 20px', display: 'flex', flexDirection: 'column', minHeight: 0 })}>
          {renderWidgetRemoveButton('recentActivity')}
          {renderWidgetTitle('최근 활동', 'recentActivity', { fontSize: 14, fontWeight: 800, color: C.g800, marginBottom: 12 })}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', paddingRight: 4, minHeight: 0 }}>
            {recentActivities.map((log) => (
              <Link key={`${log.project.id}-${log.date}-${log.action}`} href={`/projects/${log.project.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ padding: '10px 12px', borderRadius: 12, background: C.white, border: `1px solid ${C.g200}`, lineHeight: 1.5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: C.g400, fontWeight: 800 }}>
                    <span>{log.date}</span>
                    <span>·</span>
                    <span>{log.actor}</span>
                  </div>
                  <div style={{ fontSize: 13, color: C.g800, fontWeight: 800, marginTop: 3 }}>
                    {log.action}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Card>
        )}
        {visibleWidgetSet.has('sla') && (
        <Card {...widgetFrameProps('sla', { padding: '18px 18px' })}>
          {renderWidgetRemoveButton('sla')}
          {renderWidgetTitle('보완 요청 기한', 'sla')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {[
              ['기한 초과', slaSummary.overdue, C.danger],
              ['3일 이내', slaSummary.dueSoon, C.warn],
              ['진행 중', slaSummary.open, C.primary],
            ].map(([label, value, color], index) => (
              <div key={String(label)} style={{ borderRadius: 12, background: ['#FFF5F5', '#FFF8F0', C.bg][index], padding: '10px 8px' }}>
                <div style={widgetLabelStyle}>{label}</div>
                <div style={{ ...widgetValueStyle, color: String(color), marginTop: 5 }}>{value}</div>
              </div>
            ))}
          </div>
        </Card>
        )}

        {visibleWidgetSet.has('openActionRequests') && (
        <Card {...widgetFrameProps('openActionRequests', { padding: '18px 18px', display: 'flex', flexDirection: 'column' })}>
          {renderWidgetRemoveButton('openActionRequests')}
          {renderWidgetTitle('조치 미처리', 'openActionRequests', { ...widgetTitleStyle, marginBottom: 0 })}
          <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
            <div
              onMouseEnter={() => setOpenActionTooltip(true)}
              onMouseLeave={() => setOpenActionTooltip(false)}
              style={{ display: 'inline-flex', alignItems: 'baseline', position: 'relative', cursor: 'default', width: 'fit-content' }}
            >
              <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1, color: actionProjects.length ? C.danger : C.ok }}>{actionProjects.length}</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: actionProjects.length ? C.danger : C.ok, marginLeft: 4 }}>건</div>
              {openActionTooltip && (
                <div style={tooltipStyle}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: actionProjects.length ? C.danger : C.ok, marginBottom: 8 }}>미처리 조치 요청 프로젝트</div>
                  <div style={tooltipListStyle}>
                    {actionProjects.length === 0 ? (
                      <div style={{ fontSize: 13, color: C.g400, lineHeight: 1.5 }}>미처리 조치 요청이 없습니다.</div>
                    ) : actionProjects.slice(0, 4).map((project) => (
                      <div key={project.id} style={tooltipItemStyle}>
                        <div style={{ fontWeight: 900, color: C.g800 }}>{project.constructionName}</div>
                        <div>{project.manager} · {project.actionRequestDetails?.dueDate || '기한 미정'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
        )}

        {visibleWidgetSet.has('risk') && (
        <Card {...widgetFrameProps('risk', { padding: '18px 18px', overflow: 'visible' })}>
          {renderWidgetRemoveButton('risk')}
          {renderWidgetTitle('검증 리스크 요약', 'risk')}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {riskCards.map((item) => (
              <div
                key={item.id}
                onMouseEnter={() => setRiskTooltip(item.id)}
                onMouseLeave={() => setRiskTooltip(null)}
                style={{ position: 'relative', borderRadius: 12, padding: '8px 6px', cursor: 'default' }}
              >
                <div style={widgetLabelStyle}>{item.label}</div>
                <div style={{ ...widgetValueStyle, color: item.color }}>{item.count}건</div>
                {riskTooltip === item.id && (
                  <div style={tooltipStyle}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: item.color, marginBottom: 8 }}>{item.label} 세부 내용</div>
                    <div style={tooltipListStyle}>
                      {item.rows.length === 0 ? (
                        <div style={{ fontSize: 13, color: C.g400, lineHeight: 1.5 }}>{item.emptyText}</div>
                      ) : item.rows.slice(0, 3).map((row) => (
                        <div key={row.id} style={tooltipItemStyle}>
                          <div style={{ fontWeight: 900, color: C.g800 }}>{row.cat}</div>
                          <div>{row.note}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
        )}

        {visibleWidgetSet.has('missingUpload') && (
        <Card {...widgetFrameProps('missingUpload', { padding: '18px 18px', overflow: 'visible', display: 'flex', flexDirection: 'column' })}>
          {renderWidgetRemoveButton('missingUpload')}
          {renderWidgetTitle('업로드 누락', 'missingUpload', { ...widgetTitleStyle, marginBottom: 0 })}
          <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
            <div
              onMouseEnter={() => setMissingUploadTooltip(true)}
              onMouseLeave={() => setMissingUploadTooltip(false)}
              style={{ display: 'inline-flex', alignItems: 'baseline', position: 'relative', cursor: 'default', width: 'fit-content' }}
            >
              <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1, color: missingUploadProjects.length ? C.warn : C.ok }}>{missingUploadProjects.length}</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: missingUploadProjects.length ? C.warn : C.ok, marginLeft: 4 }}>개</div>
              {missingUploadTooltip && (
                <div style={tooltipStyle}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: missingUploadProjects.length ? C.warn : C.ok, marginBottom: 8 }}>업로드 누락 세부 내용</div>
                  <div style={tooltipListStyle}>
                    {missingUploadProjects.length === 0 ? (
                      <div style={{ fontSize: 13, color: C.g400, lineHeight: 1.5 }}>누락된 프로젝트가 없습니다.</div>
                    ) : missingUploadProjects.slice(0, 4).map((project) => (
                      <div key={project.id} style={tooltipItemStyle}>
                        <div style={{ fontWeight: 900, color: C.g800 }}>{project.constructionName}</div>
                        <div>{STATUS_META[project.status].label} · {project.manager}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
        )}

        {visibleWidgetSet.has('unreadNotifications') && (
        <Card {...widgetFrameProps('unreadNotifications', { padding: '18px 18px', overflow: 'visible', display: 'flex', flexDirection: 'column' })}>
          {renderWidgetRemoveButton('unreadNotifications')}
          {renderWidgetTitle('미확인 알림', 'unreadNotifications', { ...widgetTitleStyle, marginBottom: 0 })}
          <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
            <div
              onMouseEnter={() => setUnreadNotificationTooltip(true)}
              onMouseLeave={() => setUnreadNotificationTooltip(false)}
              style={{ display: 'inline-flex', alignItems: 'baseline', position: 'relative', cursor: 'default', width: 'fit-content' }}
            >
              <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1, color: unreadSheNotifications.length ? C.primary : C.ok }}>{unreadSheNotifications.length}</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: unreadSheNotifications.length ? C.primary : C.ok, marginLeft: 4 }}>건</div>
              {unreadNotificationTooltip && (
                <div style={tooltipStyle}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: unreadSheNotifications.length ? C.primary : C.ok, marginBottom: 8 }}>미확인 알림</div>
                  <div style={tooltipListStyle}>
                    {unreadSheNotifications.length === 0 ? (
                      <div style={{ fontSize: 13, color: C.g400, lineHeight: 1.5 }}>미확인 알림이 없습니다.</div>
                    ) : unreadSheNotifications.slice(0, 4).map((notification) => (
                      <Link key={notification.id} href={notification.projectId ? `/projects/${notification.projectId}` : '/projects'} style={{ textDecoration: 'none' }}>
                        <div style={tooltipItemStyle}>
                          <div style={{ fontWeight: 900, color: C.g800 }}>{notification.projectName}</div>
                          <div>{notification.categoryName} · {notification.createdAt}</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
        )}

        {visibleWidgetSet.has('settlementProgress') && (
        <Card {...widgetFrameProps('settlementProgress', { padding: '18px 18px' })}>
          {renderWidgetRemoveButton('settlementProgress')}
          {renderWidgetTitle('정산 진행률', 'settlementProgress')}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <div style={widgetLabelStyle}>평균</div>
            <div style={{ ...widgetValueStyle, color: C.primary }}>{progressPercent}%</div>
          </div>
          <div style={{ height: 9, borderRadius: 99, background: C.g100, overflow: 'hidden', marginTop: 12 }}>
            <div style={{ width: `${progressPercent}%`, height: '100%', borderRadius: 99, background: C.primary }} />
          </div>
        </Card>
        )}

        {visibleWidgetSet.has('workload') && (
        <Card {...widgetFrameProps('workload', { padding: '18px 18px' })}>
          {renderWidgetRemoveButton('workload')}
          {renderWidgetTitle('담당자별 업무량', 'workload', widgetTitleStyle, 'left')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {managerWorkloads.slice(0, 3).map(([managerName, workload]) => (
              <div key={managerName} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 900, color: C.g800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{managerName}</span>
                <span style={{ fontSize: 13, fontWeight: 900, color: workload.actionRequired ? C.danger : C.primary, whiteSpace: 'nowrap' }}>
                  {workload.total}건 / 요청 {workload.actionRequired}
                </span>
              </div>
            ))}
          </div>
        </Card>
        )}
        {visibleWidgetSet.has('myProjects') && (
        <Card {...widgetFrameProps('myProjects', { padding: '22px 24px', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' })}>
          {renderWidgetRemoveButton('myProjects')}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
            {renderWidgetTitle('내 프로젝트 현황', 'myProjects', { fontSize: 16, fontWeight: 800, color: C.g800, marginBottom: 0 })}
            <Link href="/projects" style={{ fontSize: 14, fontWeight: 700, color: C.primary, textDecoration: 'none' }}>전체 목록</Link>
          </div>

          <div style={{ border: `1px solid ${C.g200}`, borderRadius: 16, padding: 14, background: '#FCFEFD', marginBottom: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, alignItems: 'end' }}>
                <div style={{ minWidth: 0 }}>
                  <input aria-label="프로젝트명" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="프로젝트 검색" style={fieldStyle} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <input aria-label="계약번호" value={contractNumber} onChange={(event) => setContractNumber(event.target.value)} placeholder="계약번호" style={fieldStyle} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <select aria-label="관리자" value={manager} onChange={(event) => setManager(event.target.value)} style={fieldStyle}>
                    {filterOptions.managers.map((item) => <option key={item} value={item}>{item === filterOptions.managers[0] ? '관리자' : item}</option>)}
                  </select>
                </div>
                <div style={{ minWidth: 0 }}>
                  <select aria-label="상태" value={status} onChange={(event) => setStatus(event.target.value)} style={fieldStyle}>
                    {filterOptions.statuses.map((item) => <option key={item} value={item}>{item === filterOptions.statuses[0] ? '상태' : item}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <PeriodFilter mode={periodMode} value={period} onModeChange={setPeriodMode} onValueChange={setPeriod} inputStyle={fieldStyle} />
              </div>
            </div>
          </div>

          <div data-ui="dash-sort" style={sortBarStyle}>
            {(Object.keys(SORT_LABELS) as SortOption[]).map((item, index, items) => (
              <span key={item} style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
                <button type="button" onClick={() => setSortBy(item)} style={sortButtonStyle(sortBy === item)}>
                  {SORT_LABELS[item]}
                </button>
                {index < items.length - 1 && <span style={{ color: C.g200, fontSize: 14, fontWeight: 800 }}>|</span>}
              </span>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', paddingRight: 4, minHeight: 0 }}>
            {visibleProjects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ border: `1px solid ${C.g200}`, borderRadius: 18, padding: '16px 18px', background: C.white }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 17, fontWeight: 800, color: C.g800 }}>{project.name}</div>
                        <span style={{ fontSize: 12, fontWeight: 900, color: C.primary, background: C.bg, border: `1px solid ${C.g200}`, borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap' }}>
                          {getLatestMonthLabel(project.id)}
                        </span>
                      </div>
                      <div style={{ fontSize: 14, color: C.g400, marginTop: 4 }}>{project.manager} · {project.period}</div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 800, color: STATUS_META[project.status].color, background: STATUS_META[project.status].bg, borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap' }}>
                      {STATUS_META[project.status].label}
                    </span>
                  </div>
                  <ProjectStageStepper currentStage={project.stageIndex} compact />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.g400 }}>최근 현황</div>
                      <div style={{ fontSize: 14, color: C.g600, marginTop: 4, lineHeight: 1.6 }}>{project.recentActivity}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.g400 }}>다음 액션</div>
                      <div style={{ fontSize: 14, color: C.primary, marginTop: 4, lineHeight: 1.6, fontWeight: 700 }}>{getPrimaryProjectAction(user, project).label}</div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Card>
        )}
      </div>
    </AppFrame>
  );
}
