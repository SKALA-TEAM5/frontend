import { apiFetch, apiUrl } from './api-client';
import { CATS, createDefaultArchiveData, makeEntry, type UsageLineItem } from './evidence-utils';
import type { MonthlyUsageStatementSummary } from './project-data';
import type { ArchiveSeed, BackendEvidenceTypeCode, EvidenceCategory, EvidenceFile, FolderEvidenceCategory } from '../types/domain';

interface LatestUsageStatementResponse {
  projectId: number;
  statement: UsageStatementDetailResponse | null;
}

interface UsageStatementListResponse {
  projectId: number;
  items: UsageStatementListItemResponse[];
}

interface UsageStatementListItemResponse {
  id: number;
  reportMonth: string | null;
  revisionNo: number | null;
  documentWrittenDate: string | null;
  cumulativeProgressRate: number | string | null;
  summaryCount: number;
  itemCount: number;
  linkedEvidenceFileCount: number;
  unsatisfiedRequirementCount: number;
}

interface ProjectFileListResponse {
  projectId: number;
  items: ProjectFileResponse[];
}

interface ProjectFileResponse {
  fileId: number;
  uploadedEvidenceTypeCode: BackendEvidenceTypeCode | string;
  uploadedEvidenceTypeName: string;
  originalFilename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  capturedAt: string | null;
  uploadedAt: string | null;
  linkedItemCount: number;
}

interface ProjectFileUploadResponse {
  fileId: number;
  originalFilename: string;
  uploadedEvidenceTypeCode: BackendEvidenceTypeCode | string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedAt: string | null;
}

interface ArchiveCategoryListResponse {
  projectId: number;
  uncheckedMatchedFileCount: number;
  items: ArchiveCategoryResponse[];
}

interface ArchiveCategoryResponse {
  categoryCode: string;
  categoryName: string;
  itemCount: number;
  linkedFileCount: number;
  linkCount: number;
  uncheckedMatchedFileCount: number;
  unsatisfiedRequirementCount: number;
}

interface ArchiveItemListResponse {
  projectId: number;
  categoryCode: string;
  items: ArchiveItemResponse[];
}

interface ArchiveItemResponse {
  itemId: number;
  usageStatementId: number;
  reportMonth: string | null;
  usedOn: string | null;
  itemName: string;
  unit: string | null;
  quantity: number | string | null;
  unitPrice: number | string | null;
  totalAmount: number | string | null;
  remark: string | null;
  pageNo: number | null;
  linkedFileCount: number;
  uncheckedMatchedFileCount: number;
  unsatisfiedRequirementCount: number;
}

interface ItemEvidenceFilesResponse {
  projectId: number;
  itemId: number;
  files: EvidenceFileResponse[];
  requirements: RequirementResponse[];
}

interface EvidenceLinkResponse {
  linkId: number;
}

interface SourceFileResponse {
  fileId: number;
  originalFilename: string;
  evidenceTypeCode: BackendEvidenceTypeCode | string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedAt: string | null;
}

interface UsageStatementSummaryResponse {
  categoryCode: string;
  categoryName: string;
  previousAmount: number | string | null;
  currentAmount: number | string | null;
  cumulativeAmount: number | string | null;
}

interface EvidenceFileResponse {
  linkId: number;
  fileId: number;
  evidenceTypeCode: BackendEvidenceTypeCode | string;
  evidenceTypeName: string;
  originalFilename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  capturedAt: string | null;
  uploadedAt: string | null;
}

interface RequirementResponse {
  evidenceTypeCode: BackendEvidenceTypeCode | string;
  evidenceTypeName: string;
  satisfied: boolean;
}

interface UsageStatementItemResponse {
  itemId: number;
  categoryCode: string;
  categoryName: string;
  usedOn: string | null;
  itemName: string;
  unit: string | null;
  quantity: number | string | null;
  unitPrice: number | string | null;
  totalAmount: number | string | null;
  remark: string | null;
  pageNo: number | null;
  evidenceFiles: EvidenceFileResponse[];
  requirements: RequirementResponse[];
}

interface UsageStatementDetailResponse {
  id: number;
  reportMonth: string | null;
  revisionNo: number | null;
  documentWrittenDate: string | null;
  cumulativeProgressRate: number | string | null;
  sourceFile: SourceFileResponse | null;
  summaries: UsageStatementSummaryResponse[];
  items: UsageStatementItemResponse[];
}

