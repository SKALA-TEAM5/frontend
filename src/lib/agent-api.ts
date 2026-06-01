import { apiFetch } from './api-client';
import { backendEvidenceTypeToCategory } from './archive-api';
import type { AgentLogStatusCode, AgentTypeCode } from './project-data';
import type { FolderEvidenceCategory } from '../types/domain';

export type AgentType = AgentTypeCode;

export interface AgentRunResponse {
  agentType: string;
  status: AgentLogStatusCode | string;
  logIds: number[];
  result: Record<string, unknown>;
}

export interface LawAgentRunResponse {
  workflow: string;
  status: AgentLogStatusCode | string;
  validationLogIds: number[];
  result: Record<string, unknown>;
}

export interface OcrWorkflowResponse {
  requestId: string;
  workflow: string;
  status: AgentLogStatusCode | string;
  validationLogIds: number[];
  usageStatementId: number | null;
  evidenceFileLinkId: number | null;
  result: Record<string, unknown>;
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
  logs: Array<Record<string, unknown>>;
  todos: OrchestratorTodo[];
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

export type RequiredEvidenceMap = Record<string, Partial<Record<FolderEvidenceCategory, string[]>>>;

type EvidenceRequirementRecord = {
  evidenceTypeCode: string;
  isSatisfied: boolean;
  isActive: boolean;
};

export const runAgent = async (
  projectId: string,
  agentType: AgentType,
  input: { usageStatementId: number; usageStatementItemId?: number | string; options?: Record<string, unknown> },
) => {
  const response = await apiFetch<AgentRunResponse>(`/projects/${projectId}/agents/${agentType}/run`, {
    method: 'POST',
    body: {
      usageStatementId: input.usageStatementId,
      usageStatementItemId: input.usageStatementItemId == null ? undefined : Number(input.usageStatementItemId),
      options: input.options,
    },
  });
  return response.data;
};

export const parseUsageStatementWithOcr = async (projectId: string, fileId: number | string) => {
  const response = await apiFetch<OcrWorkflowResponse>(`/projects/${projectId}/agents/ocr/usage-statements/parse`, {
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

export const getOrchestratorStatus = async (projectId: string, usageStatementId: number) => {
  const response = await apiFetch<unknown>(
    `/projects/${projectId}/agents/orchestrator/status?usageStatementId=${usageStatementId}`,
  );
  return normalizeOrchestratorStatus(response.data);
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
