import { apiFetch } from './api-client';
import { CATS, createDefaultArchiveData, makeEntry, type UsageLineItem } from './evidence-utils';
import type { MonthlyUsageStatementSummary } from './project-data';
import type { ArchiveSeed, EvidenceCategory, EvidenceFile, FolderEvidenceCategory } from '../types/domain';

interface LatestUsageStatementResponse {
  projectId: number;
  statement: UsageStatementDetailResponse | null;
}

interface ProjectFileListResponse {
  projectId: number;
  items: ProjectFileResponse[];
}

interface ProjectFileResponse {
  fileId: number;
  uploadedEvidenceTypeCode: string;
  uploadedEvidenceTypeName: string;
  originalFilename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  capturedAt: string | null;
  uploadedAt: string | null;
  linkedItemCount: number;
}

interface SourceFileResponse {
  fileId: number;
  originalFilename: string;
  evidenceTypeCode: string;
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
  evidenceTypeCode: string;
  evidenceTypeName: string;
  originalFilename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  capturedAt: string | null;
  uploadedAt: string | null;
}

interface RequirementResponse {
  evidenceTypeCode: string;
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

const evidenceCodeToKind = (code?: string | null): FolderEvidenceCategory => {
  if (code === 'receipt') return 'receipt';
  if (code === 'site_photo') return 'site_photo';
  if (code === 'tax_invoice' || code === 'tax_invoice_confirm') return 'tax_invoice';
  return 'other_document';
};

const projectFileCodeToKind = (code?: string | null): EvidenceCategory => {
  if (code === 'usage_statement') return 'usage_statement';
  if (code === 'receipt') return 'receipt';
  if (code === 'tax_invoice' || code === 'tax_invoice_confirm') return 'tax_invoice';
  if (code?.includes('photo')) return 'site_photo';
  return 'other_document';
};

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
    uploadedAt: formatDate(sourceFile.uploadedAt),
    uploadedBy: '',
    categoryIds: [],
    usageItemIds: [],
  });

const evidenceFileToEntry = (file: EvidenceFileResponse, kind: EvidenceCategory, catId: number, usageItemId: string): EvidenceFile =>
  makeEntry(file.originalFilename || `file-${file.fileId}`, kind, {
    id: `evidence-link-${file.linkId || file.fileId}`,
    uploadedAt: formatDate(file.uploadedAt),
    uploadedBy: '',
    documentType: file.evidenceTypeName,
    categoryIds: [catId],
    usageItemIds: [usageItemId],
  });

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

const toArchiveData = (statement: UsageStatementDetailResponse): UsageStatementArchiveData => {
  const archiveSeed = createDefaultArchiveData();
  if (statement.sourceFile) {
    archiveSeed.usage_statement = [sourceFileToEvidence(statement.sourceFile)];
  }

  const usageItems = (statement.items || []).map((item) => {
    const catId = categoryCodeToId(item.categoryCode);
    const usageItemId = String(item.itemId);
    (item.evidenceFiles || []).forEach((file) => {
      const kind = evidenceCodeToKind(file.evidenceTypeCode);
      putArchiveFile(archiveSeed, catId, usageItemId, kind, evidenceFileToEntry(file, kind, catId, usageItemId));
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
  return toArchiveData(response.data.statement);
};

export const listProjectFiles = async (projectId: string) => {
  const response = await apiFetch<ProjectFileListResponse>(`/projects/${projectId}/files?size=200`);
  return response.data.items.reduce((buckets, file) => {
    const kind = projectFileCodeToKind(file.uploadedEvidenceTypeCode);
    buckets[kind].push(makeEntry(file.originalFilename || `file-${file.fileId}`, kind, {
      id: `project-file-${file.fileId}`,
      uploadedAt: formatDate(file.uploadedAt),
      uploadedBy: '',
      documentType: file.uploadedEvidenceTypeName,
      categoryIds: [],
      usageItemIds: [],
    }));
    return buckets;
  }, createEmptyEvidenceBuckets());
};

export const runSafetyDocAgentMatching = async (projectId: string): Promise<SafetyDocAgentRequiredEvidenceMap> => {
  const response = await apiFetch<SafetyDocAgentMatchResponse>(`/projects/${projectId}/safety-doc-agent/match`, {
    method: 'POST',
  });

  if (response.data.requiredEvidenceByLine) {
    return response.data.requiredEvidenceByLine;
  }

  return (response.data.requirements || []).reduce<SafetyDocAgentRequiredEvidenceMap>((result, item) => {
    const usageItemId = String(item.usageStatementItemId ?? item.itemId ?? '');
    const kind = evidenceCodeToKind(item.evidenceTypeCode);
    const requiredName = item.requiredFileName || item.requiredEvidenceName || item.requiredDocumentName || item.name || item.evidenceTypeName || '';
    if (!usageItemId || !requiredName) return result;
    result[usageItemId] = {
      ...(result[usageItemId] || {}),
      [kind]: [...(result[usageItemId]?.[kind] || []), requiredName],
    };
    return result;
  }, {});
};
