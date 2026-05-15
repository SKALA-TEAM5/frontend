'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { AppFrame, ProjectSortControl } from '../../components/common';
import PeriodFilter from '../../components/common/PeriodFilter';
import { logout } from '../../lib/auth-api';
import { useCurrentUser } from '../../lib/dev-user';
import { VALIDATION_DASHBOARD_RESULT } from '../../lib/evidence-utils';
import { C } from '../../lib/theme';
import { getProjectManagers, getSheFilterOptionsFromProjects, normalizeProjectStatus, STATUS_META, type ProjectStatus, type ProjectSummary } from '../../lib/project-data';
import { listProjects } from '../../lib/project-api';
import { getVisibleProjects, type PeriodMode, type ProjectSortField, type SortDirection } from '../../lib/project-list';
import { ROLE_LABELS } from '../../lib/permissions';
import {
  DASHBOARD_WIDGETS,
  DASHBOARD_WIDGET_LAYOUT_STORAGE_KEY,
  DASHBOARD_WIDGET_SIZE_STORAGE_KEY,
  DASHBOARD_WIDGET_STORAGE_KEY,
  DEFAULT_WIDGET_IDS,
  DEFAULT_WIDGET_LAYOUT,
  GRID_COLUMN_COUNT,
  GRID_EDIT_PADDING,
  GRID_GAP,
  GRID_ROW_GUIDE_HEIGHT,
  WIDGET_SIZE_LIMITS,
  WIDGET_SIZES,
  dashboardEditGridStyle,
  dashboardGridStyle,
  getGridCellMetrics,
  resolveLayoutWithPushDown,
  widgetPlacementStyle,
  type DashboardWidgetId,
  type WidgetHelpId,
  type WidgetPosition,
  type WidgetSize,
} from '../../features/dashboard/widget-layout';

const LOCAL_USAGE_STATEMENT_PREFIX = 'iveri-mvp-usage-statement:';

const DASHBOARD_WIDGET_ACCENTS: Record<WidgetHelpId, { bg: string; border: string; text: string; meta: string }> = {
  supplementReasons: { bg: '#F6FBFD', border: '#C9DFEA', text: '#255B73', meta: '#5F8191' },
  supplementReasonTrend: { bg: '#FFF8FA', border: '#F1CDD8', text: '#A84F68', meta: '#9B6575' },
  projectProgress: { bg: '#FFF7ED', border: '#F1DEC0', text: '#98642A', meta: '#9E835A' },
  workload: { bg: '#F5F1FD', border: '#E0D7F4', text: '#6550A1', meta: '#8174A8' },
  myProjects: { bg: '#EEF8F2', border: '#D4E7D9', text: '#2C7554', meta: '#648970' },
};

const SUPPLEMENT_REASON_TYPES = [
  {
    id: 'purpose',
    label: '집행 목적 부적합',
    keywords: ['목적', '범위', '본사', '관리비', '사용 목적', '인정 범위'],
    color: '#3D8CC9',
  },
  {
    id: 'allocation',
    label: '법정 계상률 초과',
    keywords: ['계상', '금액', '초과', '안전관리비', '정산', '예산'],
    color: '#E7A13A',
  },
  {
    id: 'labor',
    label: '인건비 중복계상',
    keywords: ['인건비', '임금', '급여', '중복', '근로자', '직접 노무'],
    color: '#8F75D6',
  },
  {
    id: 'evidence',
    label: '증빙 정합성 미흡',
    keywords: ['증빙', '영수증', '사진', '세금계산서', '자료', '제출', '첨부'],
    color: '#2AA879',
  },
] as const;

const mergeWorkflowStatus = (project: ProjectSummary) => {
  if (typeof window === 'undefined') return project;
  try {
    const raw = window.localStorage.getItem(`${LOCAL_USAGE_STATEMENT_PREFIX}${project.id}`);
    if (!raw) return project;
    const parsed = JSON.parse(raw) as { workflowStatus?: ProjectSummary['status']; actionRequestDetails?: ProjectSummary['actionRequestDetails'] };
    if (!parsed.workflowStatus) return project;
    const workflowStatus = normalizeProjectStatus(parsed.workflowStatus);
    return {
      ...project,
      status: workflowStatus,
      hasActionRequest: workflowStatus === 'supplement_required',
      actionRequestDetails: workflowStatus === 'supplement_required' ? parsed.actionRequestDetails : undefined,
      reportReady: workflowStatus === 'review_completed' || workflowStatus === 'supplement_required',
    };
  } catch {
    return project;
  }
};

const readUsageStatementMonth = (projectId: string) => {
  if (typeof window === 'undefined') return '';
  try {
    const raw = window.localStorage.getItem(`${LOCAL_USAGE_STATEMENT_PREFIX}${projectId}`);
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { statementSummary?: { month?: string } };
    return parsed.statementSummary?.month || '';
  } catch {
    return '';
  }
};

