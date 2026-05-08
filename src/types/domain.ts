import type { UserRole } from '../lib/permissions';
import type { ProjectStatus } from '../lib/project-data';

export type EvidenceCategory = 'receipt' | 'site_photo' | 'usage_statement' | 'tax_invoice' | 'other_document';
export type FolderEvidenceCategory = Exclude<EvidenceCategory, 'usage_statement'>;

export interface EvidenceFile {
  id: string;
  fileId?: number | string;
  linkId?: number | string;
  name: string;
  kind: EvidenceCategory;
  description?: string;
  amount?: string;
  previewUrl?: string;
  uploadedAt?: string;
  uploadedBy?: string;
  documentType?: string;
  categoryIds?: number[];
  usageItemIds?: string[];
  visionValidation?: {
    status: 'suitable' | 'unsuitable';
    checkedAt: string;
    itemName: string;
    summary: string;
    detections: Array<{ label: string; confidence: number; box: [number, number, number, number]; status?: 'ok' | 'bad' }>;
  };
}

export interface ContractInfo {
  name: string;
  num: string;
  project?: string;
  period?: string;
  round?: string;
  planned?: string;
  accumulated?: string;
}

export type ArchiveEvidenceByKind = Partial<Record<FolderEvidenceCategory, EvidenceFile[]>>;
export type ArchiveLineItemMap = Record<string, ArchiveEvidenceByKind>;
export type ArchiveCategoryMap = Record<string, ArchiveLineItemMap>;

export interface ArchiveSeed {
  usage_statement: EvidenceFile[];
  categories: ArchiveCategoryMap;
}

export interface ValidationSummary {
  totalUsed: number;
  totalSettled: number;
  totalTax: number;
}

export interface ReportRow {
  id: number;
  cat: string;
  status: 'ok' | 'warn' | 'error';
  used: number;
  tax: number;
  settled: number;
  note: string;
}

export type ValidationDecision = 'appropriate' | 'conditional' | 'inappropriate';
export type ValidationRiskLevel = 'low' | 'medium' | 'high';

export interface ValidationProblemFile {
  fileId?: string;
  fileName: string;
  kind: EvidenceCategory;
  reason: string;
}

export interface ValidationLegalBasis {
  lawName: string;
  article?: string;
  clause?: string;
  summary: string;
  agentReasoning: string;
}

export interface ValidationIssue {
  title: string;
  description: string;
  problemFileNames: string[];
  requiredAction: string;
  recommendedFiles: string[];
}

export interface CategoryValidationResult {
  categoryId: number;
  categoryName: string;
  usageAmount: number;
  recognizedAmount: number;
  disputedAmount: number;
  decision: ValidationDecision;
  riskLevel: ValidationRiskLevel;
  evidenceSummary: {
    requiredTypes: string[];
    submittedFiles: Pick<EvidenceFile, 'id' | 'name' | 'kind'>[];
    missingTypes: string[];
    problematicFiles: ValidationProblemFile[];
  };
  legalBasis: ValidationLegalBasis[];
  issues: ValidationIssue[];
}

export interface ValidationDashboardResult {
  id: string;
  checkedAt: string;
  usageStatementFile: string;
  lawAgent: {
    name: string;
    version: string;
    basis: string;
  };
  categories: CategoryValidationResult[];
}

export type ValidationStatus = 'not_started' | 'running' | 'completed' | 'needs_action';

export type ActionRequestStatus = 'open' | 'supplement_uploaded' | 'resolved';

export type ReportStatus = 'not_requested' | 'drafting' | 'reviewing' | 'finalized';

export type ActivityTargetType = 'project' | 'evidence' | 'validation' | 'action_request' | 'report';

export interface ProjectEvidenceState {
  projectId: string;
  category: EvidenceCategory;
  files: EvidenceFile[];
}

export interface ProjectValidationState {
  projectId: string;
  status: ValidationStatus;
  resultIds: string[];
  confirmedAt?: string;
  confirmedBy?: string;
}

export interface ProjectActionRequest {
  id: string;
  projectId: string;
  title: string;
  status: ActionRequestStatus;
  requestedBy: string;
  assignee?: string;
  dueDate?: string;
  reason?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface ProjectReportState {
  projectId: string;
  status: ReportStatus;
  rows: ReportRow[];
  version: number;
  finalizedAt?: string;
  finalizedBy?: string;
}

export interface ActivityLogEntry {
  id: string;
  projectId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  targetType: ActivityTargetType;
  targetId: string;
  reason?: string;
  createdAt: string;
}

export interface StatusHistoryEntry {
  id: string;
  projectId: string;
  actorName: string;
  actorRole: UserRole;
  targetType: ActivityTargetType;
  targetId: string;
  fromStatus?: ProjectStatus | ValidationStatus | ActionRequestStatus | ReportStatus;
  toStatus: ProjectStatus | ValidationStatus | ActionRequestStatus | ReportStatus;
  reason?: string;
  createdAt: string;
}
