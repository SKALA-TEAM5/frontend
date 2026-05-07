'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { AppFrame, ProjectSortControl } from '../../components/common';
import PeriodFilter from '../../components/common/PeriodFilter';
import { C } from '../../lib/theme';
import { getDashboardCountsFromProjects, getMonthlyUsageStatements, getSheFilterOptionsFromProjects, PROJECT_STATUS_META, type ProjectSummary } from '../../lib/project-data';
import { listProjects } from '../../lib/project-api';
import { useCurrentUser } from '../../lib/dev-user';
import { REPORT_DATA } from '../../lib/evidence-utils';
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
  borderRadius: 2,
  border: `1px solid ${C.g200}`,
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 800,
  lineHeight: '20px',
  color: C.g800,
  background: '#FBFDFC',
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

const tooltipStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 'calc(100% + 8px)',
  zIndex: 1000,
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

const dashboardPageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  padding: '0 28px',
};

const dashboardHeroStyle: CSSProperties = {
  position: 'relative',
  minHeight: 168,
  overflow: 'hidden',
  border: `1px solid rgba(255,255,255,.52)`,
  background: 'linear-gradient(90deg, rgba(24,45,51,.86), rgba(34,72,88,.38) 52%, rgba(116,86,199,.58)), url("https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&w=1800&q=80") center 45% / cover',
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
  borderRadius: 2,
  border: `1px solid ${C.g200}`,
  boxShadow: '0 10px 22px rgba(31,55,43,.06)',
  background: C.white,
};

const dashboardPanelHeaderStyle: CSSProperties = {
  height: 38,
  margin: '-18px -18px 14px',
  padding: '0 12px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  borderBottom: `1px solid ${C.g200}`,
  background: '#FBFDFC',
};

const compactPanelHeaderStyle: CSSProperties = {
  ...dashboardPanelHeaderStyle,
  margin: '-16px -14px 12px',
};

