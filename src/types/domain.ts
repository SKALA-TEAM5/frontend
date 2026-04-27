import type { UserRole } from '../lib/permissions';
import type { ProjectStatus } from '../lib/project-data';
import type { ProjectStageId } from '../lib/project-stages';

export type EvidenceCategory = 'receipt' | 'site_photo' | 'usage_statement' | 'tax_invoice';
export type FolderEvidenceCategory = Exclude<EvidenceCategory, 'usage_statement'>;

export interface EvidenceFile {
  id: string;
  name: string;
  kind: EvidenceCategory;
  description?: string;
  amount?: string;
  previewUrl?: string;
  uploadedAt?: string;
  categoryIds?: number[];
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

export type ArchiveCategoryMap = Record<string, EvidenceFile[]>;

export interface ArchiveSeed {
  receipt: ArchiveCategoryMap;
  site_photo: ArchiveCategoryMap;
  usage_statement: EvidenceFile[];
  tax_invoice: ArchiveCategoryMap;
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

export type ValidationStatus = 'not_started' | 'running' | 'completed' | 'needs_action';

export type ActionRequestStatus = 'open' | 'supplement_uploaded' | 'resolved';

export type ReportStatus = 'not_requested' | 'drafting' | 'reviewing' | 'finalized';

export type ActivityTargetType = 'project' | 'stage' | 'evidence' | 'validation' | 'action_request' | 'report';

export interface ProjectStageState {
  id: ProjectStageId;
  label: string;
  status: 'pending' | 'active' | 'completed' | 'blocked';
  changedAt?: string;
}

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
