'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import Card from '../../components/ui/Card';
import { AppFrame, DateRangePicker } from '../../components/common';
import { logout } from '../../lib/auth-api';
import { useCurrentUser } from '../../lib/dev-user';
import { C } from '../../lib/theme';
import { LEGAL_REVIEW_STATUS_FILTER, PROJECT_STATUS_CODE, USAGE_WORKFLOW_STATUS, getProjectManagers, getSheFilterOptionsFromProjects, normalizeUsageWorkflowStatus, type ProjectSummary, type UsageWorkflowStatus } from '../../lib/project-data';
import { listUsageStatementArchives } from '../../lib/archive-api';
import { getVisibleProjects, type PeriodMode, type ProjectSortField, type SortDirection } from '../../lib/project-list';
import { ROLE_LABELS } from '../../lib/permissions';
import { getDashboardAiUsage, getDashboardSummary, type DashboardAiUsageResponse, type DashboardSummaryResponse } from '../../lib/dashboard-api';
import { listProjects } from '../../lib/project-api';

const FALLBACK_ACTION_ASSIGNEE = '프로젝트 담당자';
const ALL_REASON_PROJECTS = 'all';
const AI_USAGE_TOP_LIMIT = 8;

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

const supplementRequestBadgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  height: 22,
  padding: '0 8px',
  borderRadius: 999,
  border: `1px solid #EFAEB7`,
  background: '#FFF4F5',
  color: C.danger,
  fontSize: 11,
  fontWeight: 800,
  lineHeight: 1,
  whiteSpace: 'nowrap',
};

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

const AI_USAGE_COST_COLORS = DASHBOARD_CHART_COLORS;
type AiUsageCostRow = {
  user: string;
  role: string;
  tokens: number;
  calls: number;
  cost: number;
};

const getAiUsageTooltipTitle = (row: AiUsageCostRow) => row.role ? `${row.user} · ${row.role}` : row.user;
const formatUsd = (value: number | string) => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const roleCodeToDashboardLabel = (roleCode: string) => {
  if (roleCode === 'user') return '프로젝트 담당자';
  if (roleCode === 'system_admin') return '시스템 관리자';
  return 'SHE 담당자';
};

const hasSupplementRequiredMonth = (project: ProjectSummary) => project.hasActionRequest;

const isLegalReviewWorkflow = (status?: string | null) => {
  const normalized = normalizeUsageWorkflowStatus(status);
  return normalized === USAGE_WORKFLOW_STATUS.UPLOAD_COMPLETED || normalized === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED;
};

const normalizeMonthKey = (month?: string | null) => {
  const match = month?.match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : month || '';
};

const getProjectAssigneeNames = (project: ProjectSummary) => {
  const names = project.participants.length > 0 ? project.participants : getProjectManagers(project);
  return names.filter(Boolean);
};

const getProjectAssigneeLabel = (project: ProjectSummary) => {
  const names = getProjectAssigneeNames(project);
  return names.length > 0 ? names.join(', ') : FALLBACK_ACTION_ASSIGNEE;
};

const hydrateProjectWorkflowStatus = async (project: ProjectSummary): Promise<ProjectSummary> => {
  const assigneeLabel = getProjectAssigneeLabel(project);
  try {
    const archives = await listUsageStatementArchives(project.id);
    const hasReviewNeededArchive = archives.some((archive) => isLegalReviewWorkflow(archive.workflowStatus));
    for (const archive of archives) {
      const month = normalizeMonthKey(archive.statementSummary.month);
      const archiveWorkflowStatus = normalizeUsageWorkflowStatus(archive.workflowStatus);
      if (archiveWorkflowStatus === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED) {
        return {
          ...project,
          hasLegalReviewNeededMonth: true,
          hasActionRequest: true,
          actionRequestDetails: {
            ...(project.actionRequestDetails || {
              title: '보완 요청 확인 필요',
              reason: '프로젝트 담당자가 사용내역서 또는 증빙 자료를 수정해야 합니다.',
              assignee: assigneeLabel,
              dueDate: '',
              requestedAt: '-',
            }),
            assignee: (project.actionRequestDetails?.assignee && project.actionRequestDetails.assignee !== FALLBACK_ACTION_ASSIGNEE)
              ? project.actionRequestDetails.assignee
              : assigneeLabel,
            month,
          },
          reportReady: true,
        };
      }
    }
    return {
      ...project,
      hasLegalReviewNeededMonth: hasReviewNeededArchive || isLegalReviewWorkflow(project.latestUsageStatementStatusCode),
      hasActionRequest: false,
      actionRequestDetails: undefined,
      reportReady: project.reportReady,
    };
  } catch {
    return project;
  }
};