const getSupplementReasonMatchIds = (sourceText: string) => {
  const normalized = sourceText.toLowerCase();
  const matches = SUPPLEMENT_REASON_TYPES
    .filter((reasonType) => reasonType.keywords.some((keyword) => normalized.includes(keyword.toLowerCase())))
    .map((reasonType) => reasonType.id);
  return matches.length ? matches : ['evidence'];
};

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

const workflowBadgeStyle = (color: string, bg: string, border = color): CSSProperties => ({
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
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  padding: '0 40px 56px',
  minHeight: 'calc(100vh - 64px)',
  overflow: 'hidden',
  background: 'linear-gradient(135deg, rgba(237, 250, 242, .28) 0%, rgba(223, 244, 232, .22) 46%, rgba(250, 254, 252, .35) 100%)',
};

const dashboardPhotoBackdropStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: -40,
  right: -40,
  height: 430,
  pointerEvents: 'none',
  background: 'linear-gradient(180deg, rgba(237, 250, 242, .08) 0%, rgba(232, 247, 238, .34) 42%, rgba(232, 247, 238, .82) 76%, rgba(237, 250, 242, 1) 100%), linear-gradient(135deg, rgba(232, 247, 238, .72) 0%, rgba(205, 234, 218, .58) 48%, rgba(246, 252, 248, .54) 100%), linear-gradient(90deg, rgba(33, 111, 76, .28), rgba(33, 111, 76, .16)), url("https://images.pexels.com/photos/32858871/pexels-photo-32858871.jpeg?auto=compress&cs=tinysrgb&w=1800") center 52% / cover no-repeat',
  zIndex: 0,
};

const dashboardTopStyle: CSSProperties = {
  position: 'relative',
  zIndex: 1,
  minWidth: 0,
  padding: '26px 40px 18px',
  margin: '0 -40px',
  borderRadius: 0,
  overflow: 'hidden',
  background: 'transparent',
  boxShadow: 'none',
};

const dashboardContentLayerStyle: CSSProperties = {
  position: 'relative',
  zIndex: 1,
};

const dashboardTopInnerStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 560px) minmax(260px, 320px)',
  gap: 32,
  justifyContent: 'space-between',
  alignItems: 'start',
  width: 'min(100%, 1280px)',
  margin: '0 auto',
  minWidth: 0,
};

const dashboardStatusGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 12,
  minWidth: 0,
};

const dashboardPanelStyle: CSSProperties = {
  borderRadius: 14,
  border: `1px solid ${C.g200}`,
  boxShadow: '0 8px 18px rgba(31,55,43,.05)',
  background: C.white,
};

const dashboardPanelHeaderStyle: CSSProperties = {
  height: 28,
  minHeight: 28,
  flexShrink: 0,
  margin: '0 0 14px',
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  borderBottom: 'none',
  borderTopLeftRadius: 14,
  borderTopRightRadius: 14,
  background: 'transparent',
};

const statusCardTone = (status: ProjectStatus) => {
  if (status === 'supplement_required') {
    return { border: '#F4CBCB', background: C.white };
  }
  if (status === 'upload_completed' || status === 'review_completed') {
    return { border: '#CFE7D8', background: C.white };
  }
  return { border: C.g200, background: C.white };
};

const widgetHelpText: Record<WidgetHelpId, string> = {
  supplementReasons: '유효성 검증 후 보완 요청으로 이어진 주요 사유를 목적, 계상률, 인건비, 증빙 정합성 기준으로 집계합니다.',
  supplementReasonTrend: '프로젝트별로 월 단위 보완 요청 사유 분포를 막대 그래프로 보여줍니다.',
  projectProgress: '프로젝트별 실제 공정률을 막대로 비교해 보여줍니다.',
  workload: '담당자별 전체 프로젝트 수와 보완 요청 부담을 보여줍니다.',
  myProjects: '내가 볼 수 있는 모든 프로젝트를 검색, 필터, 정렬해 보여줍니다.',
};

