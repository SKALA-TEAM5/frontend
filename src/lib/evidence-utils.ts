import type { ArchiveSeed, EvidenceCategory, EvidenceFile, ValidationDashboardResult } from '../types/domain';

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

export const VALIDATION_DASHBOARD_RESULT: ValidationDashboardResult = {
  id: 'validation-sample-2026-04',
  checkedAt: '2026. 5. 13. 오후 2:30',
  usageStatementFile: '2026년_4월_사용내역서.pdf',
  lawAgent: {
    name: 'legal_agent',
    version: 'MVP 시뮬레이션',
    basis: '산업안전보건관리비 계상 및 사용기준',
  },
  categories: [
    {
      categoryId: 1,
      categoryName: '안전·보건관리자 임금 등',
      usageAmount: 1800000,
      recognizedAmount: 1800000,
      disputedAmount: 0,
      decision: 'appropriate',
      riskLevel: 'low',
      evidenceSummary: {
        requiredTypes: ['사용내역서', '임금대장', '계좌이체확인증'],
        submittedFiles: [
          { id: 'sample-payroll-1', name: '보건관리자_4월_임금대장.pdf', kind: 'other_document' },
          { id: 'sample-transfer-1', name: '보건관리자_4월_이체확인증.pdf', kind: 'receipt' },
        ],
        missingTypes: [],
        problematicFiles: [],
      },
      legalBasis: [
        {
          lawName: '산업안전보건관리비 계상 및 사용기준',
          article: '제7조',
          summary: '전담 안전·보건관리자의 인건비는 산업안전보건관리비 사용 항목으로 인정됩니다.',
          agentReasoning: '임금대장과 이체확인증의 지급 대상, 지급월, 금액이 사용내역서와 일치하여 전액 인정 대상으로 판단했습니다.',
        },
      ],
      issues: [],
    },
    {
      categoryId: 3,
      categoryName: '보호구 등',
      usageAmount: 2450000,
      recognizedAmount: 1250000,
      disputedAmount: 1200000,
      decision: 'conditional',
      riskLevel: 'medium',
      evidenceSummary: {
        requiredTypes: ['영수증', '지급대장', '현장사진'],
        submittedFiles: [
          { id: 'sample-ppe-receipt', name: '보호구_구입_영수증.pdf', kind: 'receipt' },
          { id: 'sample-ppe-photo', name: '보호구_현장사진.jpg', kind: 'site_photo' },
        ],
        missingTypes: ['지급대장'],
        problematicFiles: [
          {
            fileName: '보호구_현장사진.jpg',
            kind: 'site_photo',
            reason: '현장사진 검증 결과 일부 작업자의 안전벨트 착용 여부가 불명확합니다.',
          },
        ],
      },
      legalBasis: [
        {
          lawName: '산업안전보건관리비 계상 및 사용기준',
          article: '별표2',
          summary: '개인보호구 구입비는 지급 대상과 현장 사용 사실이 확인되어야 인정됩니다.',
          agentReasoning: '영수증은 확인되지만 지급대장이 누락되어 실제 근로자 지급 여부가 불충분합니다. 지급대장 보완 시 인정 가능성이 있습니다.',
        },
      ],
      issues: [
        {
          title: '보호구 지급 증빙 부족',
          description: '보호구 구입 증빙은 있으나 근로자별 지급대장이 없어 실제 지급 여부를 확인하기 어렵습니다.',
          problemFileNames: ['보호구_현장사진.jpg'],
          requiredAction: '보호구 지급대장과 수령 확인 서명을 추가 제출해 주세요.',
          recommendedFiles: ['보호구 지급대장', '수령 확인서'],
        },
      ],
    },
    {
      categoryId: 5,
      categoryName: '안전보건교육비 등',
      usageAmount: 920000,
      recognizedAmount: 0,
      disputedAmount: 920000,
      decision: 'inappropriate',
      riskLevel: 'high',
      evidenceSummary: {
        requiredTypes: ['교육계획서', '참석자 명단', '교육 이수증', '결제 영수증'],
        submittedFiles: [
          { id: 'sample-training-receipt', name: '안전교육_결제영수증.pdf', kind: 'receipt' },
        ],
        missingTypes: ['참석자 명단', '교육 이수증'],
        problematicFiles: [
          {
            fileName: '안전교육_결제영수증.pdf',
            kind: 'receipt',
            reason: '결제 영수증만으로 교육 대상자와 교육 이수 여부를 확인할 수 없습니다.',
          },
        ],
      },
      legalBasis: [
        {
          lawName: '산업안전보건법',
          article: '제29조',
          summary: '안전보건교육 관련 비용은 교육 실시 및 대상자 이수 사실이 증빙되어야 합니다.',
          agentReasoning: '참석자 명단과 이수증이 없어 교육 집행 목적과 이수 사실이 확인되지 않으므로 부적정으로 판단했습니다.',
        },
      ],
      issues: [
        {
          title: '교육 실시 증빙 부족',
          description: '교육비 집행은 확인되지만 참석자와 이수 결과를 확인할 핵심 증빙이 누락되었습니다.',
          problemFileNames: ['안전교육_결제영수증.pdf'],
          requiredAction: '참석자 명단, 교육 이수증, 교육계획서를 제출해 주세요.',
          recommendedFiles: ['참석자 명단', '교육 이수증', '교육계획서'],
        },
      ],
    },
    {
      categoryId: 7,
      categoryName: '건설재해예방전문지도기관 기술지도비',
      usageAmount: 1500000,
      recognizedAmount: 1500000,
      disputedAmount: 0,
      decision: 'appropriate',
      riskLevel: 'low',
      evidenceSummary: {
        requiredTypes: ['계약서', '기술지도 결과보고서', '세금계산서'],
        submittedFiles: [
          { id: 'sample-guidance-contract', name: '기술지도_계약서.pdf', kind: 'other_document' },
          { id: 'sample-guidance-report', name: '기술지도_결과보고서.pdf', kind: 'other_document' },
          { id: 'sample-guidance-tax', name: '기술지도_세금계산서.pdf', kind: 'tax_invoice' },
        ],
        missingTypes: [],
        problematicFiles: [],
      },
      legalBasis: [
        {
          lawName: '산업안전보건관리비 계상 및 사용기준',
          article: '별표2',
          summary: '건설재해예방전문지도기관 기술지도비는 계약 및 결과보고서가 확인되면 인정 가능합니다.',
          agentReasoning: '계약서, 결과보고서, 세금계산서가 모두 제출되어 사용 목적과 금액 정합성이 확인됩니다.',
        },
      ],
      issues: [],
    },
    {
      categoryId: 8,
      categoryName: '본사 전담조직 근로자 임금 등',
      usageAmount: 3200000,
      recognizedAmount: 0,
      disputedAmount: 3200000,
      decision: 'inappropriate',
      riskLevel: 'high',
      evidenceSummary: {
        requiredTypes: ['전담조직 업무분장표', '인건비 산출표', '직접 수행 내역서'],
        submittedFiles: [
          { id: 'sample-hq-payroll', name: '본사_전담조직_급여대장.xlsx', kind: 'other_document' },
        ],
        missingTypes: ['직접 수행 내역서', '현장 지원 근거'],
        problematicFiles: [
          {
            fileName: '본사_전담조직_급여대장.xlsx',
            kind: 'other_document',
            reason: '본사 일반관리 업무와 현장 안전관리 전담 업무가 구분되지 않습니다.',
          },
        ],
      },
      legalBasis: [
        {
          lawName: '산업안전보건관리비 계상 및 사용기준',
          article: '제7조',
          summary: '본사 전담조직 인건비는 현장 안전관리 업무에 직접 투입된 사실이 확인되어야 합니다.',
          agentReasoning: '급여대장만 제출되어 본사 일반관리비와 현장 안전관리비의 중복계상 가능성이 높습니다.',
        },
      ],
      issues: [
        {
          title: '인건비 중복계상 위험',
          description: '본사 전담조직 인건비가 일반관리비와 중복 계상되었을 가능성이 있습니다.',
          problemFileNames: ['본사_전담조직_급여대장.xlsx'],
          requiredAction: '전담조직 업무분장표와 현장별 직접 수행 내역서를 제출해 주세요.',
          recommendedFiles: ['전담조직 업무분장표', '직접 수행 내역서', '인건비 산출표'],
        },
      ],
    },
  ],
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
