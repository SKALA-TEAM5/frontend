import { apiFetch } from './api-client';

export type UsageRecordScope = 'user' | 'project' | 'agent' | 'month' | 'date';

export interface UsageRecordSummary {
  id: string;
  label: string;
  subLabel: string;
  tokens: number;
  calls: number;
  cost: number;
  period?: UsageRecordPeriod;
}

type UsageRecordRaw = Record<string, unknown>;
export interface UsageRecordPeriod {
  year: string;
  month: string;
  date?: string;
}

const ENDPOINTS: Record<UsageRecordScope, string> = {
  user: '/usage-records/by-user',
  project: '/usage-records/by-project',
  agent: '/usage-records/by-agent',
  month: '/usage-records/by-month',
  date: '/usage-records/by-date',
};

const DEFAULT_INPUT_COST_USD_PER_1M_TOKENS = 0.40;

const asArray = (value: unknown): UsageRecordRaw[] => {
  if (Array.isArray(value)) return value.filter((item): item is UsageRecordRaw => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of ['content', 'items', 'records', 'rows', 'data']) {
      const nested = asArray(record[key]);
      if (nested.length > 0) return nested;
    }
  }
  return [];
};

const readString = (source: UsageRecordRaw, keys: string[]) => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
};

const readNumber = (source: UsageRecordRaw, keys: string[]) => {
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

const parsePeriodText = (rawDate: string): UsageRecordPeriod | undefined => {
  const match = rawDate.match(/(\d{4})\D+(\d{1,2})(?:\D+(\d{1,2}))?/);
  if (!match) return undefined;
  const normalizedMonth = match[2].padStart(2, '0');
  return {
    year: match[1],
    month: normalizedMonth,
    date: match[3] ? `${match[1]}-${normalizedMonth}-${match[3].padStart(2, '0')}` : undefined,
  };
};

const parseUsageRecordPeriod = (item: UsageRecordRaw): UsageRecordPeriod | undefined => {
  const executionDate = parsePeriodText(readString(item, [
    'executedAt',
    'executed_at',
    'executedDate',
    'executed_date',
    'runAt',
    'run_at',
    'startedAt',
    'started_at',
    'completedAt',
    'completed_at',
    'finishedAt',
    'finished_at',
    'endedAt',
    'ended_at',
    'usedAt',
    'used_at',
    'createdAt',
    'created_at',
  ]));
  if (executionDate) return executionDate;

  const year = readNumber(item, ['year', 'usageYear', 'usage_year']);
  const month = readNumber(item, ['month', 'usageMonth', 'usage_month']);
  if (year > 0 && month > 0) {
    const normalizedMonth = String(month).padStart(2, '0');
    const day = readNumber(item, ['day', 'usageDay', 'usage_day']);
    return {
      year: String(year),
      month: normalizedMonth,
      date: day > 0 ? `${year}-${normalizedMonth}-${String(day).padStart(2, '0')}` : undefined,
    };
  }

  return parsePeriodText(readString(item, [
    'usageDate',
    'usage_date',
    'date',
    'createdDate',
    'created_date',
    'yearMonth',
    'year_month',
    'usageMonth',
    'usage_month',
  ]));
};

const estimateCostUsd = (tokens: number) => (tokens / 1_000_000) * DEFAULT_INPUT_COST_USD_PER_1M_TOKENS;

const formatUsagePeriodLabel = (period?: UsageRecordPeriod) => {
  if (!period) return '';
  if (period.date) {
    const day = period.date.slice(8, 10);
    return `${period.year}년 ${Number(period.month)}월 ${Number(day)}일`;
  }
  return `${period.year}년 ${Number(period.month)}월`;
};

const getLabel = (scope: UsageRecordScope, item: UsageRecordRaw, period?: UsageRecordPeriod) => {
  if (scope === 'user') return readString(item, ['userName', 'user_name', 'username', 'name', 'displayName', 'display_name', 'email', 'userId', 'user_id']);
  if (scope === 'project') return readString(item, ['projectName', 'project_name', 'constructionName', 'construction_name', 'name', 'projectId', 'project_id']);
  if (scope === 'agent') return readString(item, ['agentName', 'agent_name', 'agentTypeCode', 'agent_type_code', 'agentType', 'agent_type', 'name']);
  if (scope === 'month') return formatUsagePeriodLabel(period) || readString(item, ['month', 'usageMonth', 'usage_month', 'yearMonth', 'year_month', 'date']);
  return formatUsagePeriodLabel(period) || readString(item, ['date', 'usageDate', 'usage_date', 'createdDate', 'created_date']);
};

const getSubLabel = (scope: UsageRecordScope, item: UsageRecordRaw) => {
  if (scope === 'user') return readString(item, ['roleName', 'role_name', 'role', 'department', 'team']);
  if (scope === 'project') return readString(item, ['contractNumber', 'contract_number', 'projectCode', 'project_code', 'managerName', 'manager_name']);
  if (scope === 'agent') return readString(item, ['agentVersion', 'agent_version', 'model', 'provider']);
  if (scope === 'month') return readString(item, ['year', 'projectName', 'project_name']);
  return readString(item, ['month', 'agentName', 'agent_name']);
};

export const normalizeUsageRecord = (scope: UsageRecordScope, item: UsageRecordRaw, index = 0): UsageRecordSummary => {
  const explicitTotalTokens = readNumber(item, ['totalToken', 'total_token', 'totalTokens', 'total_tokens', 'tokens', 'token']);
  const inputTokens = readNumber(item, ['inputTokens', 'input_tokens']);
  const outputTokens = readNumber(item, ['outputTokens', 'output_tokens']);
  const tokens = explicitTotalTokens || inputTokens + outputTokens;
  const calls = readNumber(item, ['callCount', 'call_count', 'calls', 'count', 'requestCount', 'request_count', 'totalCount', 'total_count']);
  const cost = readNumber(item, ['cost', 'totalCost', 'total_cost', 'amount', 'totalAmount', 'total_amount', 'price', 'krw']);
  const costUsd = readNumber(item, ['costUsd', 'cost_usd', 'totalCostUsd', 'total_cost_usd']);
  const period = parseUsageRecordPeriod(item);
  const label = getLabel(scope, item, period) || `항목 ${index + 1}`;
  return {
    id: readString(item, ['id', 'userId', 'user_id', 'projectId', 'project_id', 'agentTypeCode', 'agent_type_code']) || `${scope}-${label}-${index}`,
    label,
    subLabel: getSubLabel(scope, item),
    tokens,
    calls,
    cost: costUsd || cost || estimateCostUsd(tokens),
    period,
  };
};

export const buildUsageRecordQuery = (params?: { year?: string; month?: string }) => {
  const query = new URLSearchParams();
  const year = Number(params?.year);
  const month = Number(params?.month);
  if (Number.isFinite(year) && year > 0 && Number.isFinite(month) && month > 0) {
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 0));
    query.set('from', from.toISOString().slice(0, 10));
    query.set('to', to.toISOString().slice(0, 10));
  } else if (Number.isFinite(year) && year > 0) {
    query.set('from', `${year}-01-01`);
    query.set('to', `${year}-12-31`);
  }
  const text = query.toString();
  return text ? `?${text}` : '';
};

