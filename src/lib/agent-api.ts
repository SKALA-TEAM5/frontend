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