const formatMonthLabel = (month?: string) => {
  const match = month?.match(/^(\d{4})-(\d{2})/);
  if (!match) return '월 정보 없음';
  return `${match[1]}년 ${Number(match[2])}월`;
};

const getProjectMonthWorkflowStatus = (project: ProjectSummary): UsageWorkflowStatus | undefined =>
  hasSupplementRequiredMonth(project) ? USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED : normalizeUsageWorkflowStatus(project.latestUsageStatementStatusCode);

const getProjectActionRequestMonth = (project: ProjectSummary) =>
  project.actionRequestDetails?.month?.match(/^(\d{4}-\d{2})/)?.[1] || '';

const getProjectReasonTrendMonth = (project: ProjectSummary, fallbackMonth: string) =>
  getProjectActionRequestMonth(project) || fallbackMonth;

const getProjectActionRequestSourceText = (project: ProjectSummary) =>
  `${project.actionRequestDetails?.title || ''} ${project.actionRequestDetails?.reason || ''}`.trim()
    || '보완 요청 증빙 자료 제출 확인 필요';

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

const hiddenCheckboxStyle: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  opacity: 0,
  pointerEvents: 'none',
};

const legalReviewFilterStyle = (active: boolean): CSSProperties => ({
  height: 30,
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 5,
  padding: '0 8px',
  borderRadius: 6,
  border: `1px solid ${active ? C.light : C.g200}`,
  background: active ? '#F4FBF6' : C.white,
  color: active ? C.primary : C.g800,
  fontFamily: 'inherit',
  fontSize: 11,
  fontWeight: 800,
  cursor: 'pointer',
  boxShadow: active ? 'inset 0 0 0 1px rgba(24, 111, 67, .06)' : 'none',
  transition: 'background .16s ease, border-color .16s ease, color .16s ease',
  whiteSpace: 'nowrap',
});

const legalReviewCheckStyle = (active: boolean): CSSProperties => ({
  width: 15,
  height: 15,
  flex: '0 0 auto',
  borderRadius: 4,
  border: `1px solid ${active ? C.primary : C.g400}`,
  background: active ? C.primary : '#FAFBFA',
  color: C.white,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 11,
  fontWeight: 900,
  lineHeight: 1,
});

const dashboardPageStyle: CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  padding: '24px clamp(76px, 7vw, 108px) 56px',
  minHeight: 'calc(100vh - 64px)',
  overflow: 'hidden',
  background: 'var(--dashboard-surface-bg)',
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
  zIndex: 20,
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