export interface UsageStatementArchiveData {
  archiveSeed: ArchiveSeed;
  usageItems: UsageLineItem[];
  overviewRows: Array<[string, string, string, string]>;
  statementSummary: MonthlyUsageStatementSummary;
}

export type SafetyDocAgentRequiredEvidence = Partial<Record<FolderEvidenceCategory, string[]>>;
export type SafetyDocAgentRequiredEvidenceMap = Record<string, SafetyDocAgentRequiredEvidence>;

interface SafetyDocAgentRequirementResponse {
  usageStatementItemId?: number | string | null;
  itemId?: number | string | null;
  evidenceTypeCode?: string | null;
  evidenceTypeName?: string | null;
  requiredFileName?: string | null;
  requiredEvidenceName?: string | null;
  requiredDocumentName?: string | null;
  name?: string | null;
}

interface SafetyDocAgentMatchResponse {
  requiredEvidenceByLine?: SafetyDocAgentRequiredEvidenceMap;
  requirements?: SafetyDocAgentRequirementResponse[];
}

const formatMonthLabel = (monthKey: string) => {
  const [year, month] = monthKey.split('-');
  return `${year}년 ${Number(month)}월`;
};

const formatDate = (value?: string | null) => value?.slice(0, 10) || '-';

const formatMoney = (value?: number | string | null) => {
  if (value == null || value === '') return '-';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString('ko-KR') : String(value);
};

const toAmount = (value?: number | string | null) => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

const categoryCodeToId = (categoryCode?: string | null) => {
  const match = categoryCode?.match(/\d+/);
  return match ? Number(match[0]) : 0;
};

export const BACKEND_EVIDENCE_TYPE_CODES: BackendEvidenceTypeCode[] = [
  'receipt',
  'tax_invoice',
  'tax_invoice_confirm',
  'third_party_lookup',
  'transaction_statement',
  'site_photo',
  'item_photo',
  'wearing_photo',
  'work_photo',
  'appointment_report',
  'pay_stub',
  'work_log',
  'daily_output_log',
  'inspection_log',
  'supply_ledger',
  'inventory_ledger',
  'edu_confirm',
  'edu_attendance',
  'transfer_confirm',
  'health_checkup_result',
  'health_checkup_contract',
  'tech_guidance_contract',
  'tech_guidance_report',
  'tech_guidance_photo',
  'usage_statement',
  'analysis_table',
  'purchase_detail',
  'other_document',
];

const isBackendEvidenceTypeCode = (code?: string | null): code is BackendEvidenceTypeCode =>
  Boolean(code && (BACKEND_EVIDENCE_TYPE_CODES as string[]).includes(code));

export const backendEvidenceTypeToCategory = (code?: string | null): EvidenceCategory => {
  if (!isBackendEvidenceTypeCode(code)) return 'other_document';
  if (code === 'receipt') return 'receipt';
  if (code === 'usage_statement') return 'usage_statement';
  if (code === 'tax_invoice' || code === 'tax_invoice_confirm' || code === 'third_party_lookup') return 'tax_invoice';
  if (code === 'site_photo' || code === 'item_photo' || code === 'wearing_photo' || code === 'work_photo' || code === 'tech_guidance_photo') return 'site_photo';
  return 'other_document';
};

const evidenceCodeToKind = (code?: string | null): FolderEvidenceCategory => {
  const category = backendEvidenceTypeToCategory(code);
  return category === 'usage_statement' ? 'other_document' : category;
};

const kindToEvidenceCode = (kind: EvidenceCategory): BackendEvidenceTypeCode => {
  if (kind === 'tax_invoice') return 'tax_invoice';
  return kind;
};

const projectFileCodeToKind = (code?: string | null): EvidenceCategory => {
  return backendEvidenceTypeToCategory(code);
};

const filePath = (projectId: string, fileId: number | string, action: 'preview' | 'download') => `/projects/${projectId}/files/${fileId}/${action}`;

export const getProjectFilePreviewUrl = (projectId: string, fileId: number | string) => apiUrl(filePath(projectId, fileId, 'preview'));

export const getProjectFileDownloadUrl = (projectId: string, fileId: number | string) => apiUrl(filePath(projectId, fileId, 'download'));

