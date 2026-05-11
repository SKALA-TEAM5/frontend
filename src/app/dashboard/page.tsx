'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { AppFrame, ProjectSortControl } from '../../components/common';
import PeriodFilter from '../../components/common/PeriodFilter';
import { C } from '../../lib/theme';
import { ACTION_REQUEST_STATUS_META, ACTION_REQUEST_STATUS_STEPS, getDashboardCountsFromProjects, getProjectManagers, getSheFilterOptionsFromProjects, PROJECT_STATUS_META, type ActionRequestStatusCode, type ProjectSummary } from '../../lib/project-data';
import { listProjects } from '../../lib/project-api';
import { useCurrentUser } from '../../lib/dev-user';
import { getVisibleProjects, type PeriodMode, type ProjectSortField, type SortDirection } from '../../lib/project-list';
import { useActionNotifications } from '../../lib/use-action-notifications';
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
  boxSizing: 'border-box',
  padding: '0 12px',
  borderRadius: 8,
  border: `1px solid ${C.g200}`,
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 800,
  lineHeight: '20px',
  color: C.g800,
  background: '#FBFDFC',
};

const compactFieldStyle: CSSProperties = {
  ...fieldStyle,
  height: 30,
  padding: '0 9px',
  borderRadius: 6,
  fontSize: 11,
  lineHeight: '16px',
};

const sortBarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
  marginBottom: 14,
};

const widgetTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 900,
  color: C.g800,
  marginBottom: 0,
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

const workflowBadgeStyle = (color: string, bg: string, border = C.g200): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 24,
  padding: '0 8px',
  borderRadius: 999,
  border: `1px solid ${border}`,
  background: bg,
  color,
  fontSize: 10,
  fontWeight: 900,
  whiteSpace: 'nowrap',
});

const tooltipStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 'calc(100% + 8px)',
  zIndex: 1000,
  width: 'max-content',
  minWidth: 180,
  padding: '12px 13px',
  borderRadius: 12,
  background: C.white,
  border: `1px solid ${C.g200}`,
  boxShadow: '0 12px 28px rgba(27,94,59,.16)',
  whiteSpace: 'normal',
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
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
  minWidth: 0,
  whiteSpace: 'normal',
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
};

const titleTooltipStyle: CSSProperties = {
  ...tooltipStyle,
  width: 'max-content',
  minWidth: 160,
  top: 'calc(100% + 6px)',
};

const dashboardPageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  padding: '0 28px',
};

const dashboardHeroStyle: CSSProperties = {
  position: 'relative',
  minHeight: 168,
  margin: '0 -28px',
  overflow: 'hidden',
  border: `1px solid rgba(255,255,255,.52)`,
  background: 'linear-gradient(90deg, rgba(20,43,36,.9), rgba(30,77,60,.54) 48%, rgba(31,55,43,.18)), url("https://images.pexels.com/photos/32858871/pexels-photo-32858871.jpeg?auto=compress&cs=tinysrgb&w=1800") center 52% / cover',
  boxShadow: '0 14px 32px rgba(31,55,43,.11)',
};

const dashboardKpiBandStyle: CSSProperties = {
  position: 'relative',
  zIndex: 3,
  margin: '-38px 28px 4px',
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  boxShadow: '0 16px 32px rgba(35,24,86,.18)',
};

const dashboardPanelStyle: CSSProperties = {
  borderRadius: 6,
  border: `1px solid ${C.g200}`,
  boxShadow: '0 10px 22px rgba(31,55,43,.06)',
  background: C.white,
};

const dashboardPanelHeaderStyle: CSSProperties = {
  height: 38,
  minHeight: 38,
  flexShrink: 0,
  margin: '-18px -18px 14px',
  padding: '0 12px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  borderBottom: `1px solid ${C.g200}`,
  borderTopLeftRadius: 6,
  borderTopRightRadius: 6,
  background: '#FBFDFC',
};

const widgetHelpText: Record<WidgetHelpId, string> = {
  actionPipeline: '조치 요청 발송부터 종결까지 현재 병목 단계를 보여줍니다.',
  actionQueue: 'SHE 담당자가 우선 확인해야 하는 조치 요청과 새 업로드를 보여줍니다.',
  decisionLog: '에이전트 판단과 조치 요청, 새 업로드 흐름의 최근 기록을 보여줍니다.',
  projectProgress: '프로젝트별 실제 공정률을 막대로 비교해 보여줍니다.',
  workload: '담당자별 프로젝트 부담과 조치 요청 부담을 보여줍니다.',
  myProjects: '내가 볼 수 있는 모든 프로젝트를 검색, 필터, 정렬해 보여줍니다.',
  timeline: '프로젝트별 월 단위 업로드, 검증, 조치 요청, 보고서 생성 흐름을 보여줍니다.',
};