export default function DashboardPage() {
  const router = useRouter();
  const { user, clearCurrentUser } = useCurrentUser();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
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
  const [widgetSizes, setWidgetSizes] = useState<Record<DashboardWidgetId, WidgetSize>>(WIDGET_SIZES);
  const [selectedReasonProjectId, setSelectedReasonProjectId] = useState('');
  const [logoutPending, setLogoutPending] = useState(false);
  const [resizeState, setResizeState] = useState<{
    id: DashboardWidgetId;
    startX: number;
    startY: number;
    startSize: WidgetSize;
  } | null>(null);
  const dashboardGridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    listProjects({ size: 10 })
      .then((items) => {
        if (alive) setProjects(items.map(mergeWorkflowStatus));
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
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as string[];
        const validIds = parsed.filter((id): id is DashboardWidgetId => DEFAULT_WIDGET_IDS.includes(id as DashboardWidgetId));
        setVisibleWidgetIds(validIds);
      } catch {
        window.localStorage.removeItem(DASHBOARD_WIDGET_STORAGE_KEY);
      }
    }

    const storedLayout = window.localStorage.getItem(DASHBOARD_WIDGET_LAYOUT_STORAGE_KEY);
    if (storedLayout) {
      try {
        const parsed = JSON.parse(storedLayout) as Partial<Record<DashboardWidgetId, WidgetPosition>>;
        const validLayout = Object.fromEntries(
          Object.entries(parsed).filter(([id]) => DEFAULT_WIDGET_IDS.includes(id as DashboardWidgetId)),
        ) as Partial<Record<DashboardWidgetId, WidgetPosition>>;
        setWidgetLayout({ ...DEFAULT_WIDGET_LAYOUT, ...validLayout });
      } catch {
        window.localStorage.removeItem(DASHBOARD_WIDGET_LAYOUT_STORAGE_KEY);
      }
    }

    const storedSizes = window.localStorage.getItem(DASHBOARD_WIDGET_SIZE_STORAGE_KEY);
    if (storedSizes) {
      try {
        const parsed = JSON.parse(storedSizes) as Partial<Record<DashboardWidgetId, WidgetSize>>;
        const nextSizes = { ...WIDGET_SIZES };
        DEFAULT_WIDGET_IDS.forEach((id) => {
          const rawSize = parsed[id];
          if (!rawSize) return;
          const limit = WIDGET_SIZE_LIMITS[id];
          nextSizes[id] = {
            colSpan: Math.min(limit.maxColSpan, Math.max(limit.minColSpan, rawSize.colSpan || WIDGET_SIZES[id].colSpan)),
            rowSpan: Math.min(limit.maxRowSpan, Math.max(limit.minRowSpan, rawSize.rowSpan || WIDGET_SIZES[id].rowSpan)),
          };
        });
        setWidgetSizes(nextSizes);
      } catch {
        window.localStorage.removeItem(DASHBOARD_WIDGET_SIZE_STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(DASHBOARD_WIDGET_STORAGE_KEY, JSON.stringify(visibleWidgetIds));
  }, [visibleWidgetIds]);
  useEffect(() => {
    window.localStorage.setItem(DASHBOARD_WIDGET_LAYOUT_STORAGE_KEY, JSON.stringify(widgetLayout));
  }, [widgetLayout]);
  useEffect(() => {
    window.localStorage.setItem(DASHBOARD_WIDGET_SIZE_STORAGE_KEY, JSON.stringify(widgetSizes));
  }, [widgetSizes]);
  useEffect(() => {
    if (!resizeState || !dashboardGridRef.current) return;
    const grid = dashboardGridRef.current;
    const { columnPitch } = getGridCellMetrics(grid);
    const rowPitch = GRID_ROW_GUIDE_HEIGHT + GRID_GAP;
    const handlePointerMove = (event: PointerEvent) => {
      const deltaCols = Math.round((event.clientX - resizeState.startX) / columnPitch);
      const deltaRows = Math.round((event.clientY - resizeState.startY) / rowPitch);
      const limit = WIDGET_SIZE_LIMITS[resizeState.id];
      const nextSize: WidgetSize = {
        colSpan: Math.min(limit.maxColSpan, Math.max(limit.minColSpan, resizeState.startSize.colSpan + deltaCols)),
        rowSpan: Math.min(limit.maxRowSpan, Math.max(limit.minRowSpan, resizeState.startSize.rowSpan + deltaRows)),
      };
      setWidgetSizes((current) => {
        const prev = current[resizeState.id];
        if (prev.colSpan === nextSize.colSpan && prev.rowSpan === nextSize.rowSpan) return current;
        const nextSizes = { ...current, [resizeState.id]: nextSize };
        setWidgetLayout((layout) => resolveLayoutWithPushDown(layout, visibleWidgetIds, resizeState.id, layout[resizeState.id] || DEFAULT_WIDGET_LAYOUT[resizeState.id], nextSizes));
        return nextSizes;
      });
    };
    const handlePointerUp = () => setResizeState(null);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [resizeState, visibleWidgetIds]);

  const visibleWidgetSet = useMemo(() => new Set(visibleWidgetIds), [visibleWidgetIds]);
  const toggleWidget = (id: DashboardWidgetId) => {
    setVisibleWidgetIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };
  const resetWidgets = () => {
    window.localStorage.removeItem(DASHBOARD_WIDGET_STORAGE_KEY);
    window.localStorage.removeItem(DASHBOARD_WIDGET_LAYOUT_STORAGE_KEY);
    window.localStorage.removeItem(DASHBOARD_WIDGET_SIZE_STORAGE_KEY);
    setVisibleWidgetIds(DEFAULT_WIDGET_IDS);
    setWidgetLayout(DEFAULT_WIDGET_LAYOUT);
    setWidgetSizes(WIDGET_SIZES);
  };
  const hideWidget = (id: DashboardWidgetId) => setVisibleWidgetIds((current) => current.filter((item) => item !== id));
  const handleDashboardLogout = async () => {
    if (logoutPending) return;
    setLogoutPending(true);
    try {
      await logout();
    } catch {
      // Local session cleanup should still happen even if the logout request fails.
    } finally {
      clearCurrentUser();
      setLogoutPending(false);
      router.replace('/');
    }
  };
  const moveWidgetToGridCell = (event: React.DragEvent<HTMLDivElement>) => {
    if (!draggedWidgetId || !dashboardGridRef.current) return;
    const grid = dashboardGridRef.current;
    const rect = grid.getBoundingClientRect();
    const { columnPitch } = getGridCellMetrics(grid);
    const x = Math.max(0, event.clientX - rect.left + grid.scrollLeft - GRID_EDIT_PADDING);
    const y = Math.max(0, event.clientY - rect.top + grid.scrollTop - GRID_EDIT_PADDING);
    const size = widgetSizes[draggedWidgetId];
    const maxColumn = Math.max(1, GRID_COLUMN_COUNT - size.colSpan + 1);
    const col = Math.min(maxColumn, Math.floor(x / columnPitch) + 1);
    const row = Math.min(Math.max(1, Math.floor(y / (GRID_ROW_GUIDE_HEIGHT + GRID_GAP)) + 1), 24);
    const activeWidgetIds = visibleWidgetIds.includes(draggedWidgetId) ? visibleWidgetIds : [...visibleWidgetIds, draggedWidgetId];
    setWidgetLayout((current) => {
      return resolveLayoutWithPushDown(current, activeWidgetIds, draggedWidgetId, { col, row }, widgetSizes);
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

  const workflowProjects = {
    draft: projects.filter((project) => project.status === 'draft'),
    upload_completed: projects.filter((project) => project.status === 'upload_completed'),
    supplement_required: projects.filter((project) => project.status === 'supplement_required'),
    review_completed: projects.filter((project) => project.status === 'review_completed'),
  };
  const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const monthlyReviewedCount = projects.filter((project) => readUsageStatementMonth(project.id) === currentMonthKey).length;
  const validationTargetCount = projects.filter((project) => project.status !== 'draft').length;
  const validationCompletedCount = projects.filter((project) => project.status === 'review_completed' || project.status === 'supplement_required').length;
  const reviewCompletedCount = projects.filter((project) => project.status === 'review_completed').length;
  const supplementRequiredCount = workflowProjects.supplement_required.length;
  const statusSummaryCards = [
    { label: '월별 검토 현황', value: monthlyReviewedCount, total: projects.length, meta: `${currentMonthKey.replace('-', '년 ')}월 기준`, color: '#255B73', border: '#C9DFEA', soft: '#F6FBFD', icon: '◌' },
    { label: '유효성 검증 완료', value: validationCompletedCount, total: validationTargetCount, meta: '유효성 검증', color: '#2F73B7', border: '#C6D9EE', soft: '#F5F9FF', icon: '✓' },
    { label: '보완 요청', value: supplementRequiredCount, total: null, meta: '증빙자료 보완 필요', color: '#D9485F', border: '#F0CDD4', soft: '#FFF8F9', icon: '!' },
    { label: '검토 완료', value: reviewCompletedCount, total: projects.length, meta: '전체 프로젝트 대비', color: '#258A5E', border: '#CDE5D7', soft: '#F5FBF7', icon: '◎' },
  ] as const;
  const userInitials = useMemo(() => {
    const trimmed = user.name.trim();
    if (!trimmed) return 'U';
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
  }, [user.name]);
  const queueProjects = projects
    .filter((project) => project.status === 'upload_completed' || project.status === 'supplement_required')
    .map((project) => ({
      id: `project-${project.id}`,
      projectId: project.id,
      projectName: project.constructionName,
      title: project.status === 'supplement_required'
        ? (project.actionRequestDetails?.title || '보완 요청 확인 필요')
        : '업로드 완료 검토 필요',
      message:
        project.status === 'supplement_required'
          ? (project.actionRequestDetails?.reason || '프로젝트 담당자가 사용내역서 또는 증빙 자료를 수정해야 합니다.')
          : '프로젝트 담당자가 업로드를 완료했습니다. SHE 담당자의 유효성 검증이 필요합니다.',
      assignee: project.manager || '프로젝트 담당자',
      createdAt: project.status === 'supplement_required' ? (project.actionRequestDetails?.requestedAt || '-') : '-',
      status: project.status,
    }))
    .slice(0, 6);
  const validationReasonMatchIds = VALIDATION_DASHBOARD_RESULT.categories.flatMap((category) => {
    const issueTexts = category.issues.length
      ? category.issues.map((issue) => `${category.categoryName} ${issue.title} ${issue.description} ${issue.requiredAction} ${issue.recommendedFiles.join(' ')}`)
      : category.decision === 'appropriate'
        ? []
        : [`${category.categoryName} ${category.legalBasis.map((basis) => `${basis.summary} ${basis.agentReasoning}`).join(' ')}`];
    return issueTexts.flatMap(getSupplementReasonMatchIds);
  });
  const projectReasonMatchIds = projects.flatMap((project) => {
    if (project.status !== 'supplement_required') return [];
    const sourceText = `${project.actionRequestDetails?.title || ''} ${project.actionRequestDetails?.reason || ''}`;
    return getSupplementReasonMatchIds(sourceText);
  });
  const combinedReasonMatchIds = [...validationReasonMatchIds, ...projectReasonMatchIds];
  const supplementReasonRows = SUPPLEMENT_REASON_TYPES.map((reasonType) => ({
    ...reasonType,
    count: combinedReasonMatchIds.filter((id) => id === reasonType.id).length,
  }));
  const supplementReasonTotal = supplementReasonRows.reduce((sum, row) => sum + row.count, 0);
  const supplementReasonChartRows = supplementReasonTotal > 0
    ? supplementReasonRows
    : supplementReasonRows.map((row) => ({ ...row, count: 0 }));
  const supplementReasonRadius = 52;
  const supplementReasonCircumference = 2 * Math.PI * supplementReasonRadius;
  let supplementReasonOffset = 0;
  const supplementReasonSegments = supplementReasonRows.map((row) => {
    const length = supplementReasonTotal > 0 ? (row.count / supplementReasonTotal) * supplementReasonCircumference : 0;
    const segment = { ...row, length, offset: supplementReasonOffset };
    supplementReasonOffset += length;
    return segment;
  });
  const selectedReasonProject = projects.find((project) => project.id === selectedReasonProjectId) || projects[0];
  const reasonProjectId = selectedReasonProject?.id || '';
  const reasonTrendMonths = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, index) => {
      const month = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
      return { key, label: `${month.getMonth() + 1}월` };
    });
  }, []);
  const selectedReasonProjectMonth = selectedReasonProject ? readUsageStatementMonth(selectedReasonProject.id) : '';
  const selectedReasonSourceText = `${selectedReasonProject?.actionRequestDetails?.title || ''} ${selectedReasonProject?.actionRequestDetails?.reason || ''}`.toLowerCase();
  const reasonTrendRows = reasonTrendMonths.map((month) => {
    const activeMonth = month.key === (selectedReasonProjectMonth || currentMonthKey);
    const reasons = SUPPLEMENT_REASON_TYPES.map((reasonType) => {
      const projectCount = activeMonth && Boolean(selectedReasonProject) && selectedReasonProject.status === 'supplement_required'
        ? getSupplementReasonMatchIds(selectedReasonSourceText).filter((id) => id === reasonType.id).length
        : 0;
      const validationCount = month.key === currentMonthKey
        ? validationReasonMatchIds.filter((id) => id === reasonType.id).length
        : 0;
      return { ...reasonType, count: projectCount + validationCount };
    });
    return {
      ...month,
      reasons,
      total: reasons.reduce((sum, reason) => sum + reason.count, 0),
    };
  }).filter((row) => row.total > 0);
  const maxReasonTrendValue = Math.max(1, ...reasonTrendRows.flatMap((row) => [row.total, ...row.reasons.map((reason) => reason.count)]));
  const managerWorkloads = Array.from(
    projects.reduce((map, project) => {
      const projectManagers = project.participants.length > 0 ? project.participants : getProjectManagers(project);
      const managers = projectManagers.length > 0 ? projectManagers : ['미지정'];
      const actionAssignees = project.status === 'supplement_required'
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
  const widgetTooltipStyle = (id: DashboardWidgetId, minWidth = 200): CSSProperties => {
    const position = widgetLayout[id] || DEFAULT_WIDGET_LAYOUT[id];
    const size = widgetSizes[id];
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
    const size = widgetSizes[id];
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
  const renderPanelHeader = (label: string, id: WidgetHelpId, meta?: ReactNode) => {
    const accent = DASHBOARD_WIDGET_ACCENTS[id];
    return (
    <div style={{ ...dashboardPanelHeaderStyle, background: 'transparent', borderBottom: 'none' }}>
      {renderWidgetTitle(label, id, { fontSize: 13, fontWeight: 900, color: C.g800, marginBottom: 0 })}
      {meta && <span style={{ color: accent.meta, fontSize: 11, fontWeight: 900, whiteSpace: 'nowrap' }}>{meta}</span>}
    </div>
  );
  };
  const widgetFrameProps = (id: DashboardWidgetId, style: CSSProperties = {}) => {
    const size = widgetSizes[id];
    const position = widgetLayout[id] || DEFAULT_WIDGET_LAYOUT[id];
    const accent = DASHBOARD_WIDGET_ACCENTS[id];
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
      border: `1px solid ${accent.border}`,
      boxShadow: '0 8px 18px rgba(31,55,43,.05)',
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
  const renderWidgetResizeHandle = (id: DashboardWidgetId) => {
    if (!editMode) return null;
    return (
      <button
        type="button"
        aria-label="위젯 크기 조절"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          (event.currentTarget as HTMLButtonElement).setPointerCapture?.(event.pointerId);
          setResizeState({
            id,
            startX: event.clientX,
            startY: event.clientY,
            startSize: widgetSizes[id],
          });
        }}
        style={{
          position: 'absolute',
          right: 10,
          bottom: 10,
          zIndex: 20,
          width: 24,
          height: 24,
          borderRadius: 8,
          border: `1px solid ${C.g200}`,
          background: 'rgba(255,255,255,.96)',
          boxShadow: '0 8px 18px rgba(31,55,43,.08)',
          cursor: 'nwse-resize',
          padding: 0,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'block',
            background: 'linear-gradient(135deg, transparent 0 52%, #89A39A 52% 60%, transparent 60% 68%, #89A39A 68% 76%, transparent 76% 84%, #89A39A 84% 92%, transparent 92%)',
            borderRadius: 8,
          }}
        />
      </button>
    );
  };
  return (
    <AppFrame title="프로젝트 대시보드" mainClassName="dashboard-main">
      <div style={dashboardPageStyle}>
      <div aria-hidden="true" style={dashboardPhotoBackdropStyle} />
      <section style={dashboardTopStyle}>
        <div style={dashboardTopInnerStyle}>
        <div style={dashboardStatusGridStyle}>
            {statusSummaryCards.map((item) => (
              <div key={item.label} style={{ border: `1px solid ${item.border}`, borderRadius: 14, background: C.white, padding: '14px 14px 12px', minWidth: 0, boxShadow: '0 8px 18px rgba(31,55,43,.05)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, minWidth: 0 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: item.color, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.meta}</div>
                    <div style={{ marginTop: 6, fontSize: 14, fontWeight: 900, color: C.g800, lineHeight: 1.35, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{item.label}</div>
                  </div>
                  <div aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 10, border: `1px solid ${item.border}`, background: item.soft, color: item.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, flexShrink: 0 }}>
                    {item.icon}
                  </div>
                </div>
                {item.total === null ? (
                  <div style={{ marginTop: 14, border: `1px solid ${item.border}`, borderRadius: 10, background: item.soft, padding: '10px 12px', minWidth: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 900, color: item.color }}>건수</div>
                    <div style={{ marginTop: 6, fontSize: 22, fontWeight: 900, color: item.color, lineHeight: 1 }}>{item.value}</div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 14 }}>
                    <div style={{ border: `1px solid ${item.border}`, borderRadius: 10, background: item.soft, padding: '8px 10px', minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 900, color: item.color }}>완료</div>
                      <div style={{ marginTop: 5, fontSize: 18, fontWeight: 900, color: item.color, lineHeight: 1 }}>{item.value}</div>
                    </div>
                    <div style={{ border: `1px solid ${C.g200}`, borderRadius: 10, background: C.white, padding: '8px 10px', minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 900, color: C.g400 }}>전체</div>
                      <div style={{ marginTop: 5, fontSize: 18, fontWeight: 900, color: C.g800, lineHeight: 1 }}>{item.total}</div>
                    </div>
                  </div>
                )}
              </div>
            ))}
        </div>
        <aside style={{ alignSelf: 'center', border: `1px solid ${C.g200}`, borderRadius: 14, background: C.white, padding: 12, boxShadow: '0 8px 18px rgba(31,55,43,.05)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: 10, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{ width: 38, height: 38, borderRadius: 999, background: 'linear-gradient(135deg, #23794F, #86C89F)', color: C.white, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 900, flexShrink: 0 }}>
              {userInitials}
            </div>
	            <div style={{ minWidth: 0, flex: 1 }}>
		              <div style={{ fontSize: 15, fontWeight: 900, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name || '사용자'}</div>
		              <div style={{ marginTop: 3, fontSize: 11, fontWeight: 900, color: C.g600 }}>{ROLE_LABELS[user.role]}</div>
	            </div>
	            <button
	              type="button"
	              onClick={handleDashboardLogout}
	              disabled={logoutPending}
	              style={{ height: 28, border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.g600, fontFamily: 'inherit', fontSize: 11, fontWeight: 900, cursor: logoutPending ? 'not-allowed' : 'pointer', opacity: logoutPending ? .55 : 1, padding: '0 10px', flexShrink: 0 }}
	            >
	              {logoutPending ? '처리 중' : '로그아웃'}
	            </button>
	          </div>
	          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
		            <div style={{ border: `1px solid ${C.g200}`, borderRadius: 10, padding: '8px 10px', minWidth: 0 }}>
	              <div style={{ fontSize: 10, fontWeight: 900, color: C.g400 }}>전체 프로젝트</div>
		              <div style={{ marginTop: 4, fontSize: 18, lineHeight: 1, fontWeight: 900, color: C.g800 }}>{projects.length}</div>
	            </div>
            <div style={{ border: `1px solid ${C.g200}`, borderRadius: 10, padding: '8px 10px', minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 900, color: C.g400 }}>확인 필요</div>
		              <div style={{ marginTop: 4, fontSize: 18, lineHeight: 1, fontWeight: 900, color: C.primary }}>{queueProjects.length}</div>
	            </div>
	          </div>
	          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
		            <button
		              type="button"
		              disabled
			              style={{ height: 30, border: `1px solid ${C.g200}`, borderRadius: 999, background: C.g100, color: C.g400, fontFamily: 'inherit', fontSize: 11, fontWeight: 900, cursor: 'not-allowed', opacity: .72 }}
		            >
		              내 프로필
		            </button>
		            <button
		              type="button"
		              disabled
			              style={{ height: 30, border: `1px solid ${C.g200}`, borderRadius: 999, background: C.g100, color: C.g400, fontFamily: 'inherit', fontSize: 11, fontWeight: 900, cursor: 'not-allowed', opacity: .72 }}
		            >
		              담당자 관리
		            </button>
	          </div>
	        </aside>
        </div>
      </section>

      <div style={{ ...dashboardContentLayerStyle, display: 'flex', justifyContent: 'flex-end', padding: '0 2px' }}>
        <button type="button" onClick={() => setEditMode((mode) => !mode)} style={{ border: 'none', background: 'transparent', padding: 0, color: C.g600, fontSize: 12, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          {editMode ? '편집 완료' : '대시보드 편집'}
        </button>
      </div>

      {editMode && (
        <Card style={{ ...dashboardContentLayerStyle, ...dashboardPanelStyle, padding: '16px 18px', marginBottom: 14 }}>
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
        style={{ ...dashboardContentLayerStyle, ...dashboardGridStyle, ...(editMode ? dashboardEditGridStyle : {}) }}
      >
        {visibleWidgetSet.size === 0 && (
          <Card style={{ ...widgetPlacementStyle({ colSpan: 2, rowSpan: 1 }), padding: '28px 30px' }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: C.g800, marginBottom: 6 }}>표시 중인 위젯이 없습니다.</div>
            <div style={{ fontSize: 14, color: C.g400 }}>대시보드 편집에서 필요한 위젯을 선택해 주세요.</div>
          </Card>
        )}
        {visibleWidgetSet.has('supplementReasons') && (
        <Card {...widgetFrameProps('supplementReasons', { padding: '20px 20px 18px', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' })}>
          {renderWidgetRemoveButton('supplementReasons')}
          {renderWidgetResizeHandle('supplementReasons')}
          {renderPanelHeader('보완 요청 사유 분석', 'supplementReasons', `${supplementReasonTotal}건`)}
          <div style={{ display: 'grid', gridTemplateColumns: '156px minmax(0, 1fr)', gap: 22, alignItems: 'center', minHeight: 0, flex: 1, padding: '2px 0 0' }}>
            <div style={{ position: 'relative', width: 156, height: 156, display: 'grid', placeItems: 'center' }}>
              <svg width="156" height="156" viewBox="0 0 156 156" aria-label="보완 요청 사유 원 그래프">
                <circle cx="78" cy="78" r={supplementReasonRadius} fill="none" stroke="#F1F6F8" strokeWidth="22" />
                {supplementReasonSegments.map((segment) => segment.length > 0 && (
                  <circle
                    key={segment.id}
                    cx="78"
                    cy="78"
                    r={supplementReasonRadius}
                    fill="none"
                    stroke={segment.color}
                    strokeWidth="22"
                    strokeLinecap="butt"
                    strokeDasharray={`${segment.length} ${supplementReasonCircumference}`}
                    strokeDashoffset={-segment.offset}
                    transform="rotate(-90 78 78)"
                  />
                ))}
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', pointerEvents: 'none' }}>
                <div>
                  <div style={{ fontSize: 32, fontWeight: 900, color: supplementReasonTotal > 0 ? C.g800 : C.g400, lineHeight: 1 }}>{supplementReasonTotal}</div>
                  <div style={{ marginTop: 7, fontSize: 11, fontWeight: 900, color: supplementReasonTotal > 0 ? C.primary : C.g400 }}>보완 사유</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
              {supplementReasonChartRows.map((row) => (
                <div key={row.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 22px', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: row.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 900, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: 0 }}>{row.label}</span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 900, color: row.count ? row.color : C.g400, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.count}</span>
                </div>
              ))}
              {supplementReasonTotal === 0 && (
                <div style={{ marginTop: 3, fontSize: 11, fontWeight: 800, color: C.g400, lineHeight: 1.45 }}>
                  유효성 검증 후 등록된 보완 요청 사유가 없습니다.
                </div>
              )}
            </div>
          </div>
        </Card>
        )}

        {visibleWidgetSet.has('supplementReasonTrend') && (
        <Card {...widgetFrameProps('supplementReasonTrend', { padding: '18px 18px', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' })}>
          {renderWidgetRemoveButton('supplementReasonTrend')}
          {renderWidgetResizeHandle('supplementReasonTrend')}
          {renderPanelHeader('월별 보완 요청 사유', 'supplementReasonTrend', (
            <select
              aria-label="보완 요청 사유 분석 프로젝트"
              value={reasonProjectId}
              onChange={(event) => setSelectedReasonProjectId(event.target.value)}
	              style={{ height: 28, maxWidth: 190, border: `1px solid ${DASHBOARD_WIDGET_ACCENTS.supplementReasonTrend.border}`, borderRadius: 999, padding: '0 24px 0 10px', background: C.white, color: C.g800, fontSize: 11, fontWeight: 900, fontFamily: 'inherit' }}
            >
              {projects.length === 0 && <option value="">프로젝트 없음</option>}
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.constructionName}</option>
              ))}
            </select>
          ))}
          <div style={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr) auto', gap: 10, flex: 1, minHeight: 0 }}>
            <div style={{ position: 'relative', minHeight: 126, borderRadius: 12, background: 'repeating-linear-gradient(to top, transparent 0, transparent 23px, rgba(137,163,154,.28) 24px)', border: `1px solid ${C.g100}`, padding: '12px 12px 24px', overflow: 'hidden' }}>
              {reasonTrendRows.length === 0 ? (
                <div style={{ height: '100%', minHeight: 90, display: 'grid', placeItems: 'center', color: C.g400, fontSize: 12, fontWeight: 900 }}>
                  표시할 월별 검증 결과가 없습니다.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${reasonTrendRows.length}, 76px)`, gap: 14, alignItems: 'end', justifyContent: 'start', height: '100%', minHeight: 90, overflowX: 'auto', overflowY: 'hidden' }}>
                  {reasonTrendRows.map((month) => (
                    <div key={month.key} style={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr) auto', gap: 7, minHeight: 0 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${SUPPLEMENT_REASON_TYPES.length + 1}, minmax(5px, 1fr))`, gap: 3, alignItems: 'end', minHeight: 86 }}>
                        {[{ id: 'total', label: '전체', count: month.total, color: '#7A5CF6' }, ...month.reasons].map((reason) => {
                          const height = reason.count ? Math.max(8, (reason.count / maxReasonTrendValue) * 86) : 0;
                          return (
                            <div
                              key={reason.id}
                              title={`${month.label} ${reason.label}: ${reason.count}건`}
                              style={{ height, borderRadius: '999px 999px 2px 2px', background: reason.color, opacity: reason.count ? .92 : 0 }}
                            />
                          );
                        })}
                      </div>
                      <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 900, color: C.g600 }}>{month.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 900, color: C.g600, whiteSpace: 'nowrap' }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: '#7A5CF6' }} />
                전체
              </span>
              {SUPPLEMENT_REASON_TYPES.map((reasonType) => (
                <span key={reasonType.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 900, color: C.g600, whiteSpace: 'nowrap' }}>
                  <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: reasonType.color }} />
                  {reasonType.label}
                </span>
              ))}
            </div>
          </div>
        </Card>
        )}

        {visibleWidgetSet.has('projectProgress') && (
        <Card {...widgetFrameProps('projectProgress', { padding: '18px 18px', display: 'flex', flexDirection: 'column', minHeight: 0 })}>
          {renderWidgetRemoveButton('projectProgress')}
          {renderWidgetResizeHandle('projectProgress')}
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
          {renderWidgetResizeHandle('workload')}
          {renderPanelHeader('담당자별 프로젝트 현황', 'workload', '보완 요청・프로젝트')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 8, overflowY: 'auto', minHeight: 0, paddingRight: 4 }}>
            {managerWorkloads.map(([managerName, workload]) => (
              <div key={managerName} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 8, border: `1px solid ${workload.actionRequired ? '#F4CBCB' : C.g200}`, borderRadius: 10, background: C.white, padding: '8px 9px', boxShadow: '0 6px 14px rgba(31,55,43,.04)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr)', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <div aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 999, background: workload.actionRequired ? '#FFECEC' : C.bg, color: workload.actionRequired ? C.danger : C.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900 }}>
                    {managerName.slice(0, 1)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: C.g800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{managerName}</div>
                    <div style={{ marginTop: 2, fontSize: 10, fontWeight: 800, color: workload.actionRequired ? C.danger : C.g400, whiteSpace: 'nowrap' }}>
                      {workload.actionRequired ? '확인 필요' : '보완 요청 없음'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <div title="보완 요청" style={{ minWidth: 48, border: `1px solid ${workload.actionRequired ? '#F4CBCB' : '#C8DAF8'}`, borderRadius: 999, background: workload.actionRequired ? '#FFF8F8' : '#EEF4FF', padding: '5px 8px', textAlign: 'center' }}>
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

        {visibleWidgetSet.has('myProjects') && (
        <Card {...widgetFrameProps('myProjects', { padding: '16px 16px', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' })}>
          {renderWidgetRemoveButton('myProjects')}
          {renderWidgetResizeHandle('myProjects')}
          {renderPanelHeader('내 프로젝트 리스트', 'myProjects', <Link href="/projects" style={{ fontSize: 12, fontWeight: 900, color: C.primary, textDecoration: 'none' }}>전체 목록</Link>)}

          <div style={{ border: 'none', borderRadius: 6, padding: '4px 6px', marginBottom: 5 }}>
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
                <div style={{ border: `1px solid ${C.g200}`, borderRadius: 6, padding: '8px 10px', background: C.white }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8, flexWrap: 'wrap' }}>
                      <div style={{ color: C.g800, fontSize: 15, fontWeight: 900 }}>{project.constructionName}</div>
                      <span style={{ fontSize: 10, fontWeight: 900, color: STATUS_META[project.status].color, background: STATUS_META[project.status].bg, border: `1px solid ${STATUS_META[project.status].color}`, borderRadius: 999, padding: '2px 7px', lineHeight: '14px', whiteSpace: 'nowrap' }}>
                        {STATUS_META[project.status].label}
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