export const listUsageRecords = async (scope: UsageRecordScope, params?: { year?: string; month?: string }) => {
  const response = await apiFetch<unknown>(`${ENDPOINTS[scope]}${buildUsageRecordQuery(params)}`);
  return asArray(response.data)
    .map((item, index) => normalizeUsageRecord(scope, item, index))
    .sort((a, b) => b.cost - a.cost || b.tokens - a.tokens || a.label.localeCompare(b.label));
};

export const summarizeTopUsageRecords = (rows: UsageRecordSummary[], limit = 5): UsageRecordSummary[] => {
  if (rows.length <= limit) return rows;
  const top = rows.slice(0, limit);
  const rest = rows.slice(limit);
  const etc = rest.reduce<UsageRecordSummary>((summary, row) => ({
    ...summary,
    tokens: summary.tokens + row.tokens,
    calls: summary.calls + row.calls,
    cost: summary.cost + row.cost,
  }), { id: 'etc', label: '기타', subLabel: `${rest.length}개 항목`, tokens: 0, calls: 0, cost: 0 });
  return [...top, etc];
};

export const getLatestUsageRecordPeriod = (rows: UsageRecordSummary[]): UsageRecordPeriod | undefined =>
  rows
    .map((row) => row.period)
    .filter((period): period is UsageRecordPeriod => Boolean(period))
    .sort((a, b) => {
      const aKey = a.date || `${a.year}-${a.month}`;
      const bKey = b.date || `${b.year}-${b.month}`;
      return bKey.localeCompare(aKey);
    })[0];