export const createEmptyEvidenceBuckets = (): Record<EvidenceCategory, EvidenceFile[]> => ({
  receipt: [],
  site_photo: [],
  usage_statement: [],
  tax_invoice: [],
  other_document: [],
});

const putArchiveFile = (archive: ArchiveSeed, catId: number, usageItemId: string, kind: FolderEvidenceCategory, file: EvidenceFile) => {
  archive.categories[String(catId)] = {
    ...(archive.categories[String(catId)] || {}),
    [usageItemId]: {
      ...(archive.categories[String(catId)]?.[usageItemId] || {}),
      [kind]: [...(archive.categories[String(catId)]?.[usageItemId]?.[kind] || []), file],
    },
  };
};

const sourceFileToEvidence = (sourceFile: SourceFileResponse): EvidenceFile =>
  makeEntry(sourceFile.originalFilename || '사용내역서', 'usage_statement', {
    id: `usage-statement-file-${sourceFile.fileId}`,
    fileId: sourceFile.fileId,
    uploadedAt: formatDate(sourceFile.uploadedAt),
    uploadedBy: '',
    categoryIds: [],
    usageItemIds: [],
  });

const evidenceFileToEntry = (projectId: string, file: EvidenceFileResponse, kind: EvidenceCategory, catId: number, usageItemId: string): EvidenceFile =>
  makeEntry(file.originalFilename || `file-${file.fileId}`, kind, {
    id: `evidence-link-${file.linkId || file.fileId}`,
    fileId: file.fileId,
    linkId: file.linkId,
    uploadedAt: formatDate(file.uploadedAt),
    uploadedBy: '',
    documentType: file.evidenceTypeName,
    previewUrl: file.mimeType?.startsWith('image/') ? getProjectFilePreviewUrl(projectId, file.fileId) : '',
    categoryIds: [catId],
    usageItemIds: [usageItemId],
  });

const projectFileToEntry = (projectId: string, file: ProjectFileResponse | ProjectFileUploadResponse): EvidenceFile => {
  const fileId = file.fileId;
  const kind = projectFileCodeToKind(file.uploadedEvidenceTypeCode);
  return makeEntry(file.originalFilename || `file-${fileId}`, kind, {
    id: `project-file-${fileId}`,
    fileId,
    uploadedAt: formatDate(file.uploadedAt),
    uploadedBy: '',
    documentType: 'uploadedEvidenceTypeName' in file ? file.uploadedEvidenceTypeName : undefined,
    previewUrl: file.mimeType?.startsWith('image/') ? getProjectFilePreviewUrl(projectId, fileId) : '',
    categoryIds: [],
    usageItemIds: [],
  });
};

const buildOverviewRows = (summaries: UsageStatementSummaryResponse[]) => {
  const rows = CATS.map((cat) => {
    const summary = summaries.find((item) => categoryCodeToId(item.categoryCode) === cat.id);
    return [
      `${cat.id}. ${summary?.categoryName || cat.label}`,
      formatMoney(summary?.previousAmount),
      formatMoney(summary?.currentAmount),
      formatMoney(summary?.cumulativeAmount),
    ] as [string, string, string, string];
  });
  const totals = summaries.reduce((acc, item) => ({
    previous: acc.previous + toAmount(item.previousAmount),
    current: acc.current + toAmount(item.currentAmount),
    cumulative: acc.cumulative + toAmount(item.cumulativeAmount),
  }), { previous: 0, current: 0, cumulative: 0 });
  return [...rows, ['계', formatMoney(totals.previous), formatMoney(totals.current), formatMoney(totals.cumulative)] as [string, string, string, string]];
};