export default function DashboardPage() {
  const { user } = useCurrentUser();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const dashboardCounts = useMemo(() => getDashboardCountsFromProjects(projects), [projects]);
  const filterOptions = useMemo(() => getSheFilterOptionsFromProjects(projects), [projects]);
  const [projectName, setProjectName] = useState('');
  const [contractNumber, setContractNumber] = useState('');
  const [period, setPeriod] = useState('');
  const [periodMode, setPeriodMode] = useState<PeriodMode>('all');
  const [manager, setManager] = useState(filterOptions.managers[0] || '전체');
  const [status, setStatus] = useState(filterOptions.statuses[0] || '전체');
  const [sortBy, setSortBy] = useState<ProjectSortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [titleTooltip, setTitleTooltip] = useState<WidgetHelpId | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [visibleWidgetIds, setVisibleWidgetIds] = useState<DashboardWidgetId[]>(DEFAULT_WIDGET_IDS);
  const [draggedWidgetId, setDraggedWidgetId] = useState<DashboardWidgetId | null>(null);
  const [widgetLayout, setWidgetLayout] = useState<Record<DashboardWidgetId, WidgetPosition>>(DEFAULT_WIDGET_LAYOUT);
  const { notifications: actionNotifications, unreadNotifications: unreadSheNotifications } = useActionNotifications(user);
  const dashboardGridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    listProjects({ size: 10 })
      .then((items) => {
        if (alive) setProjects(items);
      })
      .catch(() => {
        if (alive) setProjects([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(DASHBOARD_WIDGET_STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as string[];
      const validIds = parsed.filter((id): id is DashboardWidgetId => DEFAULT_WIDGET_IDS.includes(id as DashboardWidgetId));
      if (!validIds.includes('timeline')) {
        validIds.push('timeline');
      }
      setVisibleWidgetIds(validIds);
    } catch {
      window.localStorage.removeItem(DASHBOARD_WIDGET_STORAGE_KEY);
    }
    const storedLayout = window.localStorage.getItem(DASHBOARD_WIDGET_LAYOUT_STORAGE_KEY);
    if (!storedLayout) return;
    try {
      const parsed = JSON.parse(storedLayout) as Partial<Record<DashboardWidgetId, WidgetPosition>>;
      const validLayout = Object.fromEntries(
        Object.entries(parsed).filter(([id]) => DEFAULT_WIDGET_IDS.includes(id as DashboardWidgetId)),
      ) as Partial<Record<DashboardWidgetId, WidgetPosition>>;
      setWidgetLayout({ ...DEFAULT_WIDGET_LAYOUT, ...validLayout });
    } catch {
      window.localStorage.removeItem(DASHBOARD_WIDGET_LAYOUT_STORAGE_KEY);
    }
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
    }, sortBy, sortDirection);
  }, [contractNumber, filterOptions.managers, filterOptions.statuses, manager, period, periodMode, projectName, projects, sortBy, sortDirection, status]);

  const recentActivities = projects
    .filter((project) => project.recentActivity)
    .map((project) => ({
      project,
      date: '-',
      actor: project.manager || '-',
      action: project.recentActivity,
    }))
    .sort((a, b) => new Date(b.date.replace(/\//g, '-')).getTime() - new Date(a.date.replace(/\//g, '-')).getTime())
    .slice(0, 4);
  const actionProjects = projects.filter((project) => project.status === 'action_required');
  const sentActionNotifications = actionNotifications
    .filter((notification) => notification.type === 'action_request')
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
  const newUploadNotifications = actionNotifications
    .filter((notification) => notification.type === 'new_upload' && notification.recipientRole === 'she_manager')
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
  const actionFallbackItems = actionProjects.map((project) => ({
    id: `project-${project.id}`,
    projectId: project.id,
    projectName: project.constructionName,
    categoryName: project.actionRequestDetails?.title || '보완 조치 요청',
    title: project.actionRequestDetails?.title || '보완 조치 요청',
    message: project.actionRequestDetails?.reason || '보완 자료 제출이 필요합니다.',
    assignee: project.actionRequestDetails?.assignee || project.manager || '프로젝트 담당자',
    statusCode: project.actionRequestDetails?.statusCode || 'open' as ActionRequestStatusCode,
    createdAt: project.actionRequestDetails?.requestedAt || '-',
    requestedFiles: [] as string[],
    isUpload: false,
  }));
  const actionQueueItems = [
    ...sentActionNotifications.map((notification) => ({
      id: notification.id,
      projectId: notification.projectId || '',
      projectName: notification.projectName,
      categoryName: notification.categoryName,
      title: notification.title || notification.categoryName,
      message: notification.message,
      assignee: notification.recipientUserName || '프로젝트 담당자',
      statusCode: notification.statusCode || 'open' as ActionRequestStatusCode,
      createdAt: notification.createdAt,
      requestedFiles: notification.requestedFiles,
      isUpload: false,
    })),
    ...newUploadNotifications.map((notification) => ({
      id: notification.id,
      projectId: notification.projectId || '',
      projectName: notification.projectName,
      categoryName: notification.categoryName,
      title: notification.title || '새 파일 업로드',
      message: notification.message,
      assignee: notification.senderName || '프로젝트 담당자',
      statusCode: 'resolved' as ActionRequestStatusCode,
      createdAt: notification.createdAt,
      requestedFiles: notification.requestedFiles,
      isUpload: true,
    })),
  ].slice(0, 6);
  const resolvedActionQueueItems = actionQueueItems.length ? actionQueueItems : actionFallbackItems;
  const pipelineCounts = ACTION_REQUEST_STATUS_STEPS.reduce((acc, statusCode) => {
    acc[statusCode] = sentActionNotifications.filter((notification) => (notification.statusCode || 'open') === statusCode).length;
    return acc;
  }, {} as Record<ActionRequestStatusCode, number>);
  if (sentActionNotifications.length === 0) {
    actionFallbackItems.forEach((item) => {
      pipelineCounts[item.statusCode] += 1;
    });
  }
  const activePipelineIndex = ACTION_REQUEST_STATUS_STEPS.findIndex((statusCode) => pipelineCounts[statusCode] > 0);
  const decisionLogRows = [
    ...sentActionNotifications.map((notification) => ({
      id: notification.id,
      title: notification.title || `${notification.categoryName} 조치 요청`,
      meta: `${notification.projectName} · ${notification.recipientUserName || '프로젝트 담당자'}에게 보냄 · ${notification.createdAt}`,
      badge: '조치 요청',
      tone: 'danger' as const,
    })),
    ...newUploadNotifications.map((notification) => ({
      id: notification.id,
      title: notification.message || `${notification.categoryName} 새 파일 업로드`,
      meta: `${notification.projectName} · ${notification.createdAt}`,
      badge: '새 업로드',
      tone: 'ok' as const,
    })),
    ...recentActivities.map((activity) => ({
      id: `activity-${activity.project.id}-${activity.action}`,
      title: activity.action,
      meta: `${activity.project.constructionName} · ${activity.actor}`,
      badge: '활동',
      tone: 'neutral' as const,
    })),
  ].slice(0, 5);
  const managerWorkloads = Array.from(
    projects.reduce((map, project) => {
      const projectManagers = project.participants.length > 0 ? project.participants : getProjectManagers(project);
      const managers = projectManagers.length > 0 ? projectManagers : ['미지정'];
      const actionAssignees = project.status === 'action_required'
        ? (project.actionRequestDetails?.assignee || managers[0]).split(',').map((name) => name.trim()).filter(Boolean)
        : [];

      managers.forEach((managerName) => {
        const current = map.get(managerName) || { actionRequired: 0, projectCount: 0 };
        map.set(managerName, {
          actionRequired: current.actionRequired,
          projectCount: current.projectCount + 1,
        });
      });

      actionAssignees.forEach((managerName) => {
        const current = map.get(managerName) || { actionRequired: 0, projectCount: 0 };
        map.set(managerName, {
          actionRequired: current.actionRequired + 1,
          projectCount: current.projectCount,
        });
      });
      return map;
    }, new Map<string, { actionRequired: number; projectCount: number }>()),
  ).sort((a, b) => (b[1].actionRequired + b[1].projectCount) - (a[1].actionRequired + a[1].projectCount) || a[0].localeCompare(b[0], 'ko'));
  const parsePeriodMonth = (periodText: string) => {
    const [startText = '', endText = ''] = periodText.split('~');
    const parse = (value: string) => {
      const match = value.match(/(20\d{2})[./-](\d{1,2})/);
      return match ? `${match[1]}.${match[2].padStart(2, '0')}` : '';
    };
    return { start: parse(startText), end: parse(endText) };
  };
  const projectTimelineMonths = Array.from(new Set(projects.flatMap((project) => {
    const periodMonth = parsePeriodMonth(project.period);
    return [periodMonth.start, periodMonth.end].filter(Boolean);
  }))).sort();
  const projectTimelineRows = projects.slice(0, 6).map((project) => {
    const periodMonth = parsePeriodMonth(project.period);
    const startIndex = Math.max(0, projectTimelineMonths.indexOf(periodMonth.start));
    const endIndex = Math.max(startIndex, projectTimelineMonths.indexOf(periodMonth.end));
    const progress = Math.min(100, Math.max(0, Number.parseInt(project.progressRate, 10) || 0));
    return {
      id: project.id,
      name: project.constructionName,
      code: project.contractNumber,
      status: PROJECT_STATUS_META[project.projectStatusCode].label,
      progress,
      start: startIndex + 1,
      span: Math.max(1, endIndex - startIndex + 1),
      color: progress >= 80 ? '#2B8B5D' : progress >= 50 ? '#2F73B7' : progress >= 25 ? '#EE8A21' : '#C9545E',
    };
  });
  const widgetTooltipStyle = (id: DashboardWidgetId, minWidth = 200): CSSProperties => {
    const position = widgetLayout[id] || DEFAULT_WIDGET_LAYOUT[id];
    const size = WIDGET_SIZES[id];
    const colEnd = position.col + size.colSpan - 1;
    const alignRight = colEnd >= GRID_COLUMN_COUNT - 1;
    const alignLeft = position.col <= 2;
    return {
      ...tooltipStyle,
      minWidth,
      maxWidth: 'min(460px, calc(100vw - 32px))',
      left: alignRight ? 'auto' : alignLeft ? 0 : '50%',
      right: alignRight ? 0 : 'auto',
      transform: alignRight || alignLeft ? undefined : 'translateX(-50%)',
    };
  };
  const widgetTitleTooltipStyle = (id: DashboardWidgetId, minWidth = 160): CSSProperties => {
    const position = widgetLayout[id] || DEFAULT_WIDGET_LAYOUT[id];
    const size = WIDGET_SIZES[id];
    const colEnd = position.col + size.colSpan - 1;
    const openToRight = position.col <= 2;
    const openToLeft = colEnd >= GRID_COLUMN_COUNT - 1;
    return {
      ...tooltipStyle,
      ...titleTooltipStyle,
      minWidth,
      maxWidth: 'min(520px, calc(100vw - 32px))',
      top: openToRight ? 0 : titleTooltipStyle.top,
      left: openToRight ? 'calc(100% + 8px)' : openToLeft ? 'auto' : '50%',
      right: openToLeft ? 0 : 'auto',
      transform: openToRight || openToLeft ? undefined : 'translateX(-50%)',
    };
  };
  const renderWidgetTitle = (label: string, id: WidgetHelpId, style: CSSProperties = widgetTitleStyle, align: 'left' | 'right' = 'left') => (
    <div
      style={{ position: 'relative', zIndex: titleTooltip === id ? 1001 : 1, display: 'block', width: 'fit-content', whiteSpace: 'nowrap', ...style }}
      onMouseEnter={() => setTitleTooltip(id)}
      onMouseLeave={() => setTitleTooltip(null)}
    >
      {label}
      {titleTooltip === id && (
        <div style={{ ...widgetTitleTooltipStyle(id), left: align === 'right' ? 'auto' : widgetTitleTooltipStyle(id).left, right: align === 'right' ? 0 : widgetTitleTooltipStyle(id).right, transform: align === 'right' ? undefined : widgetTitleTooltipStyle(id).transform }}>
          <div style={tooltipListStyle}>
            <div style={tooltipItemStyle}>{widgetHelpText[id]}</div>
          </div>
        </div>
      )}
    </div>
  );
  const renderPanelHeader = (label: string, id: WidgetHelpId, meta?: ReactNode) => (
    <div style={dashboardPanelHeaderStyle}>
      {renderWidgetTitle(label, id, { fontSize: 13, fontWeight: 900, color: C.g800, marginBottom: 0 })}
      {meta && <span style={{ color: C.g400, fontSize: 11, fontWeight: 900, whiteSpace: 'nowrap' }}>{meta}</span>}
    </div>
  );
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
      ...dashboardPanelStyle,
      ...widgetPlacementStyle(size),
      position: 'relative',
      overflow: 'visible',
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
    <AppFrame title="프로젝트 대시보드" mainClassName="dashboard-main">
      <div style={dashboardPageStyle}>
      <section style={dashboardHeroStyle}>
        <div style={{ position: 'relative', zIndex: 2, padding: '28px 30px 58px', display: 'flex', justifyContent: 'flex-start', gap: 22 }}>
          <div>
            <h1 style={{ margin: 0, color: C.white, fontSize: 23, lineHeight: 1.4, fontWeight: 900, textShadow: '0 4px 18px rgba(0,0,0,.32)' }}>
              검증 리스크와 조치 요청을<br />한 화면에서 통제하는 SHE 대시보드
            </h1>
          </div>
        </div>
      </section>

      <section style={dashboardKpiBandStyle}>
        {[
          { label: '전체 프로젝트', value: projects.length, meta: `진행 중 ${dashboardCounts.active}`, bg: '#1F6F5F' },
          { label: '조치 요청 프로젝트', value: actionProjects.length, meta: '처리 필요', bg: '#2FA084' },
          { label: '검증 완료', value: projects.filter((project) => project.reportReady).length, meta: '보고서 생성 가능', bg: '#67af85' },
          { label: '미확인 알림', value: unreadSheNotifications.length, meta: 'SHE 기준', bg: '#98c8b2' },
        ].map((item) => (
          <div key={item.label} style={{ minHeight: 78, padding: '14px 18px', color: C.white, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderRight: '1px solid rgba(255,255,255,.18)', background: item.bg }}>
            <div>
              <span style={{ display: 'block', fontSize: 11, fontWeight: 900, opacity: .84 }}>{item.label}</span>
              <strong style={{ display: 'block', marginTop: 5, fontSize: 29, lineHeight: 1 }}>{item.value}</strong>
            </div>
            <small style={{ fontSize: 11, fontWeight: 900, opacity: .8 }}>{item.meta}</small>
          </div>
        ))}
      </section>

      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 2px' }}>
        <button type="button" onClick={() => setEditMode((mode) => !mode)} style={{ border: 'none', background: 'transparent', padding: 0, color: C.g600, fontSize: 12, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          {editMode ? '편집 완료' : '대시보드 편집'}
        </button>
      </div>

      {editMode && (
        <Card style={{ ...dashboardPanelStyle, padding: '16px 18px', marginBottom: 14 }}>
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
        {visibleWidgetSet.has('actionPipeline') && (
        <Card {...widgetFrameProps('actionPipeline', { padding: '18px 18px', overflow: 'visible' })}>
          {renderWidgetRemoveButton('actionPipeline')}
          {renderPanelHeader('조치 요청 파이프라인', 'actionPipeline', '요청 발송부터 종결까지')}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${ACTION_REQUEST_STATUS_STEPS.length}, minmax(0, 1fr))`, alignItems: 'start', gap: 0, marginTop: -2 }}>
            {ACTION_REQUEST_STATUS_STEPS.map((statusCode, index) => {
              const meta = ACTION_REQUEST_STATUS_META[statusCode];
              const count = pipelineCounts[statusCode] || 0;
              const current = activePipelineIndex >= 0 && index === activePipelineIndex;
              return (
                <div key={statusCode} style={{ position: 'relative', display: 'grid', justifyItems: 'center', textAlign: 'center', gap: 4, padding: '0 8px', minWidth: 0 }}>
                  {index < ACTION_REQUEST_STATUS_STEPS.length - 1 && <span aria-hidden="true" style={{ position: 'absolute', top: 14, left: 'calc(50% + 22px)', right: 'calc(-50% + 22px)', height: 2, background: current ? `linear-gradient(90deg, ${meta.color}, ${C.g200})` : C.g200 }} />}
                  <div style={{ width: 30, height: 30, borderRadius: 999, border: `2px solid ${current ? meta.color : C.g200}`, background: current ? meta.color : count ? meta.bg : C.white, color: current ? C.white : count ? meta.color : C.g400, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 900, position: 'relative', zIndex: 1 }}>
                    {count}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 900, color: current ? meta.color : C.g800, whiteSpace: 'nowrap' }}>{meta.label}</div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: C.g400, lineHeight: 1.25 }}>
                    {statusCode === 'open' ? '담당자 확인 대기' : statusCode === 'in_progress' ? '보완자료 준비 중' : statusCode === 'resolved' ? 'SHE 재검토 대기' : '승인 및 보고서 반영'}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        )}

        {visibleWidgetSet.has('actionQueue') && (
        <Card {...widgetFrameProps('actionQueue', { padding: '18px 18px', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' })}>
          {renderWidgetRemoveButton('actionQueue')}
          {renderPanelHeader('처리 필요 조치 요청', 'actionQueue', '상태와 기한 기준')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', minHeight: 0, paddingRight: 4 }}>
            {resolvedActionQueueItems.length === 0 ? (
              <div style={{ border: 'none', borderRadius: 8, background: '#FCFEFD', padding: 16, color: C.g400, fontSize: 13, fontWeight: 800 }}>
                처리할 조치 요청이 없습니다.
              </div>
            ) : resolvedActionQueueItems.map((item) => {
              const itemStatusMeta = ACTION_REQUEST_STATUS_META[item.statusCode];
              const itemCardBorder = itemStatusMeta.color;
              const itemCardBackground = itemStatusMeta.bg;
              const content = (
                <div style={{ border: `1px solid ${itemCardBorder}`, borderRadius: 8, background: itemCardBackground, padding: '11px 12px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 900, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }}>{item.title}</span>
                      <span style={item.isUpload ? workflowBadgeStyle(C.primary, C.bg, C.g200) : workflowBadgeStyle(ACTION_REQUEST_STATUS_META[item.statusCode].color, ACTION_REQUEST_STATUS_META[item.statusCode].bg, ACTION_REQUEST_STATUS_META[item.statusCode].color)}>
                        {item.isUpload ? '새 업로드' : ACTION_REQUEST_STATUS_META[item.statusCode].label}
                      </span>
                    </div>
                    <div style={{ marginTop: 5, fontSize: 11, fontWeight: 800, color: C.g400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.projectName} · {item.assignee} · {item.createdAt}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: C.g600, lineHeight: 1.5 }}>
                      {item.message}
                    </div>
                    {item.requestedFiles.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                        {item.requestedFiles.slice(0, 3).map((fileName) => <span key={fileName} style={workflowBadgeStyle(C.g600, C.white, C.g200)}>{fileName}</span>)}
                        {item.requestedFiles.length > 3 && <span style={workflowBadgeStyle(C.g600, C.white, C.g200)}>외 {item.requestedFiles.length - 3}건</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
              return item.projectId ? (
                <Link key={item.id} href={`/projects/${item.projectId}?tab=archive`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  {content}
                </Link>
              ) : <div key={item.id}>{content}</div>;
            })}
          </div>
        </Card>
        )}

        {visibleWidgetSet.has('decisionLog') && (
        <Card {...widgetFrameProps('decisionLog', { padding: '18px 18px', display: 'flex', flexDirection: 'column', minHeight: 0 })}>
          {renderWidgetRemoveButton('decisionLog')}
          {renderPanelHeader('최근 판단/요청 로그', 'decisionLog', '에이전트와 사용자 활동')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', minHeight: 0, paddingRight: 4 }}>
            {decisionLogRows.length === 0 ? (
              <div style={{ border: 'none', borderRadius: 8, background: '#FCFEFD', padding: 14, color: C.g400, fontSize: 13, fontWeight: 800 }}>
                최근 판단 또는 요청 로그가 없습니다.
              </div>
            ) : decisionLogRows.map((row) => (
              <div key={row.id} style={{ border: `1px solid ${C.g200}`, borderRadius: 8, background: '#FCFEFD', padding: '10px 11px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'center', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.title}</div>
                  <div style={{ marginTop: 3, fontSize: 11, fontWeight: 800, color: C.g400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.meta}</div>
                </div>
                <span style={row.tone === 'danger' ? workflowBadgeStyle(C.danger, C.dangerBg, '#FFCDD2') : row.tone === 'ok' ? workflowBadgeStyle(C.primary, C.bg, C.g200) : workflowBadgeStyle(C.g600, C.white, C.g200)}>
                  {row.badge}
                </span>
              </div>
            ))}
          </div>
        </Card>
        )}

        {visibleWidgetSet.has('projectProgress') && (
        <Card {...widgetFrameProps('projectProgress', { padding: '18px 18px', display: 'flex', flexDirection: 'column', minHeight: 0 })}>
          {renderWidgetRemoveButton('projectProgress')}
          {renderPanelHeader('프로젝트 진행 상태', 'projectProgress', '공정률')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13, overflowY: 'auto', minHeight: 0, paddingRight: 4 }}>
            {projects.slice(0, 4).map((project) => {
              const progress = Math.min(100, Math.max(0, Number.parseInt(project.progressRate, 10) || 0));
              const color = progress >= 80 ? '#2B8B5D' : progress >= 50 ? '#2F73B7' : progress >= 25 ? '#EE8A21' : '#C9545E';
              return (
                <Link key={project.id} href={`/projects/${project.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 42px', gap: 10, alignItems: 'center' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 900, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{project.constructionName}</span>
                        <span style={{ fontSize: 10, fontWeight: 900, color: C.g400, whiteSpace: 'nowrap' }}>{project.contractNumber}</span>
                      </div>
                      <div style={{ height: 12, background: '#E8EEEB', overflow: 'hidden', border: 'none', borderRadius: 999 }}>
                        <div style={{ width: `${progress}%`, height: '100%', background: color }} />
                      </div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 900, color, textAlign: 'right' }}>{progress}%</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
        )}

        {visibleWidgetSet.has('workload') && (
        <Card {...widgetFrameProps('workload', { padding: '18px 18px', display: 'flex', flexDirection: 'column', minHeight: 0 })}>
          {renderWidgetRemoveButton('workload')}
          {renderPanelHeader('담당자별 업무량', 'workload', '조치 요청/프로젝트')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 8, overflowY: 'auto', minHeight: 0, paddingRight: 4 }}>
            {managerWorkloads.map(([managerName, workload]) => (
              <div key={managerName} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 8, border: `1px solid ${workload.actionRequired ? '#F4CBCB' : C.g200}`, borderRadius: 10, background: workload.actionRequired ? 'linear-gradient(90deg, #FFF8F8 0%, #FCFEFD 58%)' : '#FCFEFD', padding: '8px 9px', boxShadow: '0 6px 14px rgba(31,55,43,.04)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr)', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <div aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 999, background: workload.actionRequired ? '#FFECEC' : C.bg, color: workload.actionRequired ? C.danger : C.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900 }}>
                    {managerName.slice(0, 1)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: C.g800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{managerName}</div>
                    <div style={{ marginTop: 2, fontSize: 10, fontWeight: 800, color: workload.actionRequired ? C.danger : C.g400, whiteSpace: 'nowrap' }}>
                      {workload.actionRequired ? '확인 필요' : '조치 요청 없음'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <div title="조치 요청" style={{ minWidth: 48, border: `1px solid ${workload.actionRequired ? '#F4CBCB' : '#C8DAF8'}`, borderRadius: 999, background: workload.actionRequired ? '#FFF8F8' : '#EEF4FF', padding: '5px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 9, fontWeight: 900, color: C.g400, lineHeight: 1, whiteSpace: 'nowrap' }}>요청</div>
                    <div style={{ marginTop: 3, fontSize: 13, fontWeight: 900, color: workload.actionRequired ? C.danger : '#2F5FB8', lineHeight: 1 }}>{workload.actionRequired}건</div>
                  </div>
                  <div title="담당 프로젝트" style={{ minWidth: 48, border: `1px solid ${workload.projectCount ? C.g200 : '#F5D990'}`, borderRadius: 999, background: workload.projectCount ? '#F4FBF6' : '#FFF9EA', padding: '5px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 9, fontWeight: 900, color: C.g400, lineHeight: 1, whiteSpace: 'nowrap' }}>프로젝트</div>
                    <div style={{ marginTop: 3, fontSize: 13, fontWeight: 900, color: workload.projectCount ? C.ok : '#8A5A00', lineHeight: 1 }}>{workload.projectCount}건</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
        )}

        {visibleWidgetSet.has('timeline') && (
        <Card {...widgetFrameProps('timeline', { padding: '18px 18px', overflow: 'visible', display: 'flex', flexDirection: 'column', minHeight: 0 })}>
          {renderWidgetRemoveButton('timeline')}
          {renderPanelHeader('월별 프로젝트 타임라인', 'timeline')}
          {projectTimelineMonths.length === 0 ? (
            <div style={{ border: 'none', borderRadius: 8, background: '#FCFEFD', padding: 18, color: C.g400, fontSize: 13, fontWeight: 800 }}>
              표시할 프로젝트 기간 데이터가 없습니다.
            </div>
          ) : (
          <div className="thin-x-scroll" style={{ minHeight: 0, flex: 1, border: 'none', borderRadius: 8, background: C.white }}>
            <div style={{ minWidth: 1120 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(860px,1fr)', minHeight: 34, borderBottom: `1px solid ${C.g200}`, background: '#F4F6F8' }}>
                <div style={{ padding: '8px 12px', borderRight: `1px solid ${C.g200}`, color: C.g800, fontSize: 12, fontWeight: 900 }}>프로젝트</div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${projectTimelineMonths.length}, minmax(92px,1fr))`, position: 'relative' }}>
                  {projectTimelineMonths.map((month) => (
                    <div key={month} style={{ padding: '8px 10px', borderRight: `1px solid ${C.g200}`, textAlign: 'center', color: C.g400, fontSize: 11, fontWeight: 900 }}>{month}</div>
                  ))}
                </div>
              </div>

              {projectTimelineRows.map((row, rowIndex) => (
                <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '220px minmax(860px,1fr)', minHeight: 58, borderBottom: `1px solid ${C.g200}`, background: rowIndex % 2 ? '#F7F9F8' : C.white }}>
                  <div style={{ padding: '8px 12px', borderRight: `1px solid ${C.g200}`, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                      <span style={{ width: 16, height: 16, display: 'inline-grid', placeItems: 'center', background: '#8A5CF6', color: C.white, borderRadius: 999, fontSize: 10, fontWeight: 900, flexShrink: 0 }}>P</span>
                      <div style={{ color: C.g800, fontSize: 13, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name}</div>
                    </div>
                    <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: C.g400, fontSize: 11, fontWeight: 900 }}>{row.code}</span>
                      <span style={{ height: 20, padding: '0 7px', display: 'inline-grid', placeItems: 'center', background: C.bg, border: 'none', borderRadius: 999, color: C.primary, fontSize: 10, fontWeight: 900 }}>{row.status}</span>
                    </div>
                    <div style={{ marginTop: 5, height: 3, background: '#D8DEE2', overflow: 'hidden' }}>
                      <div style={{ width: `${row.progress}%`, height: '100%', background: row.color }} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${projectTimelineMonths.length}, minmax(92px,1fr))`, position: 'relative', alignItems: 'center', minHeight: 58 }}>
                    {projectTimelineMonths.map((month) => (
                      <div key={`${row.code}-${month}`} style={{ height: '100%', borderRight: `1px solid ${C.g200}`, background: month === '2025.04' ? 'rgba(245,157,35,.05)' : 'transparent' }} />
                    ))}
                    <div style={{ gridColumn: `${row.start} / span ${row.span}`, gridRow: 1, alignSelf: 'center', height: 24, borderRadius: 999, background: row.color, boxShadow: '0 8px 16px rgba(31,55,43,.13)', zIndex: 4, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 10px', color: C.white, fontSize: 10, fontWeight: 900 }}>
                      {row.status}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          )}
        </Card>
        )}

        {visibleWidgetSet.has('myProjects') && (
        <Card {...widgetFrameProps('myProjects', { padding: '16px 16px', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' })}>
          {renderWidgetRemoveButton('myProjects')}
          {renderPanelHeader('내 프로젝트 리스트', 'myProjects', <Link href="/projects" style={{ fontSize: 12, fontWeight: 900, color: C.primary, textDecoration: 'none' }}>전체 목록</Link>)}

          <div style={{ border: 'none', borderRadius: 6, padding: '4px 6px', background: '#FCFEFD', marginBottom: 5 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(108px, 1fr))', gap: 5, alignItems: 'end' }}>
                <div style={{ minWidth: 0 }}>
                  <input aria-label="프로젝트명" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="프로젝트 검색" style={compactFieldStyle} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <input aria-label="계약번호" value={contractNumber} onChange={(event) => setContractNumber(event.target.value)} placeholder="계약번호" style={compactFieldStyle} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <select aria-label="관리자" value={manager} onChange={(event) => setManager(event.target.value)} style={compactFieldStyle}>
                    {filterOptions.managers.map((item) => <option key={item} value={item}>{item === filterOptions.managers[0] ? '관리자' : item}</option>)}
                  </select>
                </div>
                <div style={{ minWidth: 0 }}>
                  <select aria-label="상태" value={status} onChange={(event) => setStatus(event.target.value)} style={compactFieldStyle}>
                    {filterOptions.statuses.map((item) => <option key={item} value={item}>{item === filterOptions.statuses[0] ? '상태' : item}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div data-ui="dash-sort" style={{ ...sortBarStyle, gap: 4, marginBottom: 6 }}>
            <ProjectSortControl field={sortBy} direction={sortDirection} onFieldChange={setSortBy} onDirectionChange={setSortDirection} compact />
            <PeriodFilter mode={periodMode} value={period} onModeChange={setPeriodMode} onValueChange={setPeriod} inputStyle={compactFieldStyle} compact />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, overflowY: 'auto', paddingRight: 4, minHeight: 0 }}>
            {visibleProjects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ border: `1px solid ${C.g200}`, borderRadius: 6, padding: '8px 10px', background: "#f1fbf4" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8, flexWrap: 'wrap' }}>
                      <div style={{ color: C.g800, fontSize: 15, fontWeight: 900 }}>{project.constructionName}</div>
                      <span style={{ fontSize: 10, fontWeight: 900, color: PROJECT_STATUS_META[project.projectStatusCode].color, background: PROJECT_STATUS_META[project.projectStatusCode].bg, border: 'none', borderRadius: 999, padding: '2px 7px', lineHeight: '14px', whiteSpace: 'nowrap' }}>
                        {PROJECT_STATUS_META[project.projectStatusCode].label}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '120px 110px 180px 74px', gap: 7, maxWidth: 510 }}>
                      {[
                        ['프로젝트 번호', project.contractNumber],
                        ['관리자', project.manager],
                        ['공사기간', project.period],
                        ['공정률', project.progressRate],
                      ].map(([label, value]) => (
                        <div key={label} style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 11, color: C.g400, fontWeight: 800, marginBottom: 3 }}>{label}</div>
                          <div style={{ fontSize: 12, color: C.g800, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Card>
        )}
      </div>
      </div>
    </AppFrame>
  );
}
