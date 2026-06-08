import { apiFetch } from './api-client';
import { backendEvidenceTypeToCategory } from './archive-api';
import type { AgentLogStatusCode } from './project-data';
import type { FolderEvidenceCategory } from '../types/domain';

export interface AgentRunResponse {
  agentType?: string;
  agentTypeCode?: string;
  status?: AgentLogStatusCode | string;
  statusCode?: AgentLogStatusCode | string;
  resultCode?: string;
  reason?: string;
  logIds?: number[];
  result?: Record<string, unknown>;
  reportDraft?: unknown;
}

export interface ReportDetailResponse {
  agentTypeCode: string;
  statusCode: AgentLogStatusCode | string;
  details: string | Record<string, unknown>;
  createdAt: string;
}

export interface LawAgentRunResponse {
  workflow: string;
  status: AgentLogStatusCode | string;
  validationLogIds: number[];
  result: Record<string, unknown>;
}

export interface OcrWorkflowResponse {
  requestId?: string;
  workflow?: string;
  status?: AgentLogStatusCode | string;
  validationLogIds?: number[];
  usageStatementId: number | null;
  itemCount?: number;
  evidenceFileLinkId?: number | null;
  result?: Record<string, unknown>;
}

export interface OrchestratorTodo {
  agentTypeCode: string;
  usageStatementItemId: number | null;
  fileId: number | null;
  reason: string;
  statusCode: string;
}

export interface OrchestratorStatusResponse {
  projectId: number;
  usageStatementId: number;
  hasUsageStatementItems: boolean;
  hasReceiptsOrTaxInvoices: boolean;
  hasSitePhotos: boolean;
  classiReady: boolean;
  evidenceReviewReady: boolean;
  legalReady: boolean;
  reportReady: boolean;
  legalResultCode?: string | null;
  reportDisabledReason?: string | null;
  agents: OrchestratorDashboardAgent[];
  logs: Array<Record<string, unknown>>;
  todos: OrchestratorTodo[];
}

export interface OrchestratorDashboardAgent {
  agentTypeCode: string;
  statusCode?: string | null;
  resultCode?: string | null;
  usageStatementId?: number | null;
  token: number;
  reason?: string | null;
}

export interface OrchestratorDashboardResponse {
  projectId: number;
  usageStatementId?: number | null;
  totalLogs: number;
  totalToken: number;
  statusCounts: Record<string, number>;
  resultCounts: Record<string, number>;
  hilAgents: string[];
  agents: OrchestratorDashboardAgent[];
}

interface AgentTodoItemResponse {
  usageStatementItemId?: number | null;
  usage_statement_item_id?: number | null;
  reason?: string | null;
}

interface AgentTodoEntryResponse {
  agentTypeCode?: string | null;
  agent_type_code?: string | null;
  resultCode?: string | null;
  result_code?: string | null;
  reason?: string | null;
  items?: AgentTodoItemResponse[];
}

interface AgentTodoListResponse {
  validate?: AgentTodoEntryResponse[];
  legal?: AgentTodoEntryResponse | null;
}

interface AgentButtonStateResponse {
  enabled?: boolean;
  reason?: string | null;
}

interface AgentButtonStatesResponse {
  validate?: AgentButtonStateResponse;
  legal?: AgentButtonStateResponse;
  report?: AgentButtonStateResponse;
}

const readField = <T = unknown>(source: Record<string, unknown>, camelKey: string, snakeKey: string): T | undefined =>
  (source[camelKey] ?? source[snakeKey]) as T | undefined;

const normalizeOrchestratorStatus = (raw: unknown): OrchestratorStatusResponse => {
  const source = (raw || {}) as Record<string, unknown>;
  const rawTodos = (readField<unknown[]>(source, 'todos', 'todos') || []) as Array<Record<string, unknown>>;
  return {
    projectId: Number(readField(source, 'projectId', 'project_id') || 0),
    usageStatementId: Number(readField(source, 'usageStatementId', 'usage_statement_id') || 0),
    hasUsageStatementItems: Boolean(readField(source, 'hasUsageStatementItems', 'has_usage_statement_items')),
    hasReceiptsOrTaxInvoices: Boolean(readField(source, 'hasReceiptsOrTaxInvoices', 'has_receipts_or_tax_invoices')),
    hasSitePhotos: Boolean(readField(source, 'hasSitePhotos', 'has_site_photos')),
    classiReady: Boolean(readField(source, 'classiReady', 'classi_ready')),
    evidenceReviewReady: Boolean(readField(source, 'evidenceReviewReady', 'evidence_review_ready')),
    legalReady: Boolean(readField(source, 'legalReady', 'legal_ready')),
    reportReady: Boolean(readField(source, 'reportReady', 'report_ready')),
    agents: [],
    logs: (source.logs as Array<Record<string, unknown>>) || [],
    todos: rawTodos.map((todo) => ({
      agentTypeCode: String(readField(todo, 'agentTypeCode', 'agent_type_code') || ''),
      usageStatementItemId: readField(todo, 'usageStatementItemId', 'usage_statement_item_id') == null
        ? null
        : Number(readField(todo, 'usageStatementItemId', 'usage_statement_item_id')),
      fileId: readField(todo, 'fileId', 'file_id') == null ? null : Number(readField(todo, 'fileId', 'file_id')),
      reason: String(todo.reason || ''),
      statusCode: String(readField(todo, 'statusCode', 'status_code') || 'open'),
    })),
  };
};