const buildStatementSummary = (statement: UsageStatementDetailResponse): MonthlyUsageStatementSummary => {
  const month = statement.reportMonth || new Date().toISOString().slice(0, 7);
  const evidenceCount = statement.items.reduce((sum, item) => sum + (item.evidenceFiles?.length || 0), 0);
  const issueCount = statement.items.reduce((sum, item) => sum + (item.requirements || []).filter((requirement) => !requirement.satisfied).length, 0);
  const currentAmount = statement.summaries.reduce((sum, item) => sum + toAmount(item.currentAmount), 0);
  const cumulativeAmount = statement.summaries.reduce((sum, item) => sum + toAmount(item.cumulativeAmount), 0);
  return {
    month,
    label: formatMonthLabel(month),
    sourceFileName: statement.sourceFile?.originalFilename || '-',
    revisionNo: statement.revisionNo || 1,
    documentWrittenDate: statement.documentWrittenDate || '-',
    uploadedAt: formatDate(statement.sourceFile?.uploadedAt),
    uploadedBy: '-',
    parseStatus: statement.sourceFile ? '파싱 완료' : '-',
    validationStatus: issueCount > 0 ? '확인 필요' : '미검증',
    currentAmount: formatMoney(currentAmount),
    cumulativeAmount: formatMoney(cumulativeAmount),
    evidenceCount,
    issueCount,
  };
};

const toArchiveData = (projectId: string, statement: UsageStatementDetailResponse): UsageStatementArchiveData => {
  const archiveSeed = createDefaultArchiveData();
  if (statement.sourceFile) {
    archiveSeed.usage_statement = [sourceFileToEvidence(statement.sourceFile)];
  }

  const usageItems = (statement.items || []).map((item) => {
    const catId = categoryCodeToId(item.categoryCode);
    const usageItemId = String(item.itemId);
    (item.evidenceFiles || []).forEach((file) => {
      const kind = evidenceCodeToKind(file.evidenceTypeCode);
      putArchiveFile(archiveSeed, catId, usageItemId, kind, evidenceFileToEntry(projectId, file, kind, catId, usageItemId));
    });
    return {
      id: usageItemId,
      categoryId: catId,
      name: item.itemName || '-',
      amount: toAmount(item.totalAmount),
    };
  }).filter((item) => item.categoryId > 0);

  return {
    archiveSeed,
    usageItems,
    overviewRows: buildOverviewRows(statement.summaries || []),
    statementSummary: buildStatementSummary(statement),
  };
};

export const getLatestUsageStatementArchive = async (projectId: string) => {
  const response = await apiFetch<LatestUsageStatementResponse>(`/projects/${projectId}/usage-statements/latest`);
  if (!response.data.statement) return null;
  return toArchiveData(projectId, response.data.statement);
};

export const getUsageStatementArchiveByMonth = async (projectId: string, year: number, month: number) => {
  const response = await apiFetch<{ projectId: number; statement: UsageStatementDetailResponse }>(
    `/projects/${projectId}/usage-statements/by-month?year=${year}&month=${month}`,
  );
  return toArchiveData(projectId, response.data.statement);
};

export const listUsageStatementArchives = async (projectId: string) => {
  const response = await apiFetch<UsageStatementListResponse>(`/projects/${projectId}/usage-statements`);
  const items = response.data.items || [];
  const archives = await Promise.all(items.map(async (item) => {
    const reportMonth = item.reportMonth?.slice(0, 7);
    if (!reportMonth) return null;
    const [yearText, monthText] = reportMonth.split('-');
    const year = Number(yearText);
    const month = Number(monthText);
    if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
    return getUsageStatementArchiveByMonth(projectId, year, month).catch(() => null);
  }));
  return archives.filter((item): item is UsageStatementArchiveData => Boolean(item));
};

export const listProjectFiles = async (projectId: string) => {
  const response = await apiFetch<ProjectFileListResponse>(`/projects/${projectId}/files?size=200`);
  return response.data.items.reduce((buckets, file) => {
    const entry = projectFileToEntry(projectId, file);
    buckets[entry.kind].push(entry);
    return buckets;
  }, createEmptyEvidenceBuckets());
};

export const uploadProjectFile = async (projectId: string, file: File, kind: EvidenceCategory) => {
  const formData = new FormData();
  formData.set('evidenceTypeCode', kindToEvidenceCode(kind));
  formData.set('file', file);
  const response = await apiFetch<ProjectFileUploadResponse>(`/projects/${projectId}/files`, {
    method: 'POST',
    body: formData,
  });
  return projectFileToEntry(projectId, response.data);
};

export const deleteProjectFile = async (projectId: string, fileId: number | string) => {
  await apiFetch<null>(`/projects/${projectId}/files/${fileId}`, {
    method: 'DELETE',
  });
};

