import { apiFetch } from './api-client';

export interface DashboardSummaryResponse {
  totalProjects: number;
  reviewRequiredCount: number;
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
}

export interface DashboardSupplementProgress {
  userId: number;
  userName: string;
  roleCode: string;
  supplementCount: number;
}

const buildAiUsageQuery = (params?: { year?: string; month?: string }) => {
  const query = new URLSearchParams();
  if (params?.year) query.set('year', params.year);
  if (params?.month) query.set('month', String(Number(params.month)));
  const text = query.toString();
  return text ? `?${text}` : '';
};

export const getDashboardSummary = async () => {
  const response = await apiFetch<DashboardSummaryResponse>('/dashboard/summary');
  return response.data;
};

export const getDashboardAiUsage = async (params?: { year?: string; month?: string }) => {
  const response = await apiFetch<DashboardAiUsageResponse>(`/dashboard/ai-usage${buildAiUsageQuery(params)}`);
  return response.data;
};

export const getDashboardSupplementProgress = async () => {
  const response = await apiFetch<DashboardSupplementProgress[]>('/dashboard/supplement-progress');
  return response.data;
};