const normalizeBackendAgentTodos = (raw: AgentTodoListResponse | null | undefined): OrchestratorTodo[] => {
  const entries = [...(raw?.validate || []), raw?.legal].filter((entry): entry is AgentTodoEntryResponse => Boolean(entry));
  return entries.flatMap((entry) => {
    const agentTypeCode = String(readField(entry as Record<string, unknown>, 'agentTypeCode', 'agent_type_code') || '');
    const entryReason = entry.reason || '';
    const items = entry.items || [];
    if (!items.length) {
      return [{
        agentTypeCode,
        usageStatementItemId: null,
        fileId: null,
        reason: entryReason || '보완 사항 확인 필요',
        statusCode: 'open',
      }];
    }
    return items.map((item) => {
      const itemRecord = item as Record<string, unknown>;
      const usageStatementItemId = readField(itemRecord, 'usageStatementItemId', 'usage_statement_item_id');
      return {
        agentTypeCode,
        usageStatementItemId: usageStatementItemId == null ? null : Number(usageStatementItemId),
        fileId: null,
        reason: item.reason || entryReason || '보완 사항 확인 필요',
        statusCode: 'open',
      };
    });
  });
};

const normalizeOrchestratorDashboard = (raw: unknown): OrchestratorDashboardResponse => {
  const source = (raw || {}) as Record<string, unknown>;
  const rawAgents = (readField<unknown[]>(source, 'agents', 'agents') || []) as Array<Record<string, unknown>>;
  return {
    projectId: Number(readField(source, 'projectId', 'project_id') || 0),
    usageStatementId: readField(source, 'usageStatementId', 'usage_statement_id') == null
      ? null
      : Number(readField(source, 'usageStatementId', 'usage_statement_id')),
    totalLogs: Number(readField(source, 'totalLogs', 'total_logs') || 0),
    totalToken: Number(readField(source, 'totalToken', 'total_token') || 0),
    statusCounts: (readField<Record<string, number>>(source, 'statusCounts', 'status_counts') || {}),
    resultCounts: (readField<Record<string, number>>(source, 'resultCounts', 'result_counts') || {}),
    hilAgents: (readField<string[]>(source, 'hilAgents', 'hil_agents') || []),
    agents: rawAgents.map((agent) => ({
      agentTypeCode: String(readField(agent, 'agentTypeCode', 'agent_type_code') || ''),
      statusCode: readField(agent, 'statusCode', 'status_code') ?? null,
      resultCode: readField(agent, 'resultCode', 'result_code') ?? null,
      usageStatementId: readField(agent, 'usageStatementId', 'usage_statement_id') == null
        ? null
        : Number(readField(agent, 'usageStatementId', 'usage_statement_id')),
      token: Number(readField(agent, 'token', 'token') || 0),
      reason: (readField(agent, 'reason', 'reason') as string | undefined) ?? null,
    })),
  };
};

export type RequiredEvidenceMap = Record<string, Partial<Record<FolderEvidenceCategory, string[]>>>;

type EvidenceRequirementRecord = {
  evidenceTypeCode: string;
  isSatisfied: boolean;
  isActive: boolean;
};

export const runReportAgent = async (projectId: string, usageStatementId: number) => {
  const response = await apiFetch<AgentRunResponse>(`/projects/${projectId}/agents/report`, {
    method: 'POST',
    body: { usageStatementId },
  });
  return response.data;
};

export const getReportDetail = async (projectId: string, usageStatementId: number) => {
  const response = await apiFetch<ReportDetailResponse>(
    `/projects/${projectId}/agents/report?usageStatementId=${usageStatementId}`,
  );
  return response.data;
};

export const parseUsageStatementWithOcr = async (projectId: string, fileId: number | string) => {
  const response = await apiFetch<OcrWorkflowResponse>(`/projects/${projectId}/agents/parse`, {
    method: 'POST',
    body: { fileId: Number(fileId) },
  });
  return response.data;
};

export const parseAndMatchEvidenceWithOcr = async (
  projectId: string,
  input: { fileId: number | string; usageStatementId: number; usageStatementItemId: number | string },
) => {
  const response = await apiFetch<OcrWorkflowResponse>(`/projects/${projectId}/agents/ocr/evidence/parse-and-match`, {
    method: 'POST',
    body: {
      fileId: Number(input.fileId),
      usageStatementId: input.usageStatementId,
      usageStatementItemId: Number(input.usageStatementItemId),
    },
  });
  return response.data;
};

