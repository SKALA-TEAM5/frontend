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

export interface LegalDetailResponse {
  agentTypeCode: string;
  statusCode: AgentLogStatusCode | string;
  resultCode?: string | null;
  reason?: string | null;
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
  classifierDetails?: Record<string, unknown> | null;
  details?: Record<string, unknown> | null;
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

interface AgentLogResponse {
  agentTypeCode?: string | null;
  agent_type_code?: string | null;
  statusCode?: string | null;
  status_code?: string | null;
  resultCode?: string | null;
  result_code?: string | null;
  reason?: string | null;
  details?: string | Record<string, unknown> | null;
  createdAt?: string | null;
  created_at?: string | null;
}

export interface AgentLogRecord {
  agentTypeCode: string;
  statusCode: string;
  resultCode: string | null;
  reason: string;
  details: Record<string, unknown> | null;
  createdAt: string;
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

const normalizeAgentLog = (log: AgentLogResponse): AgentLogRecord => ({
  agentTypeCode: String(log.agentTypeCode ?? log.agent_type_code ?? ''),
  statusCode: String(log.statusCode ?? log.status_code ?? ''),
  resultCode: log.resultCode ?? log.result_code ?? null,
  reason: String(log.reason ?? ''),
  details: parseDetails(log.details),
  createdAt: String(log.createdAt ?? log.created_at ?? ''),
});

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

export const getLegalDetail = async (projectId: string, usageStatementId: number) => {
  const response = await apiFetch<LegalDetailResponse>(
    `/projects/${projectId}/agents/legal?usageStatementId=${usageStatementId}`,
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

export const getAgentLogs = async (projectId: string, usageStatementId?: number) => {
  const query = usageStatementId ? `?usageStatementId=${usageStatementId}` : '';
  const response = await apiFetch<AgentLogResponse[]>(`/projects/${projectId}/agents/logs${query}`);
  return (response.data || []).map(normalizeAgentLog);
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

const normalizeAgentTypeCode = (value?: string | null) => String(value || '').replace(/[_\s]/g, '-').toLowerCase();
const isSuccessfulAgentState = (agent?: OrchestratorDashboardAgent) => {
  if (!agent)
    return false;
  const statusCode = String(agent.statusCode || '').toLowerCase();
  const resultCode = String(agent.resultCode || '').toLowerCase();
  return statusCode === 'success' && (resultCode === 'success' || resultCode === 'hil');
};
const getAgentsByType = (agents: OrchestratorDashboardAgent[], typeCode: string) => {
  const normalizedType = normalizeAgentTypeCode(typeCode);
  return agents.filter((agent) => normalizeAgentTypeCode(agent.agentTypeCode) === normalizedType);
};
const logsToDashboardAgents = (logs: AgentLogRecord[], usageStatementId: number): OrchestratorDashboardAgent[] => {
  const latestByType = new Map<string, AgentLogRecord>();
  for (const log of logs) {
    const typeCode = normalizeAgentTypeCode(log.agentTypeCode);
    if (typeCode && !latestByType.has(typeCode)) {
      latestByType.set(typeCode, log);
    }
  }
  return Array.from(latestByType.values()).map((log) => ({
    agentTypeCode: normalizeAgentTypeCode(log.agentTypeCode),
    statusCode: log.statusCode || null,
    resultCode: log.resultCode,
    usageStatementId,
    token: 0,
    reason: log.reason || null,
  }));
};
const areOptionalAgentsReady = (agents: OrchestratorDashboardAgent[], typeCode: string) => {
  const typedAgents = getAgentsByType(agents, typeCode);
  return typedAgents.length === 0 || typedAgents.every(isSuccessfulAgentState);
};
const hasRequiredValidateAgentReady = (agents: OrchestratorDashboardAgent[]) => {
  const safetyDocAgents = [
    ...getAgentsByType(agents, 'safety-doc'),
    ...getAgentsByType(agents, 'safety-docs'),
  ];
  const safetyDocReady = safetyDocAgents.some(isSuccessfulAgentState);
  return safetyDocReady
    && areOptionalAgentsReady(agents, 'link')
    && areOptionalAgentsReady(agents, 'vision');
};

export const getOrchestratorStatus = async (projectId: string, usageStatementId: number) => {
  const [todosResponse, buttonStatesResponse, logs] = await Promise.all([
    apiFetch<AgentTodoListResponse>(`/projects/${projectId}/agents/todos?usageStatementId=${usageStatementId}`),
    apiFetch<AgentButtonStatesResponse>(`/projects/${projectId}/agents/button-states?usageStatementId=${usageStatementId}`),
    getAgentLogs(projectId, usageStatementId),
  ]);
  const todos = normalizeBackendAgentTodos(todosResponse.data);
  const buttonStates = buttonStatesResponse.data || {};
  const agents = logsToDashboardAgents(logs, usageStatementId);
  const legalAgent = getAgentsByType(agents, 'legal')[0];
  const validationAgentsReady = hasRequiredValidateAgentReady(agents);
  const legalReady = Boolean(buttonStates.legal?.enabled) || validationAgentsReady;
  return {
    projectId: Number(projectId),
    usageStatementId,
    hasUsageStatementItems: true,
    hasReceiptsOrTaxInvoices: true,
    hasSitePhotos: true,
    classiReady: true,
    evidenceReviewReady: todos.length === 0,
    legalReady,
    reportReady: Boolean(buttonStates.report?.enabled),
    legalResultCode: legalAgent?.resultCode ?? null,
    legalDisabledReason: legalReady ? null : buttonStates.legal?.reason ?? null,
    reportDisabledReason: buttonStates.report?.reason ?? null,
    agents,
    logs,
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
  const logs = await getAgentLogs(projectId, usageStatementId);
  const agents = logsToDashboardAgents(logs, usageStatementId ?? 0);
  const statusCounts = logs.reduce<Record<string, number>>((result, log) => ({
    ...result,
    [log.statusCode]: (result[log.statusCode] || 0) + 1,
  }), {});
  const resultCounts = logs.reduce<Record<string, number>>((result, log) => {
    if (!log.resultCode) return result;
    return {
      ...result,
      [log.resultCode]: (result[log.resultCode] || 0) + 1,
    };
  }, {});
  return {
    projectId: Number(projectId),
    usageStatementId: usageStatementId ?? null,
    totalLogs: logs.length,
    totalToken: 0,
    statusCounts,
    resultCounts,
    hilAgents: agents.filter((agent) => agent.resultCode === 'hil').map((agent) => agent.agentTypeCode),
    agents,
  };
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
