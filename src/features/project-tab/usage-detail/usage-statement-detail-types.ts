import type { FolderEvidenceCategory } from '../../../types/domain';

export type AddUsageItemDraft = {
  name: string;
  date: string;
  unit: string;
  quantity: string;
  unitPrice: string;
};

export type ClassificationMoveNotice = {
  id: string;
  itemName: string;
  fromCategoryName: string;
  toCategoryName: string;
  categoryChanged?: boolean;
  reason?: string;
};

export type ClassiRejectedNotice = {
  itemName: string;
  fromCategoryName: string;
  toCategoryName: string;
  reason: string;
};

export type UsageDetailTodoSource = 'matching' | 'vision' | 'law';

export type UsageDetailTodoItem = {
  id: string;
  backendTodoId?: number | null;
  backendConfirmed?: boolean;
  backendAgentTypeCode?: string | null;
  backendCategoryName?: string | null;
  mode: 'add' | 'remove';
  source: UsageDetailTodoSource;
  kind: FolderEvidenceCategory;
  requiredEvidenceTypeCode?: string;
  requiredEvidenceTypeName?: string;
  title: string;
  context: string;
  categoryId?: number;
  usageItemId?: string;
  detail?: string;
};

export type UsageDetailVerificationStep = 'ocr' | 'safety' | 'vision';

export type UsageDetailLoadingMessage = {
  title: string;
  body: string;
};
