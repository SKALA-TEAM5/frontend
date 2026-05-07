import type { ArchiveCategoryMap, ArchiveSeed, EvidenceCategory, EvidenceFile, FolderEvidenceCategory, ValidationDashboardResult } from '../types/domain';

interface CategoryMeta {
  id: number;
  label: string;
  short: string;
}

export interface UsageLineItem {
  id: string;
  categoryId: number;
  name: string;
  amount: number;
}

type UploadedEvidenceMap = Record<EvidenceCategory, EvidenceFile[]>;
type CategoryKeywordMap = Record<number, string[]>;

export const CATS: CategoryMeta[] = [
  { id: 1, label: '안전·보건관리자 임금 등', short: '안전·보건관리자 임금 등' },
  { id: 2, label: '안전시설비 등', short: '안전시설비 등' },
  { id: 3, label: '보호구 등', short: '보호구 등' },
  { id: 4, label: '안전보건진단비 등', short: '안전보건진단비 등' },
  { id: 5, label: '안전보건교육비 등', short: '안전보건교육비 등' },
  { id: 6, label: '근로자 건강장해예방비 등', short: '근로자 건강장해예방비 등' },
  { id: 7, label: '건설재해예방전문지도기관 기술지도비', short: '건설재해예방전문지도기관\n기술지도비' },
  { id: 8, label: '본사 전담조직 근로자 임금 등', short: '본사 전담조직 근로자 임금 등' },
  { id: 9, label: '위험성평가 등에 따른 소요비용', short: '위험성평가 등에 따른 소요비용' },
];

export const USAGE_LINE_ITEMS: UsageLineItem[] = [];
export const VALIDATION_DASHBOARD_RESULT: ValidationDashboardResult = {
  id: '',
  checkedAt: '',
  usageStatementFile: '',
  lawAgent: {
    name: '',
    version: '',
    basis: '',
  },
  categories: [],
};

const CATEGORY_KEYWORDS: CategoryKeywordMap = {
  1: ['안전관리자', '선임', '순찰', '점검'],
  2: ['보건관리자', '보건관리', '보건시설', '보건담당자'],
  3: ['교육', '수강', '훈련', '안전보건교육'],
  4: ['안전모', '안전화', '보호구', '안전장갑', '안전조끼', '개인보호구'],
  5: ['안전망', '추락방지', '안전난간', '안전표지판', '안전시설', '시설물'],
  6: ['진단', '안전보건진단'],
  7: ['위험성평가', '위험요인', '컨설팅'],
  8: ['본사', '관리비', '인건비', '운영비'],
  9: ['건강검진', '건강관리', '건강상담'],
};

let fileSequence = 0;

export const nextFileId = () => `file-${++fileSequence}`;
export const isImageFile = (name: string) => /\.(png|jpe?g|gif|webp)$/i.test(name || '');

export const classifyEvidenceToCategoryIds = (name: string, description = ''): number[] => {
  const text = `${name} ${description}`.toLowerCase();
  const matches = CATS.filter((cat) => CATEGORY_KEYWORDS[cat.id].some((keyword) => text.includes(keyword.toLowerCase()))).map((cat) => cat.id);
  return matches.length > 0 ? matches.slice(0, 3) : [];
};

export const getCategoryLabels = (categoryIds: number[]) => categoryIds.map((id) => CATS.find((cat) => cat.id === id)?.short || `${id}번 항목`);

const getDefaultUsageItemIds = (categoryIds: number[]) => categoryIds
  .map((categoryId) => USAGE_LINE_ITEMS.find((item) => item.categoryId === categoryId)?.id)
  .filter(Boolean) as string[];

export const makeEntry = (name: string, kind: EvidenceCategory, extra: Partial<EvidenceFile> = {}): EvidenceFile => {
  const categoryIds = extra.categoryIds || classifyEvidenceToCategoryIds(name, extra.description || '');
  return {
    id: extra.id || nextFileId(),
    name,
    kind,
    description: extra.description || '',
    amount: extra.amount || '',
    previewUrl: extra.previewUrl || '',
    uploadedAt: extra.uploadedAt || new Date().toISOString().slice(0, 10),
    uploadedBy: extra.uploadedBy || '현재 사용자',
    categoryIds,
    usageItemIds: extra.usageItemIds || getDefaultUsageItemIds(categoryIds),
  };
};

export const createEntryFromFile = (file: File, kind: EvidenceCategory, extra: Partial<EvidenceFile> = {}): EvidenceFile => makeEntry(file.name, kind, {
  ...extra,
  previewUrl: isImageFile(file.name) ? URL.createObjectURL(file) : '',
});

const putArchiveFile = (categories: ArchiveCategoryMap, catId: number | string, usageItemId: string, kind: FolderEvidenceCategory, file: EvidenceFile) => {
  const categoryKey = String(catId);
  categories[categoryKey] = {
    ...(categories[categoryKey] || {}),
    [usageItemId]: {
      ...(categories[categoryKey]?.[usageItemId] || {}),
      [kind]: [...(categories[categoryKey]?.[usageItemId]?.[kind] || []), file],
    },
  };
};

export const createDefaultArchiveData = (): ArchiveSeed => ({
  usage_statement: [],
  categories: {},
});

export const normalizeArchiveData = (seed: ArchiveSeed | null): ArchiveSeed => {
  if (!seed) return createDefaultArchiveData();
  return {
    usage_statement: Array.isArray(seed.usage_statement) ? seed.usage_statement : [],
    categories: seed.categories || {},
  };
};

export const buildArchiveDataFromUploads = (files?: UploadedEvidenceMap | null): ArchiveSeed => {
  const archive = createDefaultArchiveData();
  if (!files) return archive;

  (['receipt', 'site_photo', 'tax_invoice', 'other_document'] as const).forEach((kind) => {
    const list = files[kind] || [];
    list.forEach((entry) => {
      const categoryIds = entry.categoryIds?.length ? entry.categoryIds : [];
      categoryIds.forEach((categoryId) => {
        const usageItemIds = entry.usageItemIds?.length ? entry.usageItemIds : getDefaultUsageItemIds([categoryId]);
        usageItemIds.forEach((usageItemId) => {
          putArchiveFile(archive.categories, categoryId, usageItemId, kind, { ...entry, id: entry.id || nextFileId(), kind, categoryIds, usageItemIds: [usageItemId] });
        });
      });
    });
  });

  archive.usage_statement = (files.usage_statement || []).map((entry) => ({ ...entry, id: entry.id || nextFileId(), kind: 'usage_statement' as const, categoryIds: [] }));
  return archive;
};

export const makeThumbSvg = (kind: EvidenceCategory) => encodeURIComponent(
  kind === 'site_photo'
    ? "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 92'><rect width='120' height='92' rx='16' fill='#DDEEE2'/><rect x='14' y='14' width='92' height='64' rx='12' fill='#B8D4BE'/><circle cx='44' cy='40' r='12' fill='#87AF91'/><path d='M24 68l22-20 18 14 14-10 18 16H24z' fill='#5E8D6B'/></svg>"
    : "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 92'><rect width='120' height='92' rx='16' fill='#EEF4EF'/><rect x='28' y='16' width='64' height='60' rx='10' fill='#FFFFFF' stroke='#C9D9CD'/><rect x='40' y='34' width='40' height='4' rx='2' fill='#A7BCAF'/><rect x='40' y='44' width='30' height='4' rx='2' fill='#C0CEC3'/></svg>",
);

export const fmt = (n: number) => n.toLocaleString('ko-KR') + '원';
