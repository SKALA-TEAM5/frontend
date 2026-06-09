export type EvidenceCategory = 'receipt' | 'site_photo' | 'usage_statement' | 'tax_invoice' | 'other_document';
export type FolderEvidenceCategory = Exclude<EvidenceCategory, 'usage_statement'>;
export type BackendEvidenceTypeCode =
  | 'receipt'
  | 'tax_invoice'
  | 'tax_invoice_confirm'
  | 'third_party_lookup'
  | 'transaction_statement'
  | 'site_photo'
  | 'item_photo'
  | 'wearing_photo'
  | 'work_photo'
  | 'appointment_report'
  | 'pay_stub'
  | 'wage_statement'
  | 'work_log'
  | 'daily_output_log'
  | 'inspection_log'
  | 'supply_ledger'
  | 'inventory_ledger'
  | 'edu_confirm'
  | 'edu_attendance'
  | 'transfer_confirm'
  | 'health_checkup_result'
  | 'health_checkup_contract'
  | 'tech_guidance_contract'
  | 'tech_guidance_report'
  | 'tech_guidance_photo'
  | 'usage_statement'
  | 'analysis_table'
  | 'purchase_detail'
  | 'other_document';

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
  statusCode?: string;
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

export type ArchiveEvidenceByKind = Partial<Record<FolderEvidenceCategory, EvidenceFile[]>>;
export type ArchiveLineItemMap = Record<string, ArchiveEvidenceByKind>;
export type ArchiveCategoryMap = Record<string, ArchiveLineItemMap>;

export interface ArchiveSeed {
  usage_statement: EvidenceFile[];
  categories: ArchiveCategoryMap;
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
  evidenceSummary?: {
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
