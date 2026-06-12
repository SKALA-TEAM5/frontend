import { apiFetch, apiUrl } from './api-client';
import { CATS, calculateUsageLineAmount, createDefaultArchiveData, makeEntry, parseUsageNumber, type UsageLineItem } from './evidence-utils';
import { normalizeUsageWorkflowStatus, type FileStatusCode, type MonthlyUsageStatementSummary, type UsageWorkflowStatus } from './project-data';
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
  statusCode: string | null;
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
  statusCode: FileStatusCode | string;
  linkedItemCount: number;
  visionDetections?: VisionDetectionsResponse | null;
}

interface ProjectFileUploadResponse {
  fileId: number;
  id?: number;
  originalFilename: string;
  uploadedEvidenceTypeCode: BackendEvidenceTypeCode | string;
  mimeType: string | null;
  sizeBytes: number | null;
  capturedAt?: string | null;
  uploadedAt: string | null;
  statusCode?: FileStatusCode | string;
  detail?: string | null;
  visionDetections?: VisionDetectionsResponse | null;
}

interface ArchiveCategoryListResponse {
  projectId: number;
  items: ArchiveCategoryResponse[];
}

interface ArchiveCategoryResponse {
  categoryCode: string;
  categoryName: string;
  itemCount: number;
  linkedFileCount: number;
  linkCount: number;
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

interface LinkedEvidenceFileUploadResponse {
  linkId: number;
  fileId: number;
  originalFilename?: string;
  uploadedEvidenceTypeCode?: BackendEvidenceTypeCode | string;
  uploadedEvidenceTypeName?: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  capturedAt?: string | null;
  uploadedAt?: string | null;
  statusCode?: FileStatusCode | string;
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
  visionDetections?: VisionDetectionsResponse | null;
}

interface VisionDetectionResponse {
  label?: string | null;
  boxColor?: string | null;
  confidence?: number | string | null;
  isWearing?: boolean | null;
  bboxXyxy?: number[] | null;
  bbox_xyxy?: number[] | null;
}

interface VisionDetectionsResponse {
  imageWidth?: number | string | null;
  imageHeight?: number | string | null;
  detections?: VisionDetectionResponse[] | null;
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

export interface UsageStatementItemInput {
  categoryId: number;
  usedOn: string;
  itemName: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  remark?: string;
  pageNo?: number;
}

interface UsageStatementDetailResponse {
  id: number;
  reportMonth: string | null;
  revisionNo: number | null;
  documentWrittenDate: string | null;
  statusCode: string | null;
  cumulativeProgressRate: number | string | null;
  sourceFile: SourceFileResponse | null;
  summaries: UsageStatementSummaryResponse[];
  items: UsageStatementItemResponse[];
}

interface UsageStatementStatusResponse {
  id: number;
  statusCode: string;
}

export interface CreateUsageStatementItemResponse {
  categoryChanged: boolean;
  changes: Array<{
    itemName: string;
    fromCategoryCode: string;
    fromCategoryName: string;
    toCategoryCode: string;
    toCategoryName: string;
  }>;
}

export interface UsageStatementArchiveData {
  usageStatementId?: number;
  archiveSeed: ArchiveSeed;
  usageItems: UsageLineItem[];
  overviewRows: Array<[string, string, string, string]>;
  statementSummary: MonthlyUsageStatementSummary;
  workflowStatus?: UsageWorkflowStatus;
}

export type SafetyDocAgentRequiredEvidence = Partial<Record<FolderEvidenceCategory, string[]>>;
export type SafetyDocAgentRequiredEvidenceMap = Record<string, SafetyDocAgentRequiredEvidence>;

const formatMonthLabel = (monthKey: string) => {
  const [year, month] = monthKey.split('-');
  return `${year}년 ${Number(month)}월`;
};

const normalizeMonthKey = (month?: string | null) => {
  const match = month?.match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : month || new Date().toISOString().slice(0, 7);
};

const formatDate = (value?: string | null) => value?.slice(0, 10) || '-';
const formatOptionalDate = (value?: string | null) => value?.slice(0, 10) || '';
const formatFileDate = (file: { capturedAt?: string | null; uploadedAt?: string | null }) =>
  formatOptionalDate(file.capturedAt) || formatOptionalDate(file.uploadedAt);

const formatMoney = (value?: number | string | null) => {
  if (value == null || value === '') return '-';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString('ko-KR') : String(value);
};

const toAmount = (value?: number | string | null) => {
  const numeric = parseUsageNumber(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const categoryCodeToId = (categoryCode?: string | null) => {
  const match = categoryCode?.match(/\d+/);
  return match ? Number(match[0]) : 0;
};

export const categoryIdToCode = (categoryId: number) => `CAT_${String(categoryId).padStart(2, '0')}`;

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
  'wage_statement',
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

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const normalizeVisionBox = (bbox: unknown, imageWidth?: number, imageHeight?: number): [number, number, number, number] | null => {
  if (!Array.isArray(bbox))
    return null;
  const values = bbox.map((value) => Number(value));
  if (values.length < 4 || values.some((value) => !Number.isFinite(value)))
    return null;
  const [x1, y1, x2, y2] = values;
  if (imageWidth && imageHeight) {
    return [
      clampPercent((x1 / imageWidth) * 100),
      clampPercent((y1 / imageHeight) * 100),
      clampPercent(((x2 - x1) / imageWidth) * 100),
      clampPercent(((y2 - y1) / imageHeight) * 100),
    ];
  }
  return [clampPercent(x1), clampPercent(y1), clampPercent(x2 - x1), clampPercent(y2 - y1)];
};

const visionDetectionsToValidation = (
  file: { visionDetections?: VisionDetectionsResponse | null },
  kind: EvidenceCategory,
): EvidenceFile['visionValidation'] | undefined => {
  if (kind !== 'site_photo' || !file.visionDetections)
    return undefined;
  const imageWidth = Number(file.visionDetections.imageWidth);
  const imageHeight = Number(file.visionDetections.imageHeight);
  const detections = (file.visionDetections.detections || [])
    .map((detection) => {
      const box = normalizeVisionBox(detection.bboxXyxy || detection.bbox_xyxy, imageWidth, imageHeight);
      if (!box)
        return null;
      const colorText = String(detection.boxColor || '');
      const status: 'ok' | 'bad' = detection.isWearing === false || /red|danger|fail|bad|부적|미착용/i.test(colorText) ? 'bad' : 'ok';
      const confidence = Number(detection.confidence);
      return {
        label: detection.label || '비전 검출',
        confidence: Number.isFinite(confidence) ? confidence : 0,
        box,
        status,
      };
    })
    .filter((detection): detection is NonNullable<typeof detection> => Boolean(detection));
  if (detections.length === 0)
    return undefined;
  const hasProblem = detections.some((detection) => detection.status === 'bad');
  return {
    status: hasProblem ? 'unsuitable' : 'suitable',
    checkedAt: new Date().toISOString(),
    itemName: '현장사진',
    summary: hasProblem ? '비전 검증 결과 보완이 필요한 항목이 있습니다.' : '비전 검증 결과 착용 상태가 확인되었습니다.',
    detections,
  };
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
    uploadedAt: formatFileDate(file),
    uploadedBy: '',
    documentType: file.evidenceTypeName,
    previewUrl: file.mimeType?.startsWith('image/') ? getProjectFilePreviewUrl(projectId, file.fileId) : '',
    categoryIds: [catId],
    usageItemIds: [usageItemId],
    visionValidation: visionDetectionsToValidation(file, kind),
  });

const projectFileToEntry = (projectId: string, file: ProjectFileResponse | ProjectFileUploadResponse): EvidenceFile => {
  const fileId = file.fileId || ('id' in file ? file.id : undefined);
  if (!fileId) {
    throw new Error('업로드 응답에 파일 ID가 없습니다.');
  }
  const kind = projectFileCodeToKind(file.uploadedEvidenceTypeCode);
  const uploadedFromList = 'linkedItemCount' in file;
  return makeEntry(file.originalFilename || `file-${fileId}`, kind, {
    id: `project-file-${fileId}`,
    fileId,
    uploadedAt: formatFileDate(file) || (uploadedFromList ? '' : new Date().toISOString().slice(0, 10)),
    uploadedBy: '',
    documentType: 'uploadedEvidenceTypeName' in file ? file.uploadedEvidenceTypeName : undefined,
    statusCode: file.statusCode,
    previewUrl: file.mimeType?.startsWith('image/') ? getProjectFilePreviewUrl(projectId, fileId) : '',
    categoryIds: [],
    usageItemIds: [],
    visionValidation: visionDetectionsToValidation(file, kind),
  });
};

const buildOverviewRows = (summaries: UsageStatementSummaryResponse[], usageItems: UsageLineItem[] = []) => {
  const rows = CATS.map((cat) => {
    const summary = summaries.find((item) => categoryCodeToId(item.categoryCode) === cat.id);
    const calculatedCurrentAmount = usageItems
      .filter((item) => item.categoryId === cat.id)
      .reduce((sum, item) => sum + item.amount, 0);
    const previousAmount = toAmount(summary?.previousAmount);
    const hasCalculatedItems = usageItems.some((item) => item.categoryId === cat.id);
    const currentAmount = hasCalculatedItems ? calculatedCurrentAmount : toAmount(summary?.currentAmount);
    const cumulativeAmount = hasCalculatedItems ? previousAmount + currentAmount : toAmount(summary?.cumulativeAmount);
    return [
      `${cat.id}. ${summary?.categoryName || cat.label}`,
      formatMoney(previousAmount),
      formatMoney(currentAmount),
      formatMoney(cumulativeAmount),
    ] as [string, string, string, string];
  });
  const totals = rows.reduce((acc, [, previous, current, cumulative]) => ({
    previous: acc.previous + toAmount(previous),
    current: acc.current + toAmount(current),
    cumulative: acc.cumulative + toAmount(cumulative),
  }), { previous: 0, current: 0, cumulative: 0 });
  return [...rows, ['계', formatMoney(totals.previous), formatMoney(totals.current), formatMoney(totals.cumulative)] as [string, string, string, string]];
};

const buildStatementSummary = (statement: UsageStatementDetailResponse, usageItems: UsageLineItem[]): MonthlyUsageStatementSummary => {
  const month = normalizeMonthKey(statement.reportMonth);
  const evidenceCount = statement.items.reduce((sum, item) => sum + (item.evidenceFiles?.length || 0), 0);
  const issueCount = statement.items.reduce((sum, item) => sum + (item.requirements || []).filter((requirement) => !requirement.satisfied).length, 0);
  const previousAmount = statement.summaries.reduce((sum, item) => sum + toAmount(item.previousAmount), 0);
  const currentAmount = usageItems.reduce((sum, item) => sum + item.amount, 0);
  const cumulativeAmount = previousAmount + currentAmount;
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

const usageStatementItemToLineItem = (item: UsageStatementItemResponse): UsageLineItem => ({
  id: String(item.itemId),
  categoryId: categoryCodeToId(item.categoryCode),
  name: item.itemName || '-',
  amount: calculateUsageLineAmount(item.quantity, item.unitPrice),
  date: item.usedOn || undefined,
  unit: item.unit || undefined,
  quantity: item.quantity == null ? undefined : parseUsageNumber(item.quantity),
  unitPrice: item.unitPrice == null ? undefined : toAmount(item.unitPrice),
});

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
      amount: calculateUsageLineAmount(item.quantity, item.unitPrice),
      date: item.usedOn || undefined,
      unit: item.unit || undefined,
      quantity: item.quantity == null ? undefined : parseUsageNumber(item.quantity),
      unitPrice: item.unitPrice == null ? undefined : toAmount(item.unitPrice),
    };
  }).filter((item) => item.categoryId > 0);