const widgetHelpText: Record<WidgetHelpId, string> = {
  projectStatus: '접근 가능한 프로젝트의 진행 상태를 요약합니다.',
  recentActivity: '최근 업로드, 요청, 보고서 수정과 같은 프로젝트 활동을 보여줍니다.',
  sla: '조치 요청 등록 후 처리 기한까지 남은 시간을 보여줍니다.',
  risk: '검증 결과에서 정산 리스크가 있는 항목을 요약합니다.',
  missingUpload: '증빙 업로드가 아직 부족한 프로젝트를 확인합니다.',
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
  const [riskTooltip, setRiskTooltip] = useState<'error' | 'warn' | null>(null);
  const [slaTooltip, setSlaTooltip] = useState<'overdue' | 'dueSoon' | 'open' | null>(null);
  const [missingUploadTooltip, setMissingUploadTooltip] = useState(false);
  const [titleTooltip, setTitleTooltip] = useState<WidgetHelpId | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [visibleWidgetIds, setVisibleWidgetIds] = useState<DashboardWidgetId[]>(DEFAULT_WIDGET_IDS);
  const [draggedWidgetId, setDraggedWidgetId] = useState<DashboardWidgetId | null>(null);
  const [widgetLayout, setWidgetLayout] = useState<Record<DashboardWidgetId, WidgetPosition>>(DEFAULT_WIDGET_LAYOUT);
  const { unreadNotifications: unreadSheNotifications } = useActionNotifications(user);
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
  const slaRows = {
    overdue: actionProjects.filter((project) => {
      const dueTime = project.actionRequestDetails?.dueDate ? new Date(project.actionRequestDetails.dueDate).getTime() : 0;
      return dueTime > 0 && Math.ceil((dueTime - todayTime) / 86400000) < 0;
    }),
    dueSoon: actionProjects.filter((project) => {
      const dueTime = project.actionRequestDetails?.dueDate ? new Date(project.actionRequestDetails.dueDate).getTime() : 0;
      const diffDays = dueTime ? Math.ceil((dueTime - todayTime) / 86400000) : 999;
      return dueTime > 0 && diffDays >= 0 && diffDays <= 3;
    }),
    open: actionProjects.filter((project) => {
      const dueTime = project.actionRequestDetails?.dueDate ? new Date(project.actionRequestDetails.dueDate).getTime() : 0;
      if (!dueTime) return true;
      return Math.ceil((dueTime - todayTime) / 86400000) > 3;
    }),
  };
  const validatedRiskProjects = projects.flatMap((project, projectIndex) => {
    const validatedStatements = getMonthlyUsageStatements(project.id).filter((statement) =>
      statement.parseStatus === '파싱 완료' && statement.validationStatus !== '미검증' && statement.validationStatus !== '검증 중',
    );
    if (validatedStatements.length === 0) return [];
    const latestValidatedStatement = validatedStatements[validatedStatements.length - 1];
    const rows = project.status === 'action_required' || latestValidatedStatement.issueCount > 0
      ? REPORT_DATA.filter((row) => row.status === 'error' || row.status === 'warn')
      : [];
    return rows.map((row) => ({
      ...row,
      projectId: project.id,
      projectName: project.constructionName,
      statementLabel: latestValidatedStatement.label,
      rowKey: `${project.id}-${latestValidatedStatement.month}-${row.id}-${projectIndex}`,
    }));
  });
  const errorRows = validatedRiskProjects.filter((row) => row.status === 'error');
  const warnRows = validatedRiskProjects.filter((row) => row.status === 'warn');
  const riskEmptyText = validatedRiskProjects.length === 0
    ? '유효성 검증을 완료했거나 리스크가 있는 프로젝트가 없습니다.'
    : '부적정/조건부 리스크 항목이 없습니다.';
  const riskCards = [
    {
      id: 'error' as const,
      label: '부적정',
      count: errorRows.length,
      color: C.danger,
      rows: errorRows,
      emptyText: riskEmptyText,
    },
    {
      id: 'warn' as const,
      label: '조건부',
      count: warnRows.length,
      color: C.warn,
      rows: warnRows,
      emptyText: riskEmptyText,
    },
  ];
  const missingUploadProjects = projects.filter((project) => !project.hasUploads || project.status === 'upload_pending');
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
  const validationOkCount = Math.max(0, REPORT_DATA.filter((row) => row.status === 'ok').length || 6);
  const validationIssueCount = errorRows.length + warnRows.length;
  const validationTotalCount = Math.max(1, validationOkCount + validationIssueCount);
  const projectTimelineMonths = ['2024.10', '2024.11', '2024.12', '2025.01', '2025.02', '2025.03', '2025.04', '2025.05', '2025.06'];
  const projectTimelineRows = [
    { name: '동탄 물류센터 증축공사', code: '2024-0042', status: '조치 요청', progress: 78, start: 1, span: 7, color: '#53CFA0', subBars: [{ label: '증빙 업로드', start: 1, span: 3 }, { label: '유효성 검증', start: 4, span: 2 }, { label: '보완/재검증', start: 6, span: 2 }] },
    { name: '평택 제조시설 증설', code: '2024-0108', status: '보고서 생성', progress: 91, start: 1, span: 3, color: '#7E6AD8', subBars: [{ label: '검증 완료', start: 1, span: 1 }, { label: '보고서 초안', start: 2, span: 1 }] },
    { name: '광명 데이터센터 신축', code: '2025-0016', status: '증빙 보완', progress: 18, start: 5, span: 5, color: '#2E86DE', subBars: [{ label: '착공/업로드', start: 5, span: 2 }, { label: '누락 확인', start: 7, span: 1 }, { label: '예정 검증', start: 8, span: 2 }] },
  ];
  const widgetTooltipStyle = (id: DashboardWidgetId, width = 200): CSSProperties => {
    const position = widgetLayout[id] || DEFAULT_WIDGET_LAYOUT[id];
    const size = WIDGET_SIZES[id];
    const colEnd = position.col + size.colSpan - 1;
    const alignRight = colEnd >= GRID_COLUMN_COUNT - 1;
    const alignLeft = position.col <= 2;
    return {
      ...tooltipStyle,
      width,
      maxWidth: 'min(260px, calc(100vw - 32px))',
      left: alignRight ? 'auto' : alignLeft ? 0 : '50%',
      right: alignRight ? 0 : 'auto',
      transform: alignRight || alignLeft ? undefined : 'translateX(-50%)',
    };
  };
  const widgetTitleTooltipStyle = (id: DashboardWidgetId, width = 250): CSSProperties => {
    const position = widgetLayout[id] || DEFAULT_WIDGET_LAYOUT[id];
    const size = WIDGET_SIZES[id];
    const colEnd = position.col + size.colSpan - 1;
    const openToRight = position.col <= 2;
    const openToLeft = colEnd >= GRID_COLUMN_COUNT - 1;
    return {
      ...tooltipStyle,
      ...titleTooltipStyle,
      width,
      maxWidth: 'min(260px, calc(100vw - 32px))',
      top: openToRight ? 0 : titleTooltipStyle.top,
      left: openToRight ? 'calc(100% + 8px)' : openToLeft ? 'auto' : '50%',
      right: openToLeft ? 0 : 'auto',
      transform: openToRight || openToLeft ? undefined : 'translateX(-50%)',
    };
  };
  const renderWidgetTitle = (label: string, id: WidgetHelpId, style: CSSProperties = widgetTitleStyle, align: 'left' | 'right' = 'left') => (
    <div
      style={{ position: 'relative', zIndex: titleTooltip === id ? 1001 : 1, display: 'block', width: 'fit-content', ...style }}
      onMouseEnter={() => setTitleTooltip(id)}
      onMouseLeave={() => setTitleTooltip(null)}
    >
      {label}
      {titleTooltip === id && (
        <div style={{ ...widgetTitleTooltipStyle(id, 250), left: align === 'right' ? 'auto' : widgetTitleTooltipStyle(id, 250).left, right: align === 'right' ? 0 : widgetTitleTooltipStyle(id, 250).right, transform: align === 'right' ? undefined : widgetTitleTooltipStyle(id, 250).transform }}>
          <div style={tooltipListStyle}>
            <div style={tooltipItemStyle}>{widgetHelpText[id]}</div>
          </div>
        </div>
      )}
    </div>
  );
  const renderPanelHeader = (label: string, id: WidgetHelpId, meta?: string, compact = false) => (
    <div style={compact ? compactPanelHeaderStyle : dashboardPanelHeaderStyle}>
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
            <p style={{ margin: '8px 0 0', maxWidth: 670, color: 'rgba(255,255,255,.84)', fontSize: 12, fontWeight: 800, lineHeight: 1.6 }}>
              프로젝트 진행 상태가 아니라 실제 운영에 필요한 검증 결과, 증빙 이슈, 조치 요청 상태, 담당자 업무량을 중심으로 구성했습니다.
            </p>
          </div>
        </div>
      </section>

      <section style={dashboardKpiBandStyle}>
        {[
          { label: '전체 프로젝트', value: projects.length, meta: `진행 중 ${dashboardCounts.active}`, bg: 'rgba(116,86,199,.95)' },
          { label: '조치 요청 프로젝트', value: actionProjects.length, meta: `기한 임박 ${slaSummary.dueSoon}`, bg: 'rgba(47,115,183,.95)' },
          { label: '검증 완료', value: projects.filter((project) => project.reportReady).length, meta: '보고서 생성 가능', bg: 'rgba(23,102,61,.95)' },
          { label: '미확인 알림', value: unreadSheNotifications.length, meta: 'SHE 기준', bg: 'rgba(238,138,33,.94)' },
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
                <label key={widget.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 10px', borderRadius: 2, border: `1px solid ${checked ? C.light : C.g200}`, background: checked ? C.bg : C.white, color: checked ? C.primary : C.g600, fontSize: 13, fontWeight: 900, cursor: 'pointer' }}>
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
        <Card {...widgetFrameProps('projectStatus', { padding: '16px 14px', overflow: 'visible' })}>
          {renderWidgetRemoveButton('projectStatus')}
          {renderPanelHeader('프로젝트 현황', 'projectStatus', '운영 상태', true)}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {[
              { label: '진행 중', value: dashboardCounts.active, color: '#176B45', bg: '#E7F5EC' },
              { label: '완료', value: dashboardCounts.completed, color: '#2F5FB8', bg: '#EEF4FF' },
              { label: '중단', value: dashboardCounts.suspended, color: '#8A5A00', bg: '#FFF4D8' },
            ].map((item) => (
              <div key={item.label} style={{ border: `1px solid ${C.g200}`, padding: '9px 7px', minWidth: 0, textAlign: 'left', background: item.bg }}>
                <div style={{ ...widgetLabelStyle, fontSize: 11, whiteSpace: 'nowrap' }}>{item.label}</div>
                <div style={{ ...widgetValueStyle, fontSize: 22, color: item.color, marginTop: 4 }}>{item.value}</div>
              </div>
            ))}
          </div>
        </Card>
        )}

        {visibleWidgetSet.has('recentActivity') && (
        <Card {...widgetFrameProps('recentActivity', { padding: '18px 18px', display: 'flex', flexDirection: 'column', minHeight: 0 })}>
          {renderWidgetRemoveButton('recentActivity')}
          {renderPanelHeader('최근 활동', 'recentActivity', '이력')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', paddingRight: 4, minHeight: 0 }}>
            {recentActivities.map((log) => (
              <Link key={`${log.project.id}-${log.date}-${log.action}`} href={`/projects/${log.project.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ padding: '10px 12px', background: '#FBFDFC', border: `1px solid ${C.g200}`, lineHeight: 1.5 }}>
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
        <Card {...widgetFrameProps('sla', { padding: '16px 14px', overflow: 'visible' })}>
          {renderWidgetRemoveButton('sla')}
          {renderPanelHeader('보완 요청 기한', 'sla', '조치 요청 기준', true)}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 6 }}>
            {[
              { id: 'overdue' as const, label: '기한 초과', value: slaSummary.overdue, color: C.danger, bg: '#FFF5F5' },
              { id: 'dueSoon' as const, label: '3일 이내', value: slaSummary.dueSoon, color: C.warn, bg: '#FFF8F0' },
              { id: 'open' as const, label: '진행 중', value: slaSummary.open, color: C.primary, bg: C.bg },
            ].map((item) => (
              <div key={item.id} onMouseEnter={() => item.value > 0 && setSlaTooltip(item.id)} onMouseLeave={() => setSlaTooltip(null)} style={{ position: 'relative', border: `1px solid ${C.g200}`, background: item.bg, padding: '8px 6px', textAlign: 'left', minWidth: 0, cursor: item.value > 0 ? 'default' : 'auto' }}>
                <div style={{ ...widgetLabelStyle, fontSize: 10, whiteSpace: 'nowrap' }}>{item.label}</div>
                <div style={{ ...widgetValueStyle, fontSize: 20, color: item.color, marginTop: 4 }}>{item.value}</div>
                {slaTooltip === item.id && (
                  <div style={widgetTooltipStyle('sla', 230)}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: item.color, marginBottom: 8 }}>{item.label} 프로젝트</div>
                    <div style={tooltipListStyle}>
                      {slaRows[item.id].slice(0, 4).map((project) => (
                        <div key={project.id} style={tooltipItemStyle}>
                          <div style={{ fontWeight: 900, color: C.g800 }}>{project.actionRequestDetails?.title || '보완 조치 요청'}</div>
                          <div style={{ color: C.g800 }}>{project.constructionName}</div>
                          <div>{project.actionRequestDetails?.reason || '보완 자료 제출이 필요합니다.'}</div>
                          <div style={{ fontWeight: 900 }}>{project.actionRequestDetails?.assignee || project.manager} · 기한 {project.actionRequestDetails?.dueDate || '미정'}</div>
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

        {visibleWidgetSet.has('risk') && (
        <Card {...widgetFrameProps('risk', { padding: '18px 18px', overflow: 'visible' })}>
          {renderWidgetRemoveButton('risk')}
          {renderPanelHeader('검증 리스크 요약', 'risk', '검증 완료 기준')}
          {validatedRiskProjects.length === 0 ? (
            <div style={{ fontSize: 13, color: C.g400, fontWeight: 800, lineHeight: 1.5, marginTop: 10 }}>
              부적정/조건부 리스크 항목이 없습니다.
            </div>
          ) : <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {riskCards.map((item) => (
              <div
                key={item.id}
                onMouseEnter={() => setRiskTooltip(item.id)}
                onMouseLeave={() => setRiskTooltip(null)}
                style={{ position: 'relative', border: `1px solid ${item.id === 'error' ? '#F1CBD0' : '#ECD9B5'}`, background: item.id === 'error' ? '#FFF8F8' : '#FFF9EB', padding: '10px 12px', cursor: 'default' }}
              >
                <div style={widgetLabelStyle}>{item.label}</div>
                <div style={{ ...widgetValueStyle, color: item.color }}>{item.count}건</div>
                {riskTooltip === item.id && (
                  <div style={widgetTooltipStyle('risk')}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: item.color, marginBottom: 8 }}>{item.label} 세부 내용</div>
                    <div style={tooltipListStyle}>
                      {item.rows.length === 0 ? (
                        <div style={{ fontSize: 13, color: C.g400, lineHeight: 1.5 }}>{item.emptyText}</div>
                      ) : item.rows.slice(0, 3).map((row) => (
                        <div key={row.rowKey} style={tooltipItemStyle}>
                          <div style={{ fontWeight: 900, color: C.g800 }}>{row.projectName}</div>
                          <div style={{ fontWeight: 900 }}>{row.statementLabel} · {row.cat}</div>
                          <div>{row.note}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>}
        </Card>
        )}

        {visibleWidgetSet.has('missingUpload') && (
        <Card {...widgetFrameProps('missingUpload', { padding: '16px 14px', overflow: 'visible', display: 'flex', flexDirection: 'column' })}>
          {renderWidgetRemoveButton('missingUpload')}
          {renderPanelHeader('업로드 누락', 'missingUpload')}
          <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
            <div
              onMouseEnter={() => setMissingUploadTooltip(true)}
              onMouseLeave={() => setMissingUploadTooltip(false)}
              style={{ display: 'inline-flex', alignItems: 'baseline', position: 'relative', cursor: 'default', width: 'fit-content' }}
            >
              <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 1, color: missingUploadProjects.length ? C.warn : C.ok }}>{missingUploadProjects.length}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: missingUploadProjects.length ? C.warn : C.ok, marginLeft: 4 }}>개</div>
              {missingUploadTooltip && (
                <div style={widgetTooltipStyle('missingUpload')}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: missingUploadProjects.length ? C.warn : C.ok, marginBottom: 8 }}>업로드 누락 세부 내용</div>
                  <div style={tooltipListStyle}>
                    {missingUploadProjects.length === 0 ? (
                      <div style={{ fontSize: 13, color: C.g400, lineHeight: 1.5 }}>누락된 프로젝트가 없습니다.</div>
                    ) : missingUploadProjects.slice(0, 4).map((project) => (
                      <div key={project.id} style={tooltipItemStyle}>
                        <div style={{ fontWeight: 900, color: C.g800 }}>{project.constructionName}</div>
                        <div>{project.manager}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
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
                      <div style={{ height: 12, background: '#E8EEEB', overflow: 'hidden', border: `1px solid ${C.g200}` }}>
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
        <Card {...widgetFrameProps('workload', { padding: '18px 18px' })}>
          {renderWidgetRemoveButton('workload')}
          {renderPanelHeader('담당자별 업무량', 'workload', '조치 요청/완료')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {managerWorkloads.slice(0, 3).map(([managerName, workload]) => (
              <div key={managerName} style={{ display: 'grid', gridTemplateColumns: '64px minmax(0,1fr) 44px', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 900, color: C.g800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{managerName}</span>
                <div style={{ height: 18, background: '#E8EEEB', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, Math.max(12, workload.total * 34 + workload.actionRequired * 20))}%`, height: '100%', background: workload.actionRequired ? '#C9545E' : '#2F73B7' }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 900, color: workload.actionRequired ? C.danger : C.primary, whiteSpace: 'nowrap' }}>
                  {workload.total}/{workload.actionRequired}
                </span>
              </div>
            ))}
          </div>
        </Card>
        )}

        {visibleWidgetSet.has('timeline') && (
        <Card {...widgetFrameProps('timeline', { padding: '14px 14px', overflow: 'visible', display: 'flex', flexDirection: 'column', minHeight: 0 })}>
          {renderWidgetRemoveButton('timeline')}
          {renderPanelHeader('월별 프로젝트 처리 타임라인', 'timeline', '공사 기간, 검증, 조치 요청, 보고서 생성')}
          <div className="thin-x-scroll" style={{ minHeight: 0, flex: 1, border: `1px solid ${C.g200}`, background: C.white }}>
            <div style={{ minWidth: 1120 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(860px,1fr)', minHeight: 34, borderBottom: `1px solid ${C.g200}`, background: '#F4F6F8' }}>
                <div style={{ padding: '8px 12px', borderRight: `1px solid ${C.g200}`, color: C.g800, fontSize: 12, fontWeight: 900 }}>프로젝트</div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${projectTimelineMonths.length}, minmax(92px,1fr))`, position: 'relative' }}>
                  {projectTimelineMonths.map((month) => (
                    <div key={month} style={{ padding: '8px 10px', borderRight: `1px solid ${C.g200}`, textAlign: 'center', color: C.g400, fontSize: 11, fontWeight: 900 }}>{month}</div>
                  ))}
                  <div style={{ position: 'absolute', top: 0, bottom: -260, left: `${((6.5 / projectTimelineMonths.length) * 100).toFixed(2)}%`, width: 2, background: '#F59D23', zIndex: 5 }} />
                </div>
              </div>

              {projectTimelineRows.map((row, rowIndex) => (
                <div key={row.code} style={{ display: 'grid', gridTemplateColumns: '220px minmax(860px,1fr)', minHeight: 58, borderBottom: `1px solid ${C.g200}`, background: rowIndex % 2 ? '#F7F9F8' : C.white }}>
                  <div style={{ padding: '8px 12px', borderRight: `1px solid ${C.g200}`, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                      <span style={{ width: 16, height: 16, display: 'inline-grid', placeItems: 'center', background: '#8A5CF6', color: C.white, borderRadius: 3, fontSize: 10, fontWeight: 900, flexShrink: 0 }}>P</span>
                      <div style={{ color: C.g800, fontSize: 13, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name}</div>
                    </div>
                    <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: C.g400, fontSize: 11, fontWeight: 900 }}>{row.code}</span>
                      <span style={{ height: 20, padding: '0 7px', display: 'inline-grid', placeItems: 'center', background: C.bg, border: `1px solid ${C.g200}`, color: C.primary, fontSize: 10, fontWeight: 900 }}>{row.status}</span>
                    </div>
                    <div style={{ marginTop: 5, height: 3, background: '#D8DEE2', overflow: 'hidden' }}>
                      <div style={{ width: `${row.progress}%`, height: '100%', background: row.color }} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${projectTimelineMonths.length}, minmax(92px,1fr))`, position: 'relative', alignItems: 'center', minHeight: 58 }}>
                    {projectTimelineMonths.map((month) => (
                      <div key={`${row.code}-${month}`} style={{ height: '100%', borderRight: `1px solid ${C.g200}`, background: month === '2025.04' ? 'rgba(245,157,35,.05)' : 'transparent' }} />
                    ))}
                    <div style={{ gridColumn: `${row.start} / span ${row.span}`, gridRow: 1, alignSelf: 'center', height: 24, borderRadius: 5, background: row.color, boxShadow: '0 8px 16px rgba(31,55,43,.13)', zIndex: 4, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 10px', color: C.white, fontSize: 10, fontWeight: 900 }}>
                      {row.status}
                    </div>
                    {row.subBars.map((bar, index) => (
                      <div key={`${row.code}-${bar.label}`} style={{ gridColumn: `${bar.start} / span ${bar.span}`, gridRow: 1, alignSelf: 'end', marginBottom: 8 + index * 3, height: 5, borderRadius: 999, background: row.color, opacity: .35, zIndex: 3 }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
        )}

        {visibleWidgetSet.has('myProjects') && (
        <Card {...widgetFrameProps('myProjects', { padding: '14px 14px', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' })}>
          {renderWidgetRemoveButton('myProjects')}
          <div style={dashboardPanelHeaderStyle}>
            {renderWidgetTitle('내 프로젝트 현황', 'myProjects', { fontSize: 13, fontWeight: 900, color: C.g800, marginBottom: 0 })}
            <Link href="/projects" style={{ fontSize: 12, fontWeight: 900, color: C.primary, textDecoration: 'none' }}>전체 목록</Link>
          </div>

          <div style={{ border: `1px solid ${C.g200}`, padding: 10, background: '#FCFEFD', marginBottom: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, alignItems: 'end' }}>
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
            </div>
          </div>

          <div data-ui="dash-sort" style={{ ...sortBarStyle, gap: 6, marginBottom: 10 }}>
            <ProjectSortControl field={sortBy} direction={sortDirection} onFieldChange={setSortBy} onDirectionChange={setSortDirection} />
            <PeriodFilter mode={periodMode} value={period} onModeChange={setPeriodMode} onValueChange={setPeriod} inputStyle={fieldStyle} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', paddingRight: 4, minHeight: 0 }}>
            {visibleProjects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ border: `1px solid ${C.g200}`, padding: '11px 13px', background: C.white }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                      <div style={{ color: C.g800, fontSize: 18, fontWeight: 900 }}>{project.constructionName}</div>
                      <span style={{ fontSize: 12, fontWeight: 900, color: PROJECT_STATUS_META[project.projectStatusCode].color, background: PROJECT_STATUS_META[project.projectStatusCode].bg, border: `1px solid ${C.g200}`, borderRadius: 2, padding: '3px 8px', lineHeight: '16px', whiteSpace: 'nowrap' }}>
                        {PROJECT_STATUS_META[project.projectStatusCode].label}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '150px 140px 220px 90px', gap: 10, maxWidth: 640 }}>
                      {[
                        ['프로젝트 번호', project.contractNumber],
                        ['관리자', project.manager],
                        ['공사기간', project.period],
                        ['공정률', project.progressRate],
                      ].map(([label, value]) => (
                        <div key={label} style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: C.g400, fontWeight: 800, marginBottom: 4 }}>{label}</div>
                          <div style={{ fontSize: 14, color: C.g800, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
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
