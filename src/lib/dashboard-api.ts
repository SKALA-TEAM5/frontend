import { apiFetch } from './api-client';

export interface DashboardSummaryMetrics {
  totalProjects: number;
  reviewNeededProjects: number;
}

export interface DashboardSupplementAssignee {
  userId: number;
  userName: string;
  roleCode: string;
  supplementCount: number;
}

export interface DashboardSummaryResponse {
  summary: DashboardSummaryMetrics;
  supplementAssignees: DashboardSupplementAssignee[];
}

export interface DashboardAiUsageTotal {
  totalTokens: number;
  totalCalls: number;
  totalCostUsd: number | string;
}

export interface DashboardAiUsageByUser {
  userId: number;
  userName: string;
  roleCode: string;
  totalTokens: number;
  costUsd: number | string;
  callCount: number;
}

export interface DashboardAiUsageByProject {
  projectId: number;
  projectName: string;
  type: string;
  totalTokens: number;
  costUsd: number | string;
  callCount: number;
}

export interface DashboardAiUsageResponse {
  total: DashboardAiUsageTotal;
  byUser: DashboardAiUsageByUser[];
  byProject: DashboardAiUsageByProject[];
  topUsers?: DashboardAiUsageByUser[];
  topProjects?: DashboardAiUsageByProject[];
}

const buildAiUsageQuery = (params?: { year?: string; month?: string }) => {
  const query = new URLSearchParams();
  if (params?.year) query.set('year', params.year);
  if (params?.month) query.set('month', String(Number(params.month)));
  const text = query.toString();
  return text ? `?${text}` : '';
};

type DashboardRawRecord = Record<string, unknown>;

const emptyAiUsage: DashboardAiUsageResponse = {
  total: { totalTokens: 0, totalCalls: 0, totalCostUsd: 0 },
  byUser: [],
  byProject: [],
};

const isRecord = (value: unknown): value is DashboardRawRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const readString = (source: DashboardRawRecord, keys: string[]) => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
};

const readNumber = (source: DashboardRawRecord, keys: string[]) => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value.replace(/[^\d.-]/g, ''));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
};

const readArray = (source: DashboardRawRecord, keys: string[]) => {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) return value.filter(isRecord);
  }
  return [];
};

const normalizeAiUsageUser = (row: DashboardRawRecord, index: number): DashboardAiUsageByUser => ({
  userId: readNumber(row, ['userId', 'user_id', 'id']) || index,
  userName: readString(row, ['userName', 'user_name', 'username', 'name', 'displayName', 'display_name']) || '사용자',
  roleCode: readString(row, ['roleCode', 'role_code', 'roleName', 'role_name', 'role']) || '',
  totalTokens: readNumber(row, ['totalTokens', 'total_tokens', 'totalToken', 'total_token', 'tokens', 'token']),
  costUsd: readNumber(row, ['costUsd', 'cost_usd', 'totalCostUsd', 'total_cost_usd', 'cost', 'totalCost', 'total_cost', 'amount', 'krw']),
  callCount: readNumber(row, ['callCount', 'call_count', 'calls', 'count', 'requestCount', 'request_count']),
});

const normalizeAiUsageProject = (row: DashboardRawRecord, index: number): DashboardAiUsageByProject => ({
  projectId: readNumber(row, ['projectId', 'project_id', 'id']) || index,
  projectName: readString(row, ['projectName', 'project_name', 'constructionName', 'construction_name', 'name']) || '프로젝트',
  type: readString(row, ['type', 'projectType', 'project_type']) || '',
  totalTokens: readNumber(row, ['totalTokens', 'total_tokens', 'totalToken', 'total_token', 'tokens', 'token']),
  costUsd: readNumber(row, ['costUsd', 'cost_usd', 'totalCostUsd', 'total_cost_usd', 'cost', 'totalCost', 'total_cost', 'amount', 'krw']),
  callCount: readNumber(row, ['callCount', 'call_count', 'calls', 'count', 'requestCount', 'request_count']),
});

const sumAiUsageRows = (rows: Array<{ totalTokens: number; callCount: number; costUsd: number | string }>): DashboardAiUsageTotal =>
  rows.reduce<DashboardAiUsageTotal>((total, row) => ({
    totalTokens: total.totalTokens + Number(row.totalTokens || 0),
    totalCalls: total.totalCalls + Number(row.callCount || 0),
    totalCostUsd: Number(total.totalCostUsd || 0) + Number(row.costUsd || 0),
  }), { ...emptyAiUsage.total });

const normalizeDashboardAiUsage = (value: unknown): DashboardAiUsageResponse => {
  if (!isRecord(value)) return emptyAiUsage;

  const totalSource = isRecord(value.total) ? value.total : value;
  const byUser = readArray(value, ['byUser', 'by_user', 'topUsers', 'top_users', 'users', 'userUsage', 'user_usage'])
    .map(normalizeAiUsageUser);
  const byProject = readArray(value, ['byProject', 'by_project', 'topProjects', 'top_projects', 'projects', 'projectUsage', 'project_usage'])
    .map(normalizeAiUsageProject);

  const computedTotal = sumAiUsageRows([...byUser, ...byProject]);
  const total = {
    totalTokens: readNumber(totalSource, ['totalTokens', 'total_tokens', 'tokens']) || computedTotal.totalTokens,
    totalCalls: readNumber(totalSource, ['totalCalls', 'total_calls', 'callCount', 'call_count', 'calls']) || computedTotal.totalCalls,
    totalCostUsd: readNumber(totalSource, ['totalCostUsd', 'total_cost_usd', 'totalCost', 'total_cost', 'cost', 'amount', 'krw']) || computedTotal.totalCostUsd,
  };

  return { total, byUser, byProject };
};

const emptyDashboardSummary: DashboardSummaryResponse = {
  summary: { totalProjects: 0, reviewNeededProjects: 0 },
  supplementAssignees: [],
};

const normalizeSupplementAssignee = (row: DashboardRawRecord, index: number): DashboardSupplementAssignee => ({
  userId: readNumber(row, ['userId', 'user_id', 'id']) || index,
  userName: readString(row, ['userName', 'user_name', 'username', 'name', 'displayName', 'display_name']) || '담당자',
  roleCode: readString(row, ['roleCode', 'role_code', 'roleName', 'role_name', 'role']) || '',
  supplementCount: readNumber(row, ['supplementCount', 'supplement_count', 'count', 'totalCount', 'total_count']),
});

const normalizeDashboardSummary = (value: unknown): DashboardSummaryResponse => {
  if (!isRecord(value)) return emptyDashboardSummary;

  const summarySource = isRecord(value.summary) ? value.summary : value;
  return {
    summary: {
      totalProjects: readNumber(summarySource, ['totalProjects', 'total_projects', 'projectCount', 'project_count']),
      reviewNeededProjects: readNumber(summarySource, ['reviewNeededProjects', 'review_needed_projects', 'reviewRequiredCount', 'review_required_count']),
    },
    supplementAssignees: readArray(value, ['supplementAssignees', 'supplement_assignees', 'supplementProgress', 'supplement_progress'])
      .map(normalizeSupplementAssignee),
  };
};

export const getDashboardSummary = async () => {
  const response = await apiFetch<unknown>('/dashboard');
  return normalizeDashboardSummary(response.data);
};

export const getDashboardAiUsage = async (params?: { year?: string; month?: string }) => {
  const response = await apiFetch<unknown>(`/dashboard/ai-usage${buildAiUsageQuery(params)}`);
  return normalizeDashboardAiUsage(response.data);
};