  return {
    usageStatementId: statement.id,
    archiveSeed,
    usageItems,
    overviewRows: buildOverviewRows(statement.summaries || [], usageItems),
    statementSummary: buildStatementSummary(statement, usageItems),
    workflowStatus: normalizeUsageWorkflowStatus(statement.statusCode),
  };
};

const usageStatementItemBody = (input: UsageStatementItemInput) => ({
  categoryCode: categoryIdToCode(input.categoryId),
  usedOn: input.usedOn,
  itemName: input.itemName,
  unit: input.unit || null,
  quantity: input.quantity,
  unitPrice: input.unitPrice,
  totalAmount: input.totalAmount,
  remark: input.remark || null,
  pageNo: input.pageNo || 1,
});

export const getLatestUsageStatementArchive = async (projectId: string) => {
  const response = await apiFetch<LatestUsageStatementResponse>(`/projects/${projectId}/usage-statements/latest`);
  if (!response.data.statement) return null;
  return toArchiveData(projectId, response.data.statement);
};

const getUsageStatementArchiveByMonth = async (projectId: string, year: number, month: number) => {
  const response = await apiFetch<{ projectId: number; statement: UsageStatementDetailResponse }>(
    `/projects/${projectId}/usage-statements/by-month?year=${year}&month=${month}`,
  );
  return toArchiveData(projectId, response.data.statement);
};