export const linkEvidenceFile = async (projectId: string, itemId: string, fileId: number | string, kind: FolderEvidenceCategory) => {
  const response = await apiFetch<EvidenceLinkResponse>(`/projects/${projectId}/usage-statement-items/${itemId}/evidence-files`, {
    method: 'POST',
    body: {
      fileId: Number(fileId),
      evidenceTypeCode: kindToEvidenceCode(kind),
    },
  });
  return response.data;
};

export const moveEvidenceFileLink = async (projectId: string, linkId: number | string, targetItemId: string, kind: FolderEvidenceCategory) => {
  const response = await apiFetch<EvidenceLinkResponse>(`/projects/${projectId}/evidence-file-links/${linkId}`, {
    method: 'PATCH',
    body: {
      targetItemId: Number(targetItemId),
      evidenceTypeCode: kindToEvidenceCode(kind),
    },
  });
  return response.data;
};

export const deleteEvidenceFileLink = async (projectId: string, linkId: number | string) => {
  await apiFetch<null>(`/projects/${projectId}/evidence-file-links/${linkId}`, {
    method: 'DELETE',
  });
};

export const listArchiveCategories = async (projectId: string) => {
  const response = await apiFetch<ArchiveCategoryListResponse>(`/projects/${projectId}/archive/categories`);
  return response.data.items;
};

export const listArchiveCategoryItems = async (projectId: string, categoryCode: string) => {
  const response = await apiFetch<ArchiveItemListResponse>(`/projects/${projectId}/archive/categories/${categoryCode}/items`);
  return response.data.items;
};

export const listItemEvidenceFiles = async (projectId: string, itemId: string) => {
  const response = await apiFetch<ItemEvidenceFilesResponse>(`/projects/${projectId}/usage-statement-items/${itemId}/evidence-files`);
  return response.data;
};

export const getProjectArchiveFromCategories = async (projectId: string): Promise<Pick<UsageStatementArchiveData, 'archiveSeed' | 'usageItems'>> => {
  const categories = await listArchiveCategories(projectId);
  const itemGroups = await Promise.all(categories.map((category) => listArchiveCategoryItems(projectId, category.categoryCode)));
  const usageItems = itemGroups.flatMap((items, index) => items.map((item) => ({
    id: String(item.itemId),
    categoryId: categoryCodeToId(categories[index]?.categoryCode),
    name: item.itemName || '-',
    amount: toAmount(item.totalAmount),
  }))).filter((item) => item.categoryId > 0);
  const archiveSeed = createDefaultArchiveData();
  const usageFiles = await listProjectFiles(projectId);
  archiveSeed.usage_statement = usageFiles.usage_statement;
  await Promise.all(usageItems.map(async (item) => {
    const response = await listItemEvidenceFiles(projectId, item.id);
    response.files.forEach((file) => {
      const kind = evidenceCodeToKind(file.evidenceTypeCode);
      putArchiveFile(archiveSeed, item.categoryId, item.id, kind, evidenceFileToEntry(projectId, file, kind, item.categoryId, item.id));
    });
  }));
  return { archiveSeed, usageItems };
};

/*
 * TODO: 백엔드에 POST /projects/{projectId}/safety-doc-agent/match API가 추가되면 복구합니다.
 *
 * export const runSafetyDocAgentMatching = async (projectId: string): Promise<SafetyDocAgentRequiredEvidenceMap> => {
 *   const response = await apiFetch<SafetyDocAgentMatchResponse>(`/projects/${projectId}/safety-doc-agent/match`, {
 *     method: 'POST',
 *   });
 *
 *   if (response.data.requiredEvidenceByLine) {
 *     return response.data.requiredEvidenceByLine;
 *   }
 *
 *   return (response.data.requirements || []).reduce<SafetyDocAgentRequiredEvidenceMap>((result, item) => {
 *     const usageItemId = String(item.usageStatementItemId ?? item.itemId ?? '');
 *     const kind = evidenceCodeToKind(item.evidenceTypeCode);
 *     const requiredName = item.requiredFileName || item.requiredEvidenceName || item.requiredDocumentName || item.name || item.evidenceTypeName || '';
 *     if (!usageItemId || !requiredName) return result;
 *     result[usageItemId] = {
 *       ...(result[usageItemId] || {}),
 *       [kind]: [...(result[usageItemId]?.[kind] || []), requiredName],
 *     };
 *     return result;
 *   }, {});
 * };
 */