export const runValidationAgent = async (projectId: string, usageStatementId: number, rerun = false) => {
  const response = await apiFetch<LawAgentRunResponse>(`/projects/${projectId}/validations`, {
    method: 'POST',
    body: { usageStatementId: String(usageStatementId), rerun },
  });
  return response.data;
};

export const runEvidenceReviewAgent = async (projectId: string, usageStatementId: number) => {
  const response = await apiFetch<void>(`/projects/${projectId}/agents/validate`, {
    method: 'POST',
    body: { usageStatementId },
  });
  return response.data;
};

export const runLegalAgent = async (projectId: string, usageStatementId: number) => {
  const response = await apiFetch<AgentRunResponse>(`/projects/${projectId}/agents/legal`, {
    method: 'POST',
    body: { usageStatementId },
  });
  return response.data;
};

export const getOrchestratorStatus = async (projectId: string, usageStatementId: number) => {
  const [todosResponse, buttonStatesResponse, dashboardResponse] = await Promise.all([
    apiFetch<AgentTodoListResponse>(`/projects/${projectId}/agents/todos?usageStatementId=${usageStatementId}`),
    apiFetch<AgentButtonStatesResponse>(`/projects/${projectId}/agents/button-states?usageStatementId=${usageStatementId}`),
    apiFetch<unknown>(`/projects/${projectId}/agents/orchestrator/dashboard?usageStatementId=${usageStatementId}`).catch(() => null),
  ]);
  const todos = normalizeBackendAgentTodos(todosResponse.data);
  const buttonStates = buttonStatesResponse.data || {};
  const dashboard = dashboardResponse ? normalizeOrchestratorDashboard(dashboardResponse.data) : null;
  const legalAgent = dashboard?.agents.find((agent) => agent.agentTypeCode === 'legal');
  return {
    projectId: Number(projectId),
    usageStatementId,
    hasUsageStatementItems: true,
    hasReceiptsOrTaxInvoices: true,
    hasSitePhotos: true,
    classiReady: true,
    evidenceReviewReady: todos.length === 0,
    legalReady: Boolean(buttonStates.legal?.enabled),
    reportReady: Boolean(buttonStates.report?.enabled),
    legalResultCode: legalAgent?.resultCode ?? null,
    reportDisabledReason: buttonStates.report?.reason ?? null,
    agents: dashboard?.agents || [],
    logs: [],
    todos,
  };
};

export const getOrchestratorDashboard = async (projectId: string, usageStatementId?: number) => {
  const query = usageStatementId == null ? '' : `?usageStatementId=${usageStatementId}`;
  const response = await apiFetch<unknown>(`/projects/${projectId}/agents/orchestrator/dashboard${query}`);
  return normalizeOrchestratorDashboard(response.data);
};

export const getLatestValidation = async (projectId: string) => {
  const response = await apiFetch<Record<string, unknown>>(`/projects/${projectId}/validations/latest`);
  return response.data;
};

export const getValidationStatus = async (projectId: string, validationId: string) => {
  const response = await apiFetch<Record<string, unknown>>(`/projects/${projectId}/validations/${validationId}`);
  return response.data;
};

export const confirmValidation = async (projectId: string, validationId: string, input: { decision: string; comment?: string }) => {
  const response = await apiFetch<Record<string, unknown>>(`/projects/${projectId}/validations/${validationId}/confirm`, {
    method: 'POST',
    body: input,
  });
  return response.data;
};

export const listSafeLeeEvidenceRequirements = async (projectId: string, usageStatementId: number, itemId: string | number) => {
  const response = await apiFetch<{ itemId: number; requirements: EvidenceRequirementRecord[] }>(
    `/projects/${projectId}/usage-statements/${usageStatementId}/line-items/${itemId}/evidence-requirements`,
  );
  return response.data.requirements || [];
};

export const safeLeeRequirementsToMap = (itemId: string | number, requirements: EvidenceRequirementRecord[]): RequiredEvidenceMap => {
  const activeRequirements = requirements.filter((requirement) => requirement.isActive && !requirement.isSatisfied);
  if (!activeRequirements.length) return {};
  return {
    [String(itemId)]: activeRequirements.reduce<Partial<Record<FolderEvidenceCategory, string[]>>>((result, requirement) => {
      const category = backendEvidenceTypeToCategory(requirement.evidenceTypeCode);
      const kind: FolderEvidenceCategory = category === 'usage_statement' ? 'other_document' : category;
      result[kind] = [...(result[kind] || []), requirement.evidenceTypeCode];
      return result;
    }, {}),
  };
};