export default function DashboardPage() {
  const router = useRouter();
  const { user, clearCurrentUser } = useCurrentUser();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummaryResponse | null>(null);
  const [dashboardAiUsage, setDashboardAiUsage] = useState<DashboardAiUsageResponse | null>(null);
  const filterOptions = useMemo(() => getSheFilterOptionsFromProjects(projects), [projects]);
  const [projectName, setProjectName] = useState('');
  const [contractNumber, setContractNumber] = useState('');
  const [period, setPeriod] = useState('');
  const [periodMode, setPeriodMode] = useState<PeriodMode>('all');
  const [manager, setManager] = useState(filterOptions.managers[0] || '전체');
  const [status, setStatus] = useState<string>(filterOptions.statuses[0] || '전체');
  const legalReviewNeededChecked = status === '법령 검증 필요';
  const [sortBy, setSortBy] = useState<ProjectSortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedReasonProjectId, setSelectedReasonProjectId] = useState(ALL_REASON_PROJECTS);
  const [aiUsageView, setAiUsageView] = useState<'user' | 'project'>('user');
  const [dashboardMonthPeriod] = useState(() => {
    const now = new Date();
    return {
      year: String(now.getFullYear()),
      month: String(now.getMonth() + 1).padStart(2, '0'),
    };
  });
  const aiUsageYear = dashboardMonthPeriod.year;
  const aiUsageMonth = dashboardMonthPeriod.month;
  const currentMonthKey = `${dashboardMonthPeriod.year}-${dashboardMonthPeriod.month}`;
  const [aiUsageLoading, setAiUsageLoading] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [dashboardRefreshing, setDashboardRefreshing] = useState(false);
  const [chartTooltip, setChartTooltip] = useState<{ x: number; y: number; title: string; body: string } | null>(null);

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
      const [items, summary] = await Promise.all([
        listProjects({ page: 1, size: 10 }),
        getDashboardSummary().catch(() => null),
      ]);
      setDashboardSummary(summary);
      setProjects(await Promise.all(items.map(hydrateProjectWorkflowStatus)));
    } catch {
      setProjects([]);
      setDashboardSummary(null);
    } finally {
      setDashboardRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    setDashboardRefreshing(true);
    Promise.all([
      listProjects({ page: 1, size: 10 }),
      getDashboardSummary().catch(() => null),
    ])
      .then(([items, summary]) => Promise.all(items.map(hydrateProjectWorkflowStatus)).then((hydrated) => ({ hydrated, summary })))
      .then(({ hydrated, summary }) => {
        if (!alive) return;
        setProjects(hydrated);
        setDashboardSummary(summary);
      })
      .catch(() => {
        if (!alive) return;
        setProjects([]);
        setDashboardSummary(null);
      })
      .finally(() => {
        if (alive) setDashboardRefreshing(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    if (!aiUsageYear || !aiUsageMonth) {
      setDashboardAiUsage(null);
      setAiUsageLoading(false);
      return () => {
        alive = false;
      };
    }
    setAiUsageLoading(true);
    getDashboardAiUsage({ year: aiUsageYear, month: aiUsageMonth })
      .then((aiUsage) => {
        if (!alive) return;
        setDashboardAiUsage(aiUsage);
      })
      .catch(() => {
        if (!alive) return;
        setDashboardAiUsage(null);
      })
      .finally(() => {
        if (alive) setAiUsageLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [aiUsageMonth, aiUsageYear]);

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

  const activeProjects = useMemo(
    () => projects.filter((project) => project.projectStatusCode === PROJECT_STATUS_CODE.ACTIVE),
    [projects],
  );
  const visibleProjects = useMemo(() => {
    return getVisibleProjects(activeProjects, {
      projectName,
      contractNumber,
      period,
      periodMode,
      manager,
      status,
      allManagerLabel: filterOptions.managers[0],
      allStatusLabel: filterOptions.statuses[0],
    }, sortBy, sortDirection);
  }, [activeProjects, contractNumber, filterOptions.managers, filterOptions.statuses, manager, period, periodMode, projectName, sortBy, sortDirection, status]);
  const [rangeStart = '', rangeEnd = ''] = period.split('~');

  const workflowProjects = {
    [USAGE_WORKFLOW_STATUS.DRAFT]: projects.filter((project) => getProjectMonthWorkflowStatus(project) === USAGE_WORKFLOW_STATUS.DRAFT),
    [USAGE_WORKFLOW_STATUS.UPLOAD_COMPLETED]: projects.filter((project) => getProjectMonthWorkflowStatus(project) === USAGE_WORKFLOW_STATUS.UPLOAD_COMPLETED),
    [USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED]: projects.filter((project) => getProjectMonthWorkflowStatus(project) === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED),
    [USAGE_WORKFLOW_STATUS.REVIEW_COMPLETED]: projects.filter((project) => getProjectMonthWorkflowStatus(project) === USAGE_WORKFLOW_STATUS.REVIEW_COMPLETED),
  };
  const reviewNeededProjectCount = projects.filter((project) => {
    const workflow = getProjectMonthWorkflowStatus(project);
    return workflow === USAGE_WORKFLOW_STATUS.UPLOAD_COMPLETED || workflow === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED;
  }).length;
  const openReviewNeededProjects = () => {
    const targetSearchParams = new URLSearchParams({ status: LEGAL_REVIEW_STATUS_FILTER.NEEDED });
    router.push(`/projects?${targetSearchParams.toString()}`);
  };
  const dashboardAiUsageByUser = Array.isArray(dashboardAiUsage?.byUser) ? dashboardAiUsage.byUser : [];
  const dashboardAiUsageByProject = Array.isArray(dashboardAiUsage?.byProject) ? dashboardAiUsage.byProject : [];
  const aiUsageRows: readonly AiUsageCostRow[] = dashboardAiUsage
    ? (aiUsageView === 'user'
      ? dashboardAiUsageByUser.slice(0, AI_USAGE_TOP_LIMIT).map((row) => ({
        user: row.userName,
        role: roleCodeToDashboardLabel(row.roleCode),
        tokens: Number(row.totalTokens || 0),
        calls: Number(row.callCount || 0),
        cost: Number(row.costUsd || 0),
      }))
      : dashboardAiUsageByProject.slice(0, AI_USAGE_TOP_LIMIT).map((row) => ({
        user: row.projectName,
        role: '',
        tokens: Number(row.totalTokens || 0),
        calls: Number(row.callCount || 0),
        cost: Number(row.costUsd || 0),
      })))
    : [];
  const aiUsageTotalCost = Number(dashboardAiUsage?.total?.totalCostUsd || 0);
  const aiUsageTotalTokens = Number(dashboardAiUsage?.total?.totalTokens || 0);
  const aiUsageTotalCalls = Number(dashboardAiUsage?.total?.totalCalls || 0);
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
  const selectedReasonScope = selectedReasonProjectId || ALL_REASON_PROJECTS;
  const isAllReasonProjects = selectedReasonScope === ALL_REASON_PROJECTS;
  const selectedReasonProject = isAllReasonProjects ? undefined : projects.find((project) => project.id === selectedReasonScope);
  const reasonProjectId = isAllReasonProjects ? ALL_REASON_PROJECTS : selectedReasonProject?.id || '';
  const projectTableHeaders: Array<{ label: string; field: ProjectSortField; width: number }> = [
    { label: '프로젝트명', field: 'name', width: 150 },
    { label: '프로젝트 번호', field: 'contractNumber', width: 60 },
    { label: '공정률', field: 'progress', width: 130 },
    { label: '안전관리비 사용률', field: 'usageRate', width: 130 },
    { label: '공사 기간', field: 'startDate', width: 100 },
    { label: '담당자', field: 'manager', width: 80 },
  ];
  const toggleProjectTableSort = (field: ProjectSortField) => {
    if (sortBy === field) {
      setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortBy(field);
    setSortDirection('asc');
  };
  const selectedReasonProjectMonths = selectedReasonProject ? [getProjectReasonTrendMonth(selectedReasonProject, currentMonthKey)].filter(Boolean) : [];
  const selectedReasonProjectMonth = selectedReasonProject ? getProjectReasonTrendMonth(selectedReasonProject, currentMonthKey) : '';
  const selectedReasonSourceText = selectedReasonProject ? getProjectActionRequestSourceText(selectedReasonProject).toLowerCase() : '';
  const allReasonProjectMonths = Array.from(new Set(projects.flatMap((project) => {
    if (getProjectMonthWorkflowStatus(project) !== USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED) return [];
    return [getProjectReasonTrendMonth(project, currentMonthKey)];
  }))).sort();
  const reasonTrendMonthKeys = Array.from(new Set([
    ...(isAllReasonProjects ? allReasonProjectMonths : selectedReasonProjectMonths),
    ...(!isAllReasonProjects && selectedReasonProjectMonth ? [selectedReasonProjectMonth] : []),
  ])).sort();
  const reasonTrendRows = reasonTrendMonthKeys.map((monthKey) => {
    const activeMonth = monthKey === selectedReasonProjectMonth;
    const reasons = SUPPLEMENT_REASON_TYPES.map((reasonType) => {
      const projectCount = isAllReasonProjects
        ? projects.reduce((sum, project) => {
          const projectMonth = getProjectReasonTrendMonth(project, currentMonthKey);
          if (projectMonth !== monthKey || getProjectMonthWorkflowStatus(project) !== USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED)
            return sum;
          const sourceText = getProjectActionRequestSourceText(project).toLowerCase();
          return sum + getSupplementReasonMatchIds(sourceText).filter((id) => id === reasonType.id).length;
        }, 0)
        : activeMonth && Boolean(selectedReasonProject) && getProjectMonthWorkflowStatus(selectedReasonProject) === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED
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
  const displayedReasonTrendRows = hasReasonTrendData ? reasonTrendRows : [];
  const maxReasonTrendValue = Math.max(1, ...displayedReasonTrendRows.flatMap((row) => [row.total, ...row.reasons.map((reason) => reason.count)]));
  const reasonTrendAxisMax = Math.max(2, maxReasonTrendValue);
  const reasonTrendAxisTicks = Array.from(new Set([reasonTrendAxisMax, Math.ceil(reasonTrendAxisMax / 2), 0]));
  const managerWorkloads = Array.from(
    projects.reduce((map, project) => {
      const projectManagers = getProjectAssigneeNames(project);
      const managers = projectManagers.length > 0 ? projectManagers : ['미지정'];
      if (getProjectMonthWorkflowStatus(project) !== USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED)
        return map;
      const detailAssignee = project.actionRequestDetails?.assignee?.trim();
      const actionAssigneeSource = detailAssignee && detailAssignee !== FALLBACK_ACTION_ASSIGNEE ? detailAssignee : managers.join(',');
      const actionAssignees = actionAssigneeSource
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);

      actionAssignees.forEach((managerName) => {
        const current = map.get(managerName) || { actionRequired: 0, projectCount: 0 };
        map.set(managerName, {
          actionRequired: current.actionRequired + 1,
          projectCount: current.projectCount + 1,
        });
      });
      return map;
    }, new Map<string, { actionRequired: number; projectCount: number }>()),
  ).sort((a, b) => b[1].actionRequired - a[1].actionRequired || a[0].localeCompare(b[0], 'ko'));
  const dashboardSupplementAssignees = dashboardSummary?.supplementAssignees || [];
  const displayedManagerWorkloads = dashboardSupplementAssignees.length
    ? dashboardSupplementAssignees.map((assignee) => [assignee.userName, { actionRequired: assignee.supplementCount, projectCount: assignee.supplementCount }] as const)
    : managerWorkloads;
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
        <aside style={{ alignSelf: 'start', position: 'relative', zIndex: 40, overflow: 'visible', border: `1px solid ${C.g200}`, borderRadius: 'var(--ui-radius-card)', background: C.white, padding: 14, boxShadow: 'var(--ui-shadow-card)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: 10, minWidth: 0 }}>
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
		              <div style={{ marginTop: 5, fontSize: 19, lineHeight: 1, fontWeight: 700, color: C.g800 }}>{dashboardSummary?.summary.totalProjects ?? projects.length}</div>
	            </div>
            <div style={{ position: 'relative', minWidth: 0 }}>
              <button
                type="button"
                onClick={openReviewNeededProjects}
                style={{ width: '100%', border: `1px solid ${C.g200}`, borderRadius: 8, padding: '8px 10px', minWidth: 0, background: C.white, textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer' }}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0, fontSize: 10, fontWeight: 700, color: C.g400 }}>
                  <span>법령 검증 필요</span>
                  <span className="review-needed-info-wrap" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span aria-label="도움말" role="img" style={{ width: 14, height: 14, color: C.g500, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                        <path d="M12 11v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        <path d="M12 8h.01" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                      </svg>
                    </span>
                    <span
                      className="review-needed-tooltip"
                      role="tooltip"
                      style={{
                        position: 'absolute',
                        right: -8,
                        bottom: 'calc(100% + 7px)',
                        zIndex: 3,
                        display: 'none',
                        width: 200,
                        border: `1px solid ${C.g200}`,
                        borderRadius: 6,
                        background: C.g800,
                        color: C.white,
                        padding: '7px 8px',
                        fontSize: 10,
                        fontWeight: 800,
                        lineHeight: 1.45,
                        boxShadow: '0 10px 22px rgba(31,55,43,.18)',
                        whiteSpace: 'normal',
                      }}
                    >
                      법령 검증이 필요한 업로드 완료, 보완 요청 상태의 프로젝트를 확인할 수 있습니다.
                    </span>
                  </span>
                </div>
                <div style={{ marginTop: 5, fontSize: 19, lineHeight: 1, fontWeight: 700, color: C.primary }}>{dashboardSummary?.summary.reviewNeededProjects ?? reviewNeededProjectCount}</div>
              </button>
            </div>
		          </div>
	          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
		            <button
		              type="button"
		              onClick={() => router.push('/usage-records')}
			              style={{ height: 28, border: `1px solid ${C.g200}`, borderRadius: 6, background: '#FAFBFA', color: C.g600, fontFamily: 'inherit', fontSize: 10, fontWeight: 700, cursor: 'pointer', opacity: .9 }}
		            >
		              AI 사용금액
		            </button>
	          </div>
	        </aside>
        </div>
      </section>

      <div style={{ ...dashboardContentLayerStyle, width: 'min(100%, 1240px)', margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          <Card style={{ ...dashboardPanelStyle, padding: '14px 16px', overflow: 'visible' }}>
            <div style={{ ...dashboardPanelHeaderStyle, marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.g800 }}>진행 중인 프로젝트 현황</div>
              <Link href="/projects" style={{ fontSize: 12, fontWeight: 700, color: C.primary, textDecoration: 'none' }}>전체 프로젝트 보기 〉</Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(138px, 1.1fr) minmax(100px, .8fr) minmax(92px, .66fr) minmax(118px, .72fr) max-content', gap: 8, marginBottom: 12 }}>
              <input aria-label="프로젝트명" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="프로젝트 검색" style={compactFieldStyle} />
              <input aria-label="계약번호" value={contractNumber} onChange={(event) => setContractNumber(event.target.value)} placeholder="계약번호" style={compactFieldStyle} />
              <select aria-label="담당자" value={manager} onChange={(event) => setManager(event.target.value)} style={compactFieldStyle}>
                {filterOptions.managers.map((item) => <option key={item} value={item}>{item === filterOptions.managers[0] ? '담당자' : item}</option>)}
              </select>
              <DateRangePicker
                start={rangeStart}
                end={rangeEnd}
                onChange={(nextStart, nextEnd) => {
                  setPeriodMode(nextStart || nextEnd ? 'custom' : 'all');
                  setPeriod(nextStart || nextEnd ? `${nextStart}~${nextEnd}` : '');
                }}
                buttonStyle={{ ...compactFieldStyle, width: '100%' }}
                popupAlign="right"
                placeholder="기간 선택"
              />
              <label style={legalReviewFilterStyle(legalReviewNeededChecked)}>
                <input
                  type="checkbox"
                  checked={legalReviewNeededChecked}
                  onChange={(event) => setStatus(event.target.checked ? '법령 검증 필요' : (filterOptions.statuses[0] || '전체'))}
                  style={hiddenCheckboxStyle}
                />
                <span aria-hidden="true" style={legalReviewCheckStyle(legalReviewNeededChecked)}>{legalReviewNeededChecked ? '✓' : ''}</span>
                <span>법령 검증 필요</span>
              </label>
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
                  const parsedSafetyBudgetUsage = Number.parseFloat(String(project.usageRate).replace(/[^\d.]/g, ''));
                  const safetyBudgetUsage = Number.isFinite(parsedSafetyBudgetUsage) ? parsedSafetyBudgetUsage : 0;
                  const safetyBudgetUsageBarWidth = safetyBudgetUsage > 0 ? Math.max(2, Math.min(100, safetyBudgetUsage)) : 0;
                  const workflow = getProjectMonthWorkflowStatus(project);
                  const hasSupplementRequest = workflow === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED;
                  return (
                    <tr key={project.id} onClick={() => router.push(`/projects/${project.id}`)} style={{ cursor: 'pointer' }}>
                      <td style={{ padding: '12px 14px', borderTop: `1px solid ${C.g100}`, color: C.g800, fontSize: 13, fontWeight: 700 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <span style={{ whiteSpace: 'nowrap' }}>{project.constructionName}</span>
                          {hasSupplementRequest && <span style={supplementRequestBadgeStyle}>보완 요청</span>}
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
                            <div style={{ width: `${safetyBudgetUsageBarWidth}%`, height: '100%', background: safetyBudgetUsage >= 80 ? '#C9545E' : safetyBudgetUsage >= 50 ? '#F0A22E' : C.primary }} />
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
              <span>진행 중 {activeProjects.length}건</span>
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
                  {projects.length > 0 && <option value={ALL_REASON_PROJECTS}>전체</option>}
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.constructionName}</option>
                  ))}
                </select>
              </div>
              {displayedReasonTrendRows.length === 0 ? (
                <div style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', color: C.g400, fontSize: 12, fontWeight: 700, textAlign: 'center' }}>
                  표시할 보완 요청 사유가 없습니다.
                </div>
              ) : (
                <>
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
                      <div style={{ minWidth: Math.max(displayedReasonTrendRows.length * 84, 220), height: '100%', display: 'grid', gridTemplateColumns: `repeat(${displayedReasonTrendRows.length}, 84px)`, gap: 0, alignItems: 'stretch' }}>
                        {displayedReasonTrendRows.map((row, rowIndex) => (
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
                </>
              )}
            </Card>

            <Card style={{ ...dashboardPanelStyle, padding: '14px 16px', height: dashboardAnalysisCardHeight, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ ...dashboardPanelHeaderStyle, marginBottom: 10 }}>
                <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.g800, whiteSpace: 'nowrap' }}>AI 사용 금액</div>
                  <div style={{ color: C.g500, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>
                    {`${dashboardMonthPeriod.year}년 ${Number(dashboardMonthPeriod.month)}월 기준`}
                  </div>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <div role="group" aria-label="AI 사용 금액 기준" style={{ display: 'inline-flex', alignItems: 'center', height: 30, padding: 2, border: `1px solid ${C.g200}`, borderRadius: 999, background: '#F7F8F7', flexShrink: 0 }}>
                    {[
                      { key: 'user' as const, label: '사용자별' },
                      { key: 'project' as const, label: '프로젝트별' },
                    ].map((option) => {
                      const active = aiUsageView === option.key;
                      return (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => setAiUsageView(option.key)}
                          style={{ height: 24, border: 'none', borderRadius: 999, background: active ? C.white : 'transparent', color: active ? C.primary : C.g600, padding: '0 8px', fontFamily: 'inherit', fontSize: 10, fontWeight: 700, cursor: 'pointer', boxShadow: active ? '0 1px 4px rgba(31,55,43,.08)' : 'none' }}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  <Link href={`/usage-records?year=${aiUsageYear}&month=${aiUsageMonth}`} style={{ color: C.primary, fontSize: 11, fontWeight: 800, textDecoration: 'none', whiteSpace: 'nowrap' }}>전체 보기 〉</Link>
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
                              onMouseEnter={(event) => showChartTooltip(event, getAiUsageTooltipTitle(segment.row), `${formatUsd(segment.row.cost)} · ${segment.row.calls}회`)}
                              onMouseMove={moveChartTooltip}
                              onMouseLeave={hideChartTooltip}
                              style={{ cursor: 'default' }}
                            />
                          ))}
                        </svg>
                        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', pointerEvents: 'none' }}>
                          <div>
                            <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2, fontSize: 12, fontWeight: 800, color: C.g800, lineHeight: 1 }}>
                              <span>{formatUsd(aiUsageTotalCost)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 }}>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: C.g400 }}>총 토큰</div>
                      <div style={{ marginTop: 2, fontSize: 12, fontWeight: 700, color: C.g800 }}>{aiUsageTotalTokens.toLocaleString('ko-KR')}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: C.g400 }}>호출 수</div>
                      <div style={{ marginTop: 2, fontSize: 12, fontWeight: 700, color: C.g800 }}>{aiUsageTotalCalls.toLocaleString('ko-KR')}회</div>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 0, minHeight: 0, overflowY: 'auto', paddingRight: 5, scrollbarGutter: 'stable' }}>
                  {aiUsageLoading && (
                    <div style={{ minHeight: 120, display: 'grid', placeItems: 'center', borderTop: `1px solid ${C.g100}`, color: C.g400, fontSize: 12, fontWeight: 700 }}>
                      사용량을 불러오는 중입니다.
                    </div>
                  )}
                  {!aiUsageLoading && aiUsageRows.length === 0 && (
                    <div style={{ minHeight: 120, display: 'grid', placeItems: 'center', borderTop: `1px solid ${C.g100}`, color: C.g400, fontSize: 12, fontWeight: 700 }}>
                      표시할 AI 사용량이 없습니다.
                    </div>
                  )}
                  {!aiUsageLoading && aiUsageRows.map((row) => (
                    <div key={row.user} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 10, alignItems: 'center', borderTop: `1px solid ${C.g100}`, padding: '10px 10px' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.user}</span>
                          {row.role && <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: C.g500 }}>{row.role}</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginTop: 3, fontSize: 10, fontWeight: 700, color: C.g400 }}>
                          <span>{row.tokens.toLocaleString('ko-KR')} tokens</span>
                          <span>· {row.calls}회</span>
                        </div>
                      </div>
                      <div style={{ display: 'inline-flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 2, fontSize: 14, fontWeight: 700, color: C.g800, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span>{formatUsd(row.cost)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card style={{ ...dashboardPanelStyle, padding: '14px 16px', height: dashboardAnalysisCardHeight, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ ...dashboardPanelHeaderStyle, marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.g800 }}>담당자별 보완 진행 현황</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.primary }}>{currentMonthKey.replace('-', '년 ')}월</div>
            </div>
            <div style={{ display: 'grid', gap: 10, flex: '1 1 auto', minHeight: 0, overflowY: 'auto', paddingRight: 6, scrollbarGutter: 'stable', overscrollBehavior: 'contain' }}>
              {displayedManagerWorkloads.length === 0 && (
                <div style={{ minHeight: 128, display: 'grid', placeItems: 'center', borderTop: `1px solid ${C.g100}`, color: C.g400, fontSize: 12, fontWeight: 700 }}>
                  진행 중인 보완 요청이 없습니다.
                </div>
              )}
              {displayedManagerWorkloads.map(([managerName, workload]) => (
                <div key={managerName} style={{ display: 'grid', gridTemplateColumns: '34px minmax(0,1fr) auto', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: `1px solid ${C.g100}` }}>
                  <div style={{ width: 34, height: 34, borderRadius: 999, background: C.primary, color: C.white, display: 'grid', placeItems: 'center' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{managerName}</div>
                    <div style={{ marginTop: 3, fontSize: 10, fontWeight: 700, color: C.g400 }}>보완 요청 진행 중</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.g800 }}>{workload.actionRequired}건</div>
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
      <style jsx>{`
        .review-needed-info-wrap:hover .review-needed-tooltip {
          display: block !important;
        }
      `}</style>
    </AppFrame>
  );
}