export const getUsageStatementArchiveById = async (projectId: string, usageStatementId: number) => {
  const response = await apiFetch<{ projectId: number; statement: UsageStatementDetailResponse }>(
    `/projects/${projectId}/usage-statements/${usageStatementId}`,
  );
  return toArchiveData(projectId, response.data.statement);
};

export const deleteUsageStatement = async (projectId: string, usageStatementId: number) => {
  await apiFetch<null>(`/projects/${projectId}/usage-statements/${usageStatementId}`, {
    method: 'DELETE',
  });
};

export const submitUsageStatement = async (projectId: string, usageStatementId: number) => {
  const response = await apiFetch<UsageStatementStatusResponse>(`/projects/${projectId}/usage-statements/${usageStatementId}/submit`, {
    method: 'PATCH',
  });
  return response.data;
};

export const requestUsageStatementSupplement = async (projectId: string, usageStatementId: number) => {
  const response = await apiFetch<UsageStatementStatusResponse>(`/projects/${projectId}/usage-statements/${usageStatementId}/request-supplement`, {
    method: 'PATCH',
  });
  return response.data;
};

export const completeUsageStatementReview = async (projectId: string, usageStatementId: number) => {
  const response = await apiFetch<UsageStatementStatusResponse>(`/projects/${projectId}/usage-statements/${usageStatementId}/complete-review`, {
    method: 'PATCH',
  });
  return response.data;
};

