import type { ArchiveSeed, EvidenceCategory, EvidenceFile } from '../types/domain';

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
  date?: string;
  unit?: string;
  quantity?: number;
  unitPrice?: number;
}

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
export const parseUsageNumber = (value?: number | string | null) => {
  if (value == null || value === '') return 0;
  const numeric = typeof value === 'number'
    ? value
    : Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(numeric) ? numeric : 0;
};

export const calculateUsageLineAmount = (quantity?: number | string | null, unitPrice?: number | string | null) => {
  const parsedQuantity = parseUsageNumber(quantity);
  const parsedUnitPrice = parseUsageNumber(unitPrice);
  if (parsedQuantity <= 0 || parsedUnitPrice < 0) return 0;
  return Math.round(parsedQuantity * parsedUnitPrice);
};

let fileSequence = 0;

export const nextFileId = () => `file-${++fileSequence}`;
export const isImageFile = (name: string) => /\.(png|jpe?g|gif|webp)$/i.test(name || '');

export const classifyEvidenceToCategoryIds = (_name: string, _description = ''): number[] => [];

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

export const makeThumbSvg = (kind: EvidenceCategory) => encodeURIComponent(
  kind === 'site_photo'
    ? "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 92'><rect width='120' height='92' rx='16' fill='#DDEEE2'/><rect x='14' y='14' width='92' height='64' rx='12' fill='#B8D4BE'/><circle cx='44' cy='40' r='12' fill='#87AF91'/><path d='M24 68l22-20 18 14 14-10 18 16H24z' fill='#5E8D6B'/></svg>"
    : "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 92'><rect width='120' height='92' rx='16' fill='#EEF4EF'/><rect x='28' y='16' width='64' height='60' rx='10' fill='#FFFFFF' stroke='#C9D9CD'/><rect x='40' y='34' width='40' height='4' rx='2' fill='#A7BCAF'/><rect x='40' y='44' width='30' height='4' rx='2' fill='#C0CEC3'/></svg>",
);

export const fmt = (n: number) => n.toLocaleString('ko-KR') + '원';
