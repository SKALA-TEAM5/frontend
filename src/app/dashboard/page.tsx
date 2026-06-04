'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import Card from '../../components/ui/Card';
import { AppFrame } from '../../components/common';
import { logout } from '../../lib/auth-api';
import { useCurrentUser } from '../../lib/dev-user';
import { getOrchestratorDashboard } from '../../lib/agent-api';
import { C } from '../../lib/theme';
import { USAGE_WORKFLOW_STATUS, getProjectManagers, getSheFilterOptionsFromProjects, normalizeUsageWorkflowStatus, type ProjectSummary, type UsageWorkflowStatus } from '../../lib/project-data';
import { listProjects } from '../../lib/project-api';
import { getVisibleProjects, type PeriodMode, type ProjectSortField, type SortDirection } from '../../lib/project-list';
import { ROLE_LABELS } from '../../lib/permissions';

const LOCAL_USAGE_STATEMENT_PREFIX = 'iveri-mvp-usage-statement:';

const DASHBOARD_CHART_COLORS = [
  '#4269D0FF',
  '#EFB118FF',
  '#FF725CFF',
  '#6CC5B0FF',
  '#3CA951FF',
  '#FF8AB7FF',
  '#A463F2FF',
  '#97BBF5FF',
] as const;

const SUPPLEMENT_REASON_TYPES = [
  {
    id: 'purpose',
    label: '집행 목적 부적합',
    keywords: ['목적', '범위', '본사', '관리비', '사용 목적', '인정 범위'],
    color: DASHBOARD_CHART_COLORS[0],
  },
  {
    id: 'allocation',
    label: '법정 계상률 초과',
    keywords: ['계상', '금액', '초과', '안전관리비', '정산', '예산'],
    color: DASHBOARD_CHART_COLORS[1],
  },
  {
    id: 'labor',
    label: '인건비 중복계상',
    keywords: ['인건비', '임금', '급여', '중복', '근로자', '직접 노무'],
    color: DASHBOARD_CHART_COLORS[2],
  },
  {
    id: 'evidence',
    label: '증빙 정합성 미흡',
    keywords: ['증빙', '영수증', '사진', '세금계산서', '자료', '제출', '첨부'],
    color: DASHBOARD_CHART_COLORS[3],
  },
] as const;

const EXAMPLE_SUPPLEMENT_REASON_TRENDS = [
  { key: '2026-03', label: '3월', counts: { purpose: 1, allocation: 0, labor: 1, evidence: 2 } },
  { key: '2026-04', label: '4월', counts: { purpose: 0, allocation: 1, labor: 1, evidence: 3 } },
  { key: '2026-05', label: '5월', counts: { purpose: 1, allocation: 1, labor: 0, evidence: 2 } },
] as const;

const AI_USAGE_COST_ROWS = [
  {
    user: '김서연',
    role: 'SHE 담당자',
    tokens: 684_200,
    calls: 126,
    cost: 48200,
  },
  {
    user: '김현장',
    role: '프로젝트 담당자',
    tokens: 431_600,
    calls: 74,
    cost: 31600,
  },
  {
    user: '박공무',
    role: '프로젝트 담당자',
    tokens: 208_900,
    calls: 39,
    cost: 14800,
  },
  {
    user: '이프로',
    role: '프로젝트 담당자',
    tokens: 124_700,
    calls: 22,
    cost: 8900,
  },
] as const;

const AI_USAGE_COST_COLORS = DASHBOARD_CHART_COLORS;
const AI_TOKEN_COST_KRW = 0.0715;

const estimateAiUsageCost = (tokens: number) =>
  Math.round((tokens * AI_TOKEN_COST_KRW) / 100) * 100;

type AiUsageCostRow = {
  user: string;
  role: string;
  tokens: number;
  calls: number;
  cost: number;
};

const mergeWorkflowStatus = (project: ProjectSummary) => {
  if (typeof window === 'undefined') return project;
  try {
    const raw = window.localStorage.getItem(`${LOCAL_USAGE_STATEMENT_PREFIX}${project.id}`);
    if (!raw) return project;
    const parsed = JSON.parse(raw) as { workflowStatus?: string; actionRequestDetails?: ProjectSummary['actionRequestDetails'] };
    if (!parsed.workflowStatus) return project;
    const workflowStatus = normalizeUsageWorkflowStatus(parsed.workflowStatus);
    if (!workflowStatus) return project;
    return {
      ...project,
      hasActionRequest: workflowStatus === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED,
      actionRequestDetails: workflowStatus === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED ? parsed.actionRequestDetails : undefined,
      reportReady: workflowStatus === USAGE_WORKFLOW_STATUS.REVIEW_COMPLETED || workflowStatus === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED,
    };
  } catch {
    return project;
  }
};

const hasSupplementRequiredMonth = (project: ProjectSummary) => project.hasActionRequest;

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

