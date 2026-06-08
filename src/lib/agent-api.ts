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
  legalDisabledReason?: string | null;
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

interface AgentWarningResponse {
  agentTypeCode?: string | null;
  agent_type_code?: string | null;
  usageStatementItemId?: number | null;
  usage_statement_item_id?: number | null;
  fileId?: number | null;
  file_id?: number | null;
  reason?: string | null;
  details?: string | Record<string, unknown> | null;
}

export interface VisionValidationResult {
  status: 'suitable' | 'unsuitable';
  checkedAt: string;
  itemName: string;
  summary: string;
  detections: Array<{ label: string; confidence: number; box: [number, number, number, number]; status?: 'ok' | 'bad' }>;
}

const readField = <T = unknown>(source: Record<string, unknown>, camelKey: string, snakeKey: string): T | undefined =>
  (source[camelKey] ?? source[snakeKey]) as T | undefined;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

const parseDetails = (value: unknown): Record<string, unknown> | null => {
  if (typeof value === 'string') {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return asRecord(value);
};

const readNumberField = (source: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = source[key];
    const numberValue = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
    if (Number.isFinite(numberValue))
      return numberValue;
  }
  return undefined;
};

const normalizeBox = (bbox: unknown, imageWidth?: number, imageHeight?: number): [number, number, number, number] | null => {
  const values = asArray(bbox).map((value) => Number(value));
  if (values.length < 4 || values.some((value) => !Number.isFinite(value)))
    return null;
  const [x1, y1, x2, y2] = values;
  if (Math.max(x1, y1, x2, y2) <= 1) {
    return [x1 * 100, y1 * 100, Math.max(0, x2 - x1) * 100, Math.max(0, y2 - y1) * 100];
  }
  if (imageWidth && imageHeight) {
    return [
      Math.max(0, Math.min(100, (x1 / imageWidth) * 100)),
      Math.max(0, Math.min(100, (y1 / imageHeight) * 100)),
      Math.max(0, Math.min(100, ((x2 - x1) / imageWidth) * 100)),
      Math.max(0, Math.min(100, ((y2 - y1) / imageHeight) * 100)),
    ];
  }
  return [x1, y1, Math.max(0, x2 - x1), Math.max(0, y2 - y1)];
};

const extractVisionValidationFromResult = (rawResult: unknown, fallbackReason?: string | null): { fileId?: string; result: VisionValidationResult } | null => {
  const result = asRecord(rawResult);
  if (!result)
    return null;
  const nestedResult = asRecord(result.result) || result;
  const imageWidth = readNumberField(nestedResult, ['image_width', 'imageWidth', 'width']);
  const imageHeight = readNumberField(nestedResult, ['image_height', 'imageHeight', 'height']);
  const detections = asArray(nestedResult.detections).flatMap((rawDetection) => {
    const detection = asRecord(rawDetection);
    if (!detection)
      return [];
    const box = normalizeBox(detection.bbox_xyxy ?? detection.bboxXyxy ?? detection.box, imageWidth, imageHeight);
    if (!box)
      return [];
    const needsReview = Boolean(detection.needs_review ?? detection.needsReview);
    const isWearing = detection.is_wearing ?? detection.isWearing;
    return [{
      label: String(detection.label || detection.equipment_label || detection.equipmentLabel || '검출 결과'),
      confidence: readNumberField(detection, ['confidence', 'score']) ?? 0,
      box,
      status: needsReview || isWearing === false ? 'bad' as const : 'ok' as const,
    }];
  });
  const isAppropriate = result.is_appropriate ?? result.isAppropriate ?? nestedResult.is_appropriate ?? nestedResult.isAppropriate;
  const hasBadDetection = detections.some((detection) => detection.status === 'bad');
  const status: VisionValidationResult['status'] = isAppropriate === false || hasBadDetection ? 'unsuitable' : 'suitable';
  return {
    fileId: String(result.file_id ?? result.fileId ?? ''),
    result: {
      status,
      checkedAt: new Date().toISOString(),
      itemName: String(result.item_name || result.itemName || result.original_filename || result.originalFilename || '현장사진'),
      summary: String(result.message || result.reason || fallbackReason || (status === 'unsuitable' ? '현장사진 검증 결과 보완 필요' : '현장사진 검증 결과 적합')),
      detections,
    },
  };
};

const extractVisionValidationResults = (warning: AgentWarningResponse): Record<string, VisionValidationResult> => {
  const details = parseDetails(warning.details);
  if (!details)
    return {};
  const payload = asRecord(details.payload) || {};
  const visionResponse = asRecord(payload.vision_response) || asRecord(payload.visionResponse) || details;
  const visionDetails = asRecord(visionResponse.details) || visionResponse;
  const candidateResults = [
    ...asArray(visionDetails.results),
    ...asArray(asRecord(visionDetails.result)?.results),
    ...asArray(asRecord(payload.vision_response)?.results),
  ];
  return Object.fromEntries(candidateResults.flatMap((result) => {
    const validation = extractVisionValidationFromResult(result, warning.reason);
    return validation?.fileId ? [[validation.fileId, validation.result]] : [];
  }));
};

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
    legalDisabledReason: (readField(source, 'legalDisabledReason', 'legal_disabled_reason') as string | undefined) ?? null,
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
    legalDisabledReason: buttonStates.legal?.reason ?? null,
    reportDisabledReason: buttonStates.report?.reason ?? null,
    agents: dashboard?.agents || [],
    logs: [],
    todos,
  };
};

export const getVisionValidationResults = async (projectId: string, usageStatementId: number) => {
  const response = await apiFetch<AgentWarningResponse[]>(`/projects/${projectId}/agents/warnings?usageStatementId=${usageStatementId}`);
  const warnings = response.data || [];
  return warnings
    .filter((warning) => String(readField(warning as Record<string, unknown>, 'agentTypeCode', 'agent_type_code') || '') === 'vision')
    .reduce<Record<string, VisionValidationResult>>((result, warning) => ({ ...result, ...extractVisionValidationResults(warning) }), {});
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