export const createUsageStatementItem = async (projectId: string, usageStatementId: number, input: UsageStatementItemInput) => {
  const response = await apiFetch<CreateUsageStatementItemResponse>(`/projects/${projectId}/usage-statements/${usageStatementId}/items`, {
    method: 'POST',
    body: usageStatementItemBody(input),
  });
  return response.data;
};

export const updateUsageStatementItem = async (projectId: string, usageStatementId: number, itemId: string | number, input: UsageStatementItemInput) => {
  const response = await apiFetch<UsageStatementItemResponse>(`/projects/${projectId}/usage-statements/${usageStatementId}/items/${itemId}`, {
    method: 'PATCH',
    body: usageStatementItemBody(input),
  });
  return usageStatementItemToLineItem(response.data);
};

export const deleteUsageStatementItem = async (projectId: string, usageStatementId: number, itemId: string | number) => {
  await apiFetch<null>(`/projects/${projectId}/usage-statements/${usageStatementId}/items/${itemId}`, {
    method: 'DELETE',
  });
};

export const changeUsageStatementItemCategory = async (projectId: string, usageStatementId: number, itemId: string | number, categoryId: number) => {
  const response = await apiFetch<UsageStatementItemResponse>(`/projects/${projectId}/usage-statements/${usageStatementId}/items/${itemId}/category`, {
    method: 'PATCH',
    body: { categoryCode: categoryIdToCode(categoryId) },
  });
  return usageStatementItemToLineItem(response.data);
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
  const response = await apiFetch<ProjectFileListResponse>(`/projects/${projectId}/files?size=50`);
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

export const uploadEvidenceFileToItem = async (projectId: string, itemId: string, file: File, kind: FolderEvidenceCategory) => {
  const formData = new FormData();
  formData.set('evidenceTypeCode', kindToEvidenceCode(kind));
  formData.set('file', file);
  const response = await apiFetch<LinkedEvidenceFileUploadResponse>(`/projects/${projectId}/usage-statement-items/${itemId}/evidence-files/upload`, {
    method: 'POST',
    body: formData,
  });
  const fileId = response.data.fileId;
  const linkId = response.data.linkId;
  if (!linkId) {
    throw new Error('파일은 업로드됐지만 세부항목 증빙 연결이 생성되지 않았습니다. 다시 업로드해 주세요.');
  }
  const entry = makeEntry(response.data.originalFilename || file.name, kind, {
    fileId,
    uploadedAt: formatFileDate(response.data) || new Date().toISOString().slice(0, 10),
    uploadedBy: '',
    documentType: response.data.uploadedEvidenceTypeName,
    statusCode: response.data.statusCode,
    previewUrl: fileId && (response.data.mimeType || file.type)?.startsWith('image/') ? getProjectFilePreviewUrl(projectId, fileId) : '',
  });
  return {
    ...entry,
    id: linkId ? `evidence-link-${linkId}` : fileId ? `project-file-${fileId}` : entry.id,
    linkId,
    kind,
    categoryIds: [],
    usageItemIds: [itemId],
  } as EvidenceFile;
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

const listArchiveCategories = async (projectId: string) => {
  const response = await apiFetch<ArchiveCategoryListResponse>(`/projects/${projectId}/archive/categories`);
  return response.data.items;
};

const listArchiveCategoryItems = async (projectId: string, categoryCode: string) => {
  const response = await apiFetch<ArchiveItemListResponse>(`/projects/${projectId}/archive/categories/${categoryCode}/items`);
  return response.data.items;
};

const listItemEvidenceFiles = async (projectId: string, itemId: string) => {
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
    amount: calculateUsageLineAmount(item.quantity, item.unitPrice),
    date: item.usedOn || undefined,
    unit: item.unit || undefined,
    quantity: item.quantity == null ? undefined : parseUsageNumber(item.quantity),
    unitPrice: item.unitPrice == null ? undefined : toAmount(item.unitPrice),
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