const readUsageStatementMonths = (projectId: string) => {
  if (typeof window === 'undefined') return [] as string[];
  try {
    const raw = window.localStorage.getItem(`${LOCAL_USAGE_STATEMENT_PREFIX}${projectId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const months = new Set<string>();
    const addMonth = (value: unknown) => {
      if (typeof value !== 'string') return;
      const match = value.match(/^(\d{4}-\d{2})/);
      if (match) months.add(match[1]);
    };
    const collectMonths = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        value.forEach(collectMonths);
        return;
      }
      Object.entries(value as Record<string, unknown>).forEach(([key, childValue]) => {
        if (/^\d{4}-\d{2}/.test(key)) addMonth(key);
        if (['month', 'usageMonth', 'statementMonth'].includes(key)) addMonth(childValue);
        if (childValue && typeof childValue === 'object') collectMonths(childValue);
      });
    };
    collectMonths(parsed);
    return Array.from(months).sort();
  } catch {
    return [];
  }
};

const readUsageWorkflowStatus = (projectId: string): UsageWorkflowStatus | undefined => {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(`${LOCAL_USAGE_STATEMENT_PREFIX}${projectId}`);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { workflowStatus?: string };
    return normalizeUsageWorkflowStatus(parsed.workflowStatus);
  } catch {
    return undefined;
  }
};

const getProjectMonthWorkflowStatus = (project: ProjectSummary): UsageWorkflowStatus | undefined =>
  hasSupplementRequiredMonth(project) ? USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED : readUsageWorkflowStatus(project.id);

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
  fontWeight: 700,
  lineHeight: '20px',
  color: C.g800,
  background: C.white,
};

const compactFieldStyle: CSSProperties = {
  ...fieldStyle,
  height: 30,
  padding: '0 9px',
  borderRadius: 6,
  fontSize: 11,
  lineHeight: '16px',
};

const dashboardPageStyle: CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  padding: '24px clamp(76px, 7vw, 108px) 56px',
  minHeight: 'calc(100vh - 64px)',
  overflow: 'hidden',
  background:
    'radial-gradient(circle at 12% 4%, color-mix(in srgb, var(--c-bg) 78%, transparent) 0, transparent 34%), linear-gradient(135deg, var(--c-soft) 0%, color-mix(in srgb, var(--c-bg) 64%, #fff) 100%)',
};

const dashboardPhotoBackdropStyle: CSSProperties = {
  position: 'relative',
  top: 0,
  left: 0,
  right: 0,
  height: '100%',
  minHeight: 170,
  pointerEvents: 'auto',
  background: 'linear-gradient(180deg, rgba(255,255,255,.02) 0%, color-mix(in srgb, var(--c-soft) 38%, transparent) 46%, color-mix(in srgb, var(--c-soft) 84%, transparent) 82%, var(--c-soft) 100%), linear-gradient(135deg, color-mix(in srgb, var(--c-primary) 46%, transparent) 0%, color-mix(in srgb, var(--c-primary) 22%, transparent) 54%, rgba(255,255,255,.72) 100%), url("https://images.pexels.com/photos/32858871/pexels-photo-32858871.jpeg?auto=compress&cs=tinysrgb&w=1800") center 52% / cover no-repeat',
  zIndex: 1,
  borderRadius: 12,
  overflow: 'hidden',
  border: '1px solid color-mix(in srgb, var(--c-primary) 22%, #fff)',
  backgroundClip: 'padding-box',
  boxShadow: 'var(--ui-shadow-panel)',
};

const dashboardTopStyle: CSSProperties = {
  position: 'relative',
  zIndex: 1,
  minWidth: 0,
  padding: 0,
  margin: '0 auto',
  borderRadius: 0,
  overflow: 'visible',
  background: 'transparent',
  boxShadow: 'none',
  width: 'min(100%, 1240px)',
};

const dashboardContentLayerStyle: CSSProperties = {
  position: 'relative',
  zIndex: 1,
};

const dashboardTopInnerStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 300px',
  gap: 20,
  alignItems: 'stretch',
  width: '100%',
  maxWidth: '100%',
  margin: '0 auto',
  minWidth: 0,
};

const dashboardStatusGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: 16,
  minWidth: 0,
};

const dashboardPanelStyle: CSSProperties = {
  borderRadius: 'var(--ui-radius-card)',
  border: `1px solid ${C.g200}`,
  boxShadow: 'var(--ui-shadow-card)',
  background: C.white,
};

const dashboardAnalysisCardHeight = 258;

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
  borderTopLeftRadius: 12,
  borderTopRightRadius: 12,
  background: 'transparent',
};

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatKoreanDateRangePart = (value: string) => {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${Number(year)} . ${Number(month)} . ${Number(day)} .`;
};

const buildCalendarCells = (monthDate: Date) => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startDate = new Date(year, month, 1 - firstDay.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    return {
      date,
      value: toDateInputValue(date),
      currentMonth: date.getMonth() === month,
    };
  });
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
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [datePickerMonth, setDatePickerMonth] = useState(() => new Date());
  const [manager, setManager] = useState(filterOptions.managers[0] || '전체');
  const [status, setStatus] = useState(filterOptions.statuses[0] || '전체');
  const [sortBy, setSortBy] = useState<ProjectSortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedReasonProjectId, setSelectedReasonProjectId] = useState('');
  const [aiUsagePeriodMode, setAiUsagePeriodMode] = useState<'all' | 'month'>('all');
  const [aiUsageYear, setAiUsageYear] = useState('2026');
  const [aiUsageMonth, setAiUsageMonth] = useState('05');
  const [orchestratorAiUsageRows, setOrchestratorAiUsageRows] = useState<AiUsageCostRow[]>([]);
  const [logoutPending, setLogoutPending] = useState(false);
  const [dashboardRefreshing, setDashboardRefreshing] = useState(false);
  const [chartTooltip, setChartTooltip] = useState<{ x: number; y: number; title: string; body: string } | null>(null);
  const dateRangeRef = useRef<HTMLDivElement | null>(null);

  const showChartTooltip = (event: ReactMouseEvent, title: string, body: string) => {
    setChartTooltip({ x: event.clientX + 14, y: event.clientY + 14, title, body });
  };
  const moveChartTooltip = (event: ReactMouseEvent) => {
    setChartTooltip((tooltip) => tooltip ? { ...tooltip, x: event.clientX + 14, y: event.clientY + 14 } : tooltip);
  };
  const hideChartTooltip = () => setChartTooltip(null);

  useEffect(() => {
    if (user.role === 'project_manager') {
      router.replace('/projects');
    }
  }, [router, user.role]);

  const refreshDashboardProjects = useCallback(async () => {
    setDashboardRefreshing(true);
    try {
      const items = await listProjects({ size: 10 });
      setProjects(items.map(mergeWorkflowStatus));
    } catch {
      setProjects([]);
    } finally {
      setDashboardRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!dateRangeOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (dateRangeRef.current?.contains(event.target as Node)) return;
      setDateRangeOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDateRangeOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [dateRangeOpen]);

  useEffect(() => {
    let alive = true;
    setDashboardRefreshing(true);
    listProjects({ size: 10 })
      .then((items) => {
        if (alive) setProjects(items.map(mergeWorkflowStatus));
      })
      .catch(() => {
        if (alive) setProjects([]);
      })
      .finally(() => {
        if (alive) setDashboardRefreshing(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (projects.length === 0) {
      setOrchestratorAiUsageRows([]);
      return;
    }
    let alive = true;
    Promise.all(projects.map((project) => getOrchestratorDashboard(project.id).catch(() => null)))
      .then((dashboards) => {
        if (!alive) return;
        const agentTotals = dashboards.reduce((map, dashboard) => {
          if (!dashboard) return map;
          dashboard.agents.forEach((agent) => {
            const key = agent.agentTypeCode || 'unknown';
            const current = map.get(key) || { tokens: 0, calls: 0 };
            map.set(key, {
              tokens: current.tokens + agent.token,
              calls: current.calls + 1,
            });
          });
          return map;
        }, new Map<string, { tokens: number; calls: number }>());
        setOrchestratorAiUsageRows(Array.from(agentTotals.entries())
          .filter(([, value]) => value.tokens > 0 || value.calls > 0)
          .sort((a, b) => b[1].tokens - a[1].tokens || a[0].localeCompare(b[0]))
          .map(([agentTypeCode, value]) => ({
            user: agentTypeCode,
            role: 'AI Agent',
            tokens: value.tokens,
            calls: value.calls,
            cost: estimateAiUsageCost(value.tokens),
          })));
      });
    return () => {
      alive = false;
    };
  }, [projects]);

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
  const [rangeStart = '', rangeEnd = ''] = period.split('~');
  const dateRangeLabel = rangeStart && rangeEnd
    ? `${formatKoreanDateRangePart(rangeStart)} - ${formatKoreanDateRangePart(rangeEnd)}`
    : rangeStart
      ? `${formatKoreanDateRangePart(rangeStart)} -`
      : '기간 선택';
  const calendarCells = buildCalendarCells(datePickerMonth);
  const selectDateRangeDay = (value: string) => {
    if (!rangeStart || rangeEnd || new Date(value).getTime() < new Date(rangeStart).getTime()) {
      setPeriod(`${value}~`);
      setPeriodMode('custom');
      return;
    }
    setPeriod(`${rangeStart}~${value}`);
    setPeriodMode('custom');
  };
  const moveDatePickerMonth = (amount: number) => {
    setDatePickerMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  };

  const workflowProjects = {
    [USAGE_WORKFLOW_STATUS.DRAFT]: projects.filter((project) => getProjectMonthWorkflowStatus(project) === USAGE_WORKFLOW_STATUS.DRAFT),
    [USAGE_WORKFLOW_STATUS.UPLOAD_COMPLETED]: projects.filter((project) => getProjectMonthWorkflowStatus(project) === USAGE_WORKFLOW_STATUS.UPLOAD_COMPLETED),
    [USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED]: projects.filter((project) => getProjectMonthWorkflowStatus(project) === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED),
    [USAGE_WORKFLOW_STATUS.REVIEW_COMPLETED]: projects.filter((project) => getProjectMonthWorkflowStatus(project) === USAGE_WORKFLOW_STATUS.REVIEW_COMPLETED),
  };
  const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const currentMonthUsageStatementCount = projects.filter((project) => readUsageStatementMonth(project.id) === currentMonthKey).length;
  const validityValidationTargetCount = projects.filter((project) => {
    const workflow = getProjectMonthWorkflowStatus(project);
    return workflow && workflow !== USAGE_WORKFLOW_STATUS.DRAFT;
  }).length;
  const validityValidationDoneCount = projects.filter((project) => {
    const workflow = getProjectMonthWorkflowStatus(project);
    return workflow === USAGE_WORKFLOW_STATUS.REVIEW_COMPLETED || workflow === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED;
  }).length;
  const approvalCompletedCount = projects.filter((project) => getProjectMonthWorkflowStatus(project) === USAGE_WORKFLOW_STATUS.REVIEW_COMPLETED).length;
  const supplementRequestCount = workflowProjects[USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED].length;
  const statusSummaryCards = [
    {
      eyebrow: `${currentMonthKey.replace('-', '년 ')}월`,
      title: '사용내역서 업로드',
      icon: '◌',
      color: '#255B73',
      border: '#C9DFEA',
      soft: '#F6FBFD',
      metrics: [
        { label: '업로드됨', value: currentMonthUsageStatementCount, color: '#255B73', border: '#C9DFEA', bg: '#F6FBFD' },
        { label: '전체', value: projects.length, color: C.g800, border: '#CDE8D8', bg: C.white },
      ],
    },
    {
      eyebrow: '법령 검토',
      title: '법령 검증',
      icon: '✓',
      color: '#2F73B7',
      border: '#C6D9EE',
      soft: '#F5F9FF',
      metrics: [
        { label: '완료', value: validityValidationDoneCount, color: '#2F73B7', border: '#C6D9EE', bg: '#F5F9FF' },
        { label: '대상', value: validityValidationTargetCount, color: C.g800, border: '#CDE8D8', bg: C.white },
      ],
    },
    {
      eyebrow: '증빙 보완',
      title: '보완 요청',
      icon: '!',
      color: '#D9485F',
      border: '#F0CDD4',
      soft: '#FFF8F9',
      metrics: [
        { label: '요청', value: supplementRequestCount, color: '#D9485F', border: '#F0CDD4', bg: '#FFF8F9', full: true },
      ],
    },
    {
      eyebrow: '최종 상태',
      title: '승인 완료',
      icon: '◎',
      color: C.primary,
      border: C.g200,
      soft: C.bg,
      metrics: [
        { label: '승인', value: approvalCompletedCount, color: C.primary, border: C.g200, bg: C.bg },
        { label: '전체', value: projects.length, color: C.g800, border: '#CDE8D8', bg: C.white },
      ],
    },
  ] as const;
  const queueProjects = projects
    .filter((project) => {
      const workflow = getProjectMonthWorkflowStatus(project);
      return workflow === USAGE_WORKFLOW_STATUS.UPLOAD_COMPLETED || workflow === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED;
    })
    .map((project) => ({
      workflow: getProjectMonthWorkflowStatus(project),
      id: `project-${project.id}`,
      projectId: project.id,
      projectName: project.constructionName,
      title: getProjectMonthWorkflowStatus(project) === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED
        ? (project.actionRequestDetails?.title || '보완 요청 확인 필요')
        : '업로드 완료 검토 필요',
      message:
        getProjectMonthWorkflowStatus(project) === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED
          ? (project.actionRequestDetails?.reason || '프로젝트 담당자가 사용내역서 또는 증빙 자료를 수정해야 합니다.')
          : '프로젝트 담당자가 업로드를 완료했습니다. SHE 담당자의 법령 검증이 필요합니다.',
      assignee: project.manager || '프로젝트 담당자',
      createdAt: getProjectMonthWorkflowStatus(project) === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED ? (project.actionRequestDetails?.requestedAt || '-') : '-',
      status: getProjectMonthWorkflowStatus(project) || USAGE_WORKFLOW_STATUS.DRAFT,
    }))
    .slice(0, 6);
  const aiUsageRows: readonly AiUsageCostRow[] = orchestratorAiUsageRows.length > 0 ? orchestratorAiUsageRows : AI_USAGE_COST_ROWS;
  const aiUsageTotalCost = aiUsageRows.reduce((sum, row) => sum + row.cost, 0);
  const aiUsageTotalTokens = aiUsageRows.reduce((sum, row) => sum + row.tokens, 0);
  const aiUsageTotalCalls = aiUsageRows.reduce((sum, row) => sum + row.calls, 0);
  const aiUsageDonutRadius =42;
  const aiUsageDonutCircumference = 2 * Math.PI * aiUsageDonutRadius;
  let aiUsageDonutOffset = 0;
  const aiUsageDonutSegments = aiUsageRows.map((row, index) => {
    const dash = aiUsageTotalCost > 0 ? (row.cost / aiUsageTotalCost) * aiUsageDonutCircumference : 0;
    const segment = {
      key: row.user,
      row,
      color: AI_USAGE_COST_COLORS[index % AI_USAGE_COST_COLORS.length],
      dash,
      offset: aiUsageDonutOffset,
    };
    aiUsageDonutOffset += dash;
    return segment;
  });
  const selectedReasonProject = projects.find((project) => project.id === selectedReasonProjectId) || projects[0];
  const reasonProjectId = selectedReasonProject?.id || '';
  const projectTableHeaders: Array<{ label: string; field: ProjectSortField; width: number }> = [
    { label: '프로젝트명', field: 'name', width: 120 },
    { label: '프로젝트 번호', field: 'contractNumber', width: 70 },
    { label: '공정률', field: 'progress', width: 140 },
    { label: '안전관리비 사용률', field: 'usageRate', width: 140 },
    { label: '공사 기간', field: 'startDate', width: 120 },
    { label: '담당자', field: 'manager', width: 50 },
  ];
  const toggleProjectTableSort = (field: ProjectSortField) => {
    if (sortBy === field) {
      setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortBy(field);
    setSortDirection('asc');
  };
  const selectedReasonProjectMonths = selectedReasonProject ? readUsageStatementMonths(selectedReasonProject.id) : [];
  const selectedReasonProjectMonth = selectedReasonProject?.actionRequestDetails?.month || selectedReasonProjectMonths.at(-1) || '';
  const selectedReasonSourceText = `${selectedReasonProject?.actionRequestDetails?.title || ''} ${selectedReasonProject?.actionRequestDetails?.reason || ''}`.toLowerCase();
  const reasonTrendMonthKeys = Array.from(new Set([
    ...selectedReasonProjectMonths,
    ...(selectedReasonProjectMonth ? [selectedReasonProjectMonth] : []),
  ])).sort();
  const reasonTrendRows = reasonTrendMonthKeys.map((monthKey) => {
    const activeMonth = monthKey === selectedReasonProjectMonth;
    const reasons = SUPPLEMENT_REASON_TYPES.map((reasonType) => {
      const projectCount = activeMonth && Boolean(selectedReasonProject) && getProjectMonthWorkflowStatus(selectedReasonProject) === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED
        ? getSupplementReasonMatchIds(selectedReasonSourceText).filter((id) => id === reasonType.id).length
        : 0;
      return { ...reasonType, count: projectCount };
    });
    return {
      key: monthKey,
      label: `${Number(monthKey.slice(5, 7))}월`,
      reasons,
      total: reasons.reduce((sum, reason) => sum + reason.count, 0),
    };
  });
  const hasReasonTrendData = reasonTrendRows.some((row) => row.total > 0);
  const displayedReasonTrendRows = hasReasonTrendData
    ? reasonTrendRows
    : EXAMPLE_SUPPLEMENT_REASON_TRENDS.map((row) => {
      const reasons = SUPPLEMENT_REASON_TYPES.map((reasonType) => ({
        ...reasonType,
        count: row.counts[reasonType.id],
      }));
      return {
        key: row.key,
        label: row.label,
        reasons,
        total: reasons.reduce((sum, reason) => sum + reason.count, 0),
      };
    });
  const maxReasonTrendValue = Math.max(1, ...displayedReasonTrendRows.flatMap((row) => [row.total, ...row.reasons.map((reason) => reason.count)]));
  const reasonTrendAxisMax = Math.max(2, maxReasonTrendValue);
  const reasonTrendAxisTicks = Array.from(new Set([reasonTrendAxisMax, Math.ceil(reasonTrendAxisMax / 2), 0]));
  const managerWorkloads = Array.from(
    projects.reduce((map, project) => {
      const projectManagers = project.participants.length > 0 ? project.participants : getProjectManagers(project);
      const managers = projectManagers.length > 0 ? projectManagers : ['미지정'];
      const actionAssignees = getProjectMonthWorkflowStatus(project) === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED
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
  if (user.role === 'project_manager') {
    return (
      <AppFrame title="프로젝트 대시보드" mainClassName="dashboard-main">
        <Card style={{ padding: 28, color: C.danger, fontSize: 14, fontWeight: 700 }}>접근 권한이 없습니다.</Card>
      </AppFrame>
    );
  }

  return (
    <AppFrame title="프로젝트 대시보드" mainClassName="dashboard-main">
      <div style={dashboardPageStyle}>
      <section style={dashboardTopStyle}>
        <div style={dashboardTopInnerStyle}>
          <div style={{ display: 'grid', minWidth: 0 }}>
            <section style={dashboardPhotoBackdropStyle}>
              <div style={{ position: 'absolute', inset: -1, borderRadius: 'inherit', background: 'linear-gradient(90deg, rgba(10,28,22,.48) 0%, rgba(10,28,22,.28) 48%, rgba(10,28,22,.08) 100%)' }} />
              <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'stretch', gap: 24, padding: '24px 28px' }}>
                <div style={{ minWidth: 0, alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 18 }}>
                  <img src="/uploads/character.png" alt="" aria-hidden="true" style={{ width: 108, height: 108, objectFit: 'contain', flex: '0 0 auto', filter: 'drop-shadow(0 10px 22px rgba(0,0,0,.30))' }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 24, lineHeight: 1.35, fontWeight: 700, color: C.white, letterSpacing: 0 }}>
                      i-veri가 안전한 현장 운영을 지원합니다.
                    </div>
                    <div style={{ marginTop: 12, color: 'rgba(255,255,255,.86)', fontSize: 13, fontWeight: 700 }}>
                      프로젝트 검증 현황과 보완 요청을 한 화면에서 확인하고 관리하세요.
                    </div>
                  </div>
                </div>
                <div style={{ minWidth: 220, color: C.white, textAlign: 'right', alignSelf: 'end', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.72)' }}>마지막 업데이트</div>
                    <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>2026. 5. 15. 15:20</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                    <button type="button" aria-label="대시보드 새로고침" onClick={() => void refreshDashboardProjects()} disabled={dashboardRefreshing} style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid rgba(255,255,255,.42)', background: 'rgba(255,255,255,.08)', color: C.white, cursor: dashboardRefreshing ? 'wait' : 'pointer', fontSize: 17, fontWeight: 700, flex: '0 0 auto', opacity: dashboardRefreshing ? .75 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className={dashboardRefreshing ? 'dashboard-refresh-icon--spinning' : undefined} aria-hidden="true">↻</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        <aside style={{ alignSelf: 'start', position: 'relative', border: `1px solid ${C.g200}`, borderRadius: 'var(--ui-radius-card)', background: C.white, padding: 14, boxShadow: 'var(--ui-shadow-card)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: 10, minWidth: 0 }}>
          <button type="button" onClick={handleDashboardLogout} disabled={logoutPending} style={{ position: 'absolute', top: 13, right: 13, height: 24, border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.g600, padding: '0 9px', fontFamily: 'inherit', fontSize: 10, fontWeight: 700, cursor: logoutPending ? 'not-allowed' : 'pointer', opacity: logoutPending ? .55 : 1 }}>
            {logoutPending ? '로그아웃 중' : '로그아웃'}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, paddingRight: 70 }}>
            <div style={{ width: 48, height: 48, borderRadius: 999, background: '#F4C20D', color: C.white, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4.5 20a7.5 7.5 0 0 1 15 0" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
	            <div style={{ minWidth: 0, flex: 1 }}>
		              <div style={{ fontSize: 15, fontWeight: 700, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name || '사용자'}</div>
		              <div style={{ marginTop: 3, fontSize: 11, fontWeight: 700, color: C.g600 }}>{ROLE_LABELS[user.role]}</div>
	            </div>
	          </div>
	          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
		            <div style={{ border: `1px solid ${C.g200}`, borderRadius: 8, padding: '8px 10px', minWidth: 0 }}>
	              <div style={{ fontSize: 10, fontWeight: 700, color: C.g400 }}>전체 프로젝트</div>
		              <div style={{ marginTop: 5, fontSize: 19, lineHeight: 1, fontWeight: 700, color: C.g800 }}>{projects.length}</div>
	            </div>
            <div style={{ border: `1px solid ${C.g200}`, borderRadius: 8, padding: '8px 10px', minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.g400 }}>확인 필요</div>
		              <div style={{ marginTop: 5, fontSize: 19, lineHeight: 1, fontWeight: 700, color: C.primary }}>{queueProjects.length}</div>
	            </div>
	          </div>
	          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
		            <button
		              type="button"
		              onClick={() => router.push('/admin/users')}
			              style={{ height: 28, border: `1px solid ${C.g200}`, borderRadius: 6, background: '#FAFBFA', color: C.g600, fontFamily: 'inherit', fontSize: 10, fontWeight: 700, cursor: 'pointer', opacity: .9 }}
		            >
		              담당자 관리
		            </button>
	          </div>
	        </aside>
        </div>
      </section>

      <div style={{ ...dashboardContentLayerStyle, width: 'min(100%, 1240px)', margin: '0 auto' }}>
        <div style={dashboardStatusGridStyle}>
          {statusSummaryCards.map((item) => (
            <div key={item.title} style={{ border: `1px solid ${item.border}`, borderRadius: 'var(--ui-radius-card)', background: C.white, padding: '14px 16px', minWidth: 0, minHeight: 116, boxShadow: 'var(--ui-shadow-card)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, minWidth: 0 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: item.color, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.eyebrow}</div>
                  <div style={{ marginTop: 6, fontSize: 17, fontWeight: 700, color: C.g800, lineHeight: 1.25, wordBreak: 'keep-all' }}>{item.title}</div>
                </div>
                <div aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 9, border: `1px solid ${item.border}`, background: item.soft, color: item.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                  {item.icon}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: item.metrics.length === 1 ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 14 }}>
                {item.metrics.map((metric) => (
                  <div key={metric.label} style={{ border: `1px solid ${metric.border}`, borderRadius: 9, background: metric.bg, padding: '9px 10px', minWidth: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: metric.color, lineHeight: 1 }}>{metric.label}</div>
                    <div style={{ marginTop: 5, fontSize: 21, fontWeight: 700, color: metric.color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{metric.value}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...dashboardContentLayerStyle, width: 'min(100%, 1240px)', margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          <Card style={{ ...dashboardPanelStyle, padding: '14px 16px', overflow: 'visible' }}>
            <div style={{ ...dashboardPanelHeaderStyle, marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.g800 }}>프로젝트 현황</div>
              <Link href="/projects" style={{ fontSize: 12, fontWeight: 700, color: C.primary, textDecoration: 'none' }}>전체 프로젝트 보기 〉</Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(138px, 1.1fr) minmax(100px, .8fr) minmax(92px, .66fr) minmax(92px, .66fr) minmax(118px, .72fr)', gap: 8, marginBottom: 12 }}>
              <input aria-label="프로젝트명" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="프로젝트 검색" style={compactFieldStyle} />
              <input aria-label="계약번호" value={contractNumber} onChange={(event) => setContractNumber(event.target.value)} placeholder="계약번호" style={compactFieldStyle} />
              <select aria-label="담당자" value={manager} onChange={(event) => setManager(event.target.value)} style={compactFieldStyle}>
                {filterOptions.managers.map((item) => <option key={item} value={item}>{item === filterOptions.managers[0] ? '담당자' : item}</option>)}
              </select>
              <select aria-label="상태" value={status} onChange={(event) => setStatus(event.target.value)} style={compactFieldStyle}>
                {filterOptions.statuses.map((item) => <option key={item} value={item}>{item === filterOptions.statuses[0] ? '상태' : item}</option>)}
              </select>
              <div ref={dateRangeRef} style={{ position: 'relative', minWidth: 0 }}>
                <button
                  type="button"
                  aria-label="기간 설정"
                  onClick={() => {
                    setDateRangeOpen((open) => !open);
                    if (rangeStart) setDatePickerMonth(new Date(`${rangeStart}T00:00:00`));
                  }}
                  style={{ ...compactFieldStyle, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: 'pointer', textAlign: 'left', color: rangeStart ? C.g800 : C.g400 }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dateRangeLabel}</span>
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.g600} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                </button>
                {dateRangeOpen && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 120, width: 252, borderRadius: 14, border: `1px solid ${C.g100}`, background: C.white, boxShadow: '0 18px 38px rgba(31,47,39,.14)', padding: 10 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ border: `1px solid ${C.g100}`, borderRadius: 10, padding: '7px 9px', color: C.g800, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dateRangeLabel}</div>
                      <button type="button" onClick={() => { setPeriod(''); setPeriodMode('all'); setDateRangeOpen(false); }} style={{ height: 28, border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.g600, padding: '0 8px', fontFamily: 'inherit', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>초기화</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 10 }}>
                      <input aria-label="시작일" type="date" value={rangeStart} onChange={(event) => { setPeriodMode('custom'); setPeriod(`${event.target.value}~${rangeEnd}`); if (event.target.value) setDatePickerMonth(new Date(`${event.target.value}T00:00:00`)); }} style={{ ...compactFieldStyle, height: 30, fontSize: 10 }} />
                      <input aria-label="종료일" type="date" value={rangeEnd} onChange={(event) => { setPeriodMode('custom'); setPeriod(`${rangeStart}~${event.target.value}`); if (event.target.value) setDatePickerMonth(new Date(`${event.target.value}T00:00:00`)); }} style={{ ...compactFieldStyle, height: 30, fontSize: 10 }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <button type="button" onClick={() => moveDatePickerMonth(-1)} aria-label="이전 달" style={{ width: 24, height: 24, border: 'none', borderRadius: 999, background: 'transparent', color: '#1683F2', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>‹</button>
                      <div style={{ fontSize: 15, fontWeight: 700, color: C.g800 }}>{datePickerMonth.getFullYear()}년 {datePickerMonth.getMonth() + 1}월</div>
                      <button type="button" onClick={() => moveDatePickerMonth(1)} aria-label="다음 달" style={{ width: 24, height: 24, border: 'none', borderRadius: 999, background: 'transparent', color: '#1683F2', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>›</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 4 }}>
                      {['일', '월', '화', '수', '목', '금', '토'].map((day) => <div key={day} style={{ height: 20, display: 'grid', placeItems: 'center', color: C.g400, fontSize: 10, fontWeight: 700 }}>{day}</div>)}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
                      {calendarCells.map((cell) => {
                        const startTime = rangeStart ? new Date(`${rangeStart}T00:00:00`).getTime() : 0;
                        const endTime = rangeEnd ? new Date(`${rangeEnd}T00:00:00`).getTime() : 0;
                        const cellTime = cell.date.getTime();
                        const selectedStart = cell.value === rangeStart;
                        const selectedEnd = cell.value === rangeEnd;
                        const inRange = startTime && endTime && cellTime >= startTime && cellTime <= endTime;
                        return (
                          <button
                            key={cell.value}
                            type="button"
                            onClick={() => selectDateRangeDay(cell.value)}
                            style={{ height: 27, border: 'none', borderRadius: selectedStart || selectedEnd ? 999 : 8, background: selectedStart || selectedEnd ? '#1683F2' : inRange ? '#DCEBFF' : 'transparent', color: selectedStart || selectedEnd ? C.white : cell.currentMonth ? C.g800 : '#9AA19D', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: selectedStart || selectedEnd ? 900 : 800 }}
                          >
                            {cell.date.getDate()}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div style={{ overflow: 'auto', maxHeight: 278, minHeight: 0, border: `1px solid ${C.g100}`, borderRadius: 8 }}>
              <table style={{ minWidth: 720, tableLayout: 'fixed', borderCollapse: 'collapse' }}>
              <colgroup>
                {projectTableHeaders.map((header) => (
                  <col key={header.field} style={{ width: header.width }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {projectTableHeaders.map((header) => {
                    const active = sortBy === header.field;
                    return (
                      <th key={header.label} style={{ position: 'sticky', top: 0, zIndex: 1, width: header.width, height: 40, padding: 0, borderBottom: `1px solid ${C.g200}`, background: 'color-mix(in srgb, var(--c-bg) 28%, #F8F9F8)', color: C.g600, fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', textAlign: 'left' }}>
                        <button
                          type="button"
                          onClick={() => toggleProjectTableSort(header.field)}
                          aria-sort={active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                          style={{ width: '100%', height: 40, border: 'none', background: 'transparent', color: active ? C.primary : C.g600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-start', gap: 5, padding: header.field === 'startDate' ? '0 8px' : '0 12px', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap' }}
                        >
                          <span>{header.label}</span>
                          <span aria-hidden="true" style={{ opacity: active ? 1 : .25, fontSize: 10, lineHeight: 1 }}>{active ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}</span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {visibleProjects.map((project) => {
                  const progress = Math.min(100, Math.max(0, Number.parseInt(project.progressRate, 10) || 0));
                  const safetyBudgetUsage = 0.1;
                  const workflow = getProjectMonthWorkflowStatus(project);
                  const hasSupplementDot = workflow === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED;
                  return (
                    <tr key={project.id} onClick={() => router.push(`/projects/${project.id}`)} style={{ cursor: 'pointer' }}>
                      <td style={{ padding: '12px 14px', borderTop: `1px solid ${C.g100}`, color: C.g800, fontSize: 13, fontWeight: 700 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          {hasSupplementDot && <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: C.danger, boxShadow: '0 0 0 3px rgba(194,65,63,.12)', flexShrink: 0 }} />}
                          <span style={{ whiteSpace: 'nowrap' }}>{project.constructionName}</span>
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', borderTop: `1px solid ${C.g100}`, color: C.g600, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>{project.contractNumber}</td>
                      <td style={{ padding: '12px 14px', borderTop: `1px solid ${C.g100}`, minWidth: 150 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 34px', gap: 8, alignItems: 'center' }}>
                          <div style={{ height: 8, background: C.g100, borderRadius: 999, overflow: 'hidden' }}>
                            <div style={{ width: `${progress}%`, height: '100%', background: progress >= 70 ? C.primary : progress >= 30 ? '#2F73B7' : '#C9545E' }} />
                          </div>
                          <span style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: C.g800 }}>{progress}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', borderTop: `1px solid ${C.g100}`, minWidth: 150 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 42px', gap: 8, alignItems: 'center' }}>
                          <div style={{ height: 8, background: C.g100, borderRadius: 999, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.max(2, Math.min(100, safetyBudgetUsage))}%`, height: '100%', background: safetyBudgetUsage >= 80 ? '#C9545E' : safetyBudgetUsage >= 50 ? '#F0A22E' : C.primary }} />
                          </div>
                          <span style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: C.g800 }}>{safetyBudgetUsage}%</span>
                        </div>
                      </td>
                      <td title={project.period || '-'} style={{ width: 94, maxWidth: 94, padding: '12px 8px', borderTop: `1px solid ${C.g100}`, color: C.g600, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{project.period || '-'}</td>
                      <td title={project.manager} style={{ width: 76, maxWidth: 76, padding: '12px 12px', borderTop: `1px solid ${C.g100}`, color: C.g800, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{project.manager}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12, color: C.g600, fontSize: 12, fontWeight: 700 }}>
              <span>전체 {projects.length}건</span>
            </div>
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.0fr) minmax(0, 1.2fr) minmax(0, .70fr)', gap: 16 }}>
            <Card style={{ ...dashboardPanelStyle, padding: '14px 16px 16px', height: dashboardAnalysisCardHeight, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ ...dashboardPanelHeaderStyle, marginBottom: 20 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.g800 }}>월별 보완 요청 사유</div>
                </div>
                <select
                  aria-label="프로젝트"
                  value={selectedReasonProjectId || reasonProjectId}
                  onChange={(event) => setSelectedReasonProjectId(event.target.value)}
                  style={{ width: 190, height: 30, border: `1px solid ${C.g200}`, borderRadius: 6, background: C.white, color: C.g800, fontSize: 12, fontWeight: 700, padding: '0 10px' }}
                >
                  {projects.length === 0 && <option value="">프로젝트 없음</option>}
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.constructionName}</option>
                  ))}
                </select>
              </div>
              <div style={{ height: 142, display: 'grid', gridTemplateColumns: '16px minmax(0,1fr)', gap: 3, alignItems: 'stretch', padding: '4px 0 0' }}>
                <div style={{ position: 'relative', height: 122, borderBottom: `1px solid ${C.g100}` }}>
                  {reasonTrendAxisTicks.map((tick) => (
                    <span
                      key={tick}
                      style={{
                        position: 'absolute',
                        right: 2,
                        top: `${100 - (tick / reasonTrendAxisMax) * 100}%`,
                        transform: 'translateY(-50%)',
                        fontSize: 9,
                        fontWeight: 700,
                        color: C.g400,
                      }}
                    >
                      {tick}
                    </span>
                  ))}
                </div>
                <div style={{ overflowX: 'auto', overflowY: 'hidden', borderBottom: `1px solid ${C.g100}`, scrollbarWidth: 'thin' }}>
                <div style={{ minWidth: displayedReasonTrendRows.length ? Math.max(displayedReasonTrendRows.length * 84, 220) : 220, height: '100%', display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, displayedReasonTrendRows.length)}, 84px)`, gap: 0, alignItems: 'stretch' }}>
                  {displayedReasonTrendRows.length === 0 ? (
                    <div style={{ gridColumn: '1 / -1', minHeight: 102, display: 'grid', placeItems: 'center', color: C.g400, fontSize: 12, fontWeight: 700 }}>
                      표시할 보완 요청 사유가 없습니다.
                    </div>
                  ) : displayedReasonTrendRows.map((row, rowIndex) => (
                    <div key={row.key} style={{ position: 'relative', display: 'grid', gridTemplateRows: '1fr 16px', gap: 3, height: '100%', padding: '0 5px' }}>
                      {rowIndex > 0 && <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 2, bottom: 20, width: 1, background: C.g100, transform: 'translateX(-.5px)' }} />}
                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${SUPPLEMENT_REASON_TYPES.length}, minmax(0, 1fr))`, gap: 1, alignItems: 'end', justifyItems: 'center', alignSelf: 'end', height: 106 }}>
                        {row.reasons.map((reason) => (
                          <span
                            key={reason.id}
                            onMouseEnter={(event) => showChartTooltip(event, `${row.label} ${reason.label}`, `${reason.count}건`)}
                            onMouseMove={moveChartTooltip}
                            onMouseLeave={hideChartTooltip}
                            style={{
                              width: 14,
                              height: reason.count > 0 ? `${Math.max(7, (reason.count / reasonTrendAxisMax) * 102)}px` : 0,
                              background: reason.color,
                              borderRadius: '4px 4px 0 0',
                              cursor: 'default',
                            }}
                          />
                        ))}
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.g400, textAlign: 'center' }}>{row.label}</div>
                    </div>
                  ))}
                </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 14, fontSize: 10, fontWeight: 700, color: C.g600 }}>
                {SUPPLEMENT_REASON_TYPES.map((reason) => (
                  <span key={reason.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: reason.color }} />
                    {reason.label}
                  </span>
                ))}
              </div>
            </Card>

            <Card style={{ ...dashboardPanelStyle, padding: '14px 16px', height: dashboardAnalysisCardHeight, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ ...dashboardPanelHeaderStyle, marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.g800 }}>AI 사용 금액</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <div role="group" aria-label="AI 사용 금액 기간" style={{ display: 'inline-flex', alignItems: 'center', height: 30, padding: 2, border: `1px solid ${C.g200}`, borderRadius: 999, background: '#F7F8F7', flexShrink: 0 }}>
                    {[
                      { key: 'all' as const, label: '전체' },
                      { key: 'month' as const, label: '월 선택' },
                    ].map((option) => {
                      const active = aiUsagePeriodMode === option.key;
                      return (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => setAiUsagePeriodMode(option.key)}
                          style={{ height: 24, border: 'none', borderRadius: 999, background: active ? C.white : 'transparent', color: active ? C.primary : C.g600, padding: '0 9px', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, cursor: 'pointer', boxShadow: active ? '0 1px 4px rgba(31,55,43,.08)' : 'none' }}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  {aiUsagePeriodMode === 'month' && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <select aria-label="AI 사용 금액 연도" value={aiUsageYear} onChange={(event) => setAiUsageYear(event.target.value)} style={{ width: 68, height: 30, border: `1px solid ${C.g200}`, borderRadius: 6, background: C.white, color: C.g800, fontSize: 11, fontWeight: 700, padding: '0 6px' }}>
                        <option value="2026">2026</option>
                        <option value="2025">2025</option>
                      </select>
                      <select aria-label="AI 사용 금액 월" value={aiUsageMonth} onChange={(event) => setAiUsageMonth(event.target.value)} style={{ width: 54, height: 30, border: `1px solid ${C.g200}`, borderRadius: 6, background: C.white, color: C.g800, fontSize: 11, fontWeight: 700, padding: '0 6px' }}>
                        {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).map((month) => (
                          <option key={month} value={month}>{Number(month)}월</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(170px, .9fr) minmax(0, 1.1fr)', gap: 12, flex: '1 1 auto', minHeight: 0 }}>
                <div style={{ border: `1px solid ${C.g100}`, borderRadius: 10, padding: '12px 14px', background: 'color-mix(in srgb, var(--c-bg) 34%, #fff)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 0 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.g600 }}>전체 사용 금액</div>
                    <div style={{ display: 'grid', placeItems: 'center', marginTop: 6 }}>
                      <div style={{ position: 'relative', width: 112, height: 112 }}>
                        <svg width="112" height="112" viewBox="0 0 112 112" aria-hidden="true" style={{ display: 'block', transform: 'rotate(-90deg)' }}>
                          <circle cx="56" cy="56" r={aiUsageDonutRadius} fill="none" stroke="color-mix(in srgb, var(--c-line) 76%, transparent)" strokeWidth="14" />
                          {aiUsageDonutSegments.map((segment) => (
                            <circle
                              key={segment.key}
                              cx="56"
                              cy="56"
                              r={aiUsageDonutRadius}
                              fill="none"
                              stroke={segment.color}
                              strokeWidth="14"
                              strokeLinecap="butt"
                              strokeDasharray={`${segment.dash} ${aiUsageDonutCircumference}`}
                              strokeDashoffset={-segment.offset}
                              onMouseEnter={(event) => showChartTooltip(event, `${segment.row.user} · ${segment.row.role}`, `₩ ${segment.row.cost.toLocaleString('ko-KR')} · ${segment.row.calls}회`)}
                              onMouseMove={moveChartTooltip}
                              onMouseLeave={hideChartTooltip}
                              style={{ cursor: 'default' }}
                            />
                          ))}
                        </svg>
                        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', pointerEvents: 'none' }}>
                          <div>
                            <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2, fontSize: 12, fontWeight: 800, color: C.g800, lineHeight: 1 }}>
                              <span>₩</span>
                              <span>{aiUsageTotalCost.toLocaleString('ko-KR')}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 }}>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: C.g400 }}>평균 비용</div>
                      <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2, marginTop: 2, fontSize: 12, fontWeight: 700, color: C.g800 }}>
                        <span>₩</span>
                        <span>{Math.round(aiUsageTotalCost / Math.max(aiUsageTotalCalls, 1)).toLocaleString('ko-KR')}</span>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: C.g400 }}>호출 수</div>
                      <div style={{ marginTop: 2, fontSize: 12, fontWeight: 700, color: C.g800 }}>{aiUsageTotalCalls.toLocaleString('ko-KR')}회</div>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 0, minHeight: 0, overflowY: 'auto', paddingRight: 5, scrollbarGutter: 'stable' }}>
                  {aiUsageRows.map((row) => (
                    <div key={row.user} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 10, alignItems: 'center', borderTop: `1px solid ${C.g100}`, padding: '10px 10px' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.user}</span>
                          <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: C.g500 }}>{row.role}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginTop: 3, fontSize: 10, fontWeight: 700, color: C.g400 }}>
                          <span>평균</span>
                          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                            <span>₩</span>
                            <span>{Math.round(row.cost / Math.max(row.calls, 1)).toLocaleString('ko-KR')}</span>
                          </span>
                          <span>· {row.calls}회</span>
                        </div>
                      </div>
                      <div style={{ display: 'inline-flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 2, fontSize: 14, fontWeight: 700, color: C.g800, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span>₩</span>
                        <span>{row.cost.toLocaleString('ko-KR')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card style={{ ...dashboardPanelStyle, padding: '14px 16px', height: dashboardAnalysisCardHeight, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ ...dashboardPanelHeaderStyle, marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.g800 }}>담당자별 프로젝트 현황</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.primary }}>{currentMonthKey.replace('-', '년 ')}월</div>
            </div>
            <div style={{ display: 'grid', gap: 10, flex: '1 1 auto', minHeight: 0, overflowY: 'auto', paddingRight: 6, scrollbarGutter: 'stable', overscrollBehavior: 'contain' }}>
              {managerWorkloads.length === 0 && (
                <div style={{ minHeight: 128, display: 'grid', placeItems: 'center', borderTop: `1px solid ${C.g100}`, color: C.g400, fontSize: 12, fontWeight: 700 }}>
                  표시할 담당자 현황이 없습니다.
                </div>
              )}
              {managerWorkloads.map(([managerName, workload]) => (
                <div key={managerName} style={{ display: 'grid', gridTemplateColumns: '34px minmax(0,1fr) auto', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: `1px solid ${C.g100}` }}>
                  <div style={{ width: 34, height: 34, borderRadius: 999, background: C.primary, color: C.white, display: 'grid', placeItems: 'center' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{managerName}</div>
                    <div style={{ marginTop: 3, fontSize: 10, fontWeight: 700, color: C.g400 }}>완료 {Math.max(0, workload.projectCount - workload.actionRequired)}건 · 진행 {workload.actionRequired}건</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.g800 }}>{workload.projectCount + workload.actionRequired}건</div>
                </div>
              ))}
            </div>
          </Card>
          </div>
        </div>
      </div>
      </div>
      {chartTooltip && (
        <div
          style={{
            position: 'fixed',
            left: chartTooltip.x,
            top: chartTooltip.y,
            zIndex: 1200,
            pointerEvents: 'none',
            maxWidth: 220,
            padding: '9px 11px',
            borderRadius: 8,
            border: `1px solid ${C.g200}`,
            background: 'rgba(255,255,255,.96)',
            boxShadow: '0 12px 28px rgba(31,47,39,.16)',
            color: C.g800,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 800, lineHeight: 1.35 }}>{chartTooltip.title}</div>
          <div style={{ marginTop: 3, fontSize: 10, fontWeight: 700, color: C.g500, lineHeight: 1.35 }}>{chartTooltip.body}</div>
        </div>
      )}
    </AppFrame>
  );
}
