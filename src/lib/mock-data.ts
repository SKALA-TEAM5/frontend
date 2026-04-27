import type { ArchiveCategoryMap, ArchiveSeed, ContractInfo, EvidenceCategory, EvidenceFile, ReportRow } from '../types/domain';

interface CategoryMeta {
  id: number;
  label: string;
  short: string;
}

type MockFileBuckets = Record<number, string[]>;

interface MatchStatusMap {
  [key: number]: 'ok' | 'review' | 'edit';
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
  { id: 7, label: '건설재해예방전문지도기관 기술지도비', short: '건설재해예방전문지도기관 기술지도비' },
  { id: 8, label: '본사 전담조직 근로자 임금 등', short: '본사 전담조직 근로자 임금 등' },
  { id: 9, label: '위험성평가 등에 따른 소요비용', short: '위험성평가 등에 따른 소요비용' },
];

const MOCK_FILES: Record<EvidenceCategory, MockFileBuckets> = {
  receipt: {
    1: ['안전관리자_선임수수료_1월.pdf', '안전관리자_수수료_2월.jpg', '안전관리자_3월_영수증.jpg'],
    2: ['보건관리_용역비_청구서.pdf', '보건관리자_4월_영수증.jpg', '보건관리_5월_청구서.pdf', '보건관리비_영수증_6월.jpg'],
    3: ['안전교육_수강료_영수증.jpg', '교육비_납입증명서.pdf'],
    4: ['안전모_구입_영수증.jpg', '안전화_구입_영수증.jpg', '안전장갑_영수증.jpg', '보호구_세트_영수증.pdf', '안전조끼_영수증.jpg'],
    5: ['안전망_설치비_영수증.pdf', '추락방지대_구입.jpg', '안전난간_영수증.jpg', '안전표지판_영수증.jpg'],
    6: ['안전보건진단_용역비.pdf'],
    7: ['위험성평가_수수료_1차.pdf', '위험성평가_2차_영수증.pdf', '위험성평가_3차.jpg', '위험성평가_컨설팅비.pdf', '위험성평가_4차_영수증.jpg', '위험성평가_5차.pdf', '위험성평가_결과비.jpg', '위험성평가_추가비.pdf'],
    8: ['본사_관리비_1분기.pdf', '본사_인건비_2분기.pdf', '본사_운영비_영수증.jpg'],
    9: ['건강검진_청구서_1차.pdf', '건강검진_2차_영수증.jpg', '근로자_건강관리비.pdf', '건강검진_3차.pdf', '건강검진_결과비.jpg', '건강관리_용역비.pdf'],
  },
  site_photo: {
    1: ['안전관리자_현장순찰_사진.jpg', '안전관리자_점검_현장.jpg'],
    2: ['보건관리자_현장방문.jpg', '보건시설_점검_사진.jpg', '보건관리_활동사진.jpg', '보건담당자_현장.jpg', '보건설비_설치.jpg'],
    3: [],
    4: ['안전모_착용_현장.jpg', '안전화_지급_사진.jpg', '보호구_착용확인.jpg', '안전장갑_현장착용.jpg'],
    5: ['안전망_설치완료.jpg', '추락방지대_설치사진.jpg', '안전난간_완공사진.jpg', '안전표지판_현장설치.jpg', '안전시설_전체사진.jpg', '안전설비_완료확인.jpg'],
    6: ['안전보건진단_현장사진.jpg', '진단결과_현장확인.jpg'],
    7: ['위험성평가_현장사진.jpg', '위험요인_확인현장.jpg', '위험성평가_결과사진.jpg'],
    8: [],
    9: ['건강검진_현장사진.jpg', '근로자_건강관리_현장.jpg', '건강관리_활동사진.jpg', '건강상담_현장.jpg'],
  },
  usage_statement: {
    1: ['사용내역서_안전관리자_1분기.pdf'],
    3: ['사용내역서_안전교육_1분기.pdf'],
    4: ['사용내역서_보호구_1분기.xlsx'],
    5: ['사용내역서_안전시설_2분기.pdf'],
    9: ['사용내역서_건강관리_3분기.xlsx'],
  },
  tax_invoice: {
    1: ['세금내역서_안전관리자_1월.pdf', '제3자사실관계확인서_안전관리자_1월.pdf'],
    4: ['세금내역서_보호구_4월.pdf', '제3자사실관계확인서_보호구_4월.pdf'],
    5: ['세금내역서_안전시설_5월.pdf', '제3자사실관계확인서_안전시설_5월.pdf'],
    7: ['세금내역서_위험성평가_6월.pdf', '제3자사실관계확인서_위험성평가_6월.pdf'],
    9: ['세금내역서_건강관리_7월.pdf', '제3자사실관계확인서_건강관리_7월.pdf'],
  },
  other_document: {
    1: ['안전관리자_선임계.pdf'],
    3: ['보호구_지급대장.xlsx'],
    5: ['안전시설_설치확인서.pdf'],
  },
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

export const MOCK_USAGE: string[] = ['사용내역서_2024_1분기.pdf', '사용내역서_2024_2분기.pdf', '사용내역서_2024_3분기.xlsx'];
export const CONTRACT_DB: ContractInfo[] = [
  { name: '동탄 물류센터 증축공사 산안비 정산', num: '2024-0042', project: '동탄 물류센터 증축공사', period: '2024/10/23~2025/06/21', round: '4차', planned: '12,000,000,000', accumulated: '48,614,045' },
  { name: '평택 제조시설 안전보건관리비 집행', num: '2024-0108', project: '평택 제조시설 증설', period: '2023/06/01~2024/12/31', round: '2차', planned: '8,500,000,000', accumulated: '31,120,000' },
  { name: '광명 데이터센터 산업안전보건관리비', num: '2025-0016', project: '광명 데이터센터 신축', period: '2025/02/01~2026/08/31', round: '1차', planned: '15,700,000,000', accumulated: '9,820,000' },
];
export const MATCH_STATUS: MatchStatusMap = { 1: 'ok', 2: 'review', 3: 'ok', 4: 'ok', 5: 'ok', 6: 'edit', 7: 'ok', 8: 'review', 9: 'ok' };
export const SITE_DESCRIPTION_SEED: Record<string, string> = {
  '안전관리자_현장순찰_사진.jpg': '안전관리자가 작업 구간을 순찰하며 위험요인을 점검하는 모습',
  '안전관리자_점검_현장.jpg': '안전관리자가 체크리스트로 현장을 점검하는 모습',
  '보건관리자_현장방문.jpg': '보건관리자가 현장을 방문해 근로자 건강보호 조치를 확인하는 모습',
  '보건시설_점검_사진.jpg': '보건시설 점검 상태를 보여주는 현장 사진',
  '보건관리_활동사진.jpg': '보건관리 활동이 수행된 현장 사진',
  '보건담당자_현장.jpg': '보건담당자가 작업자를 확인하는 현장 사진',
  '보건설비_설치.jpg': '보건설비 설치 상태 사진',
  '안전모_착용_현장.jpg': '작업자가 안전모를 착용하고 작업하는 현장 사진',
  '안전화_지급_사진.jpg': '안전화 지급 및 착용 상태 확인 사진',
  '보호구_착용확인.jpg': '보호구 착용 상태 확인 사진',
  '안전장갑_현장착용.jpg': '안전장갑 착용 상태 확인 사진',
  '안전망_설치완료.jpg': '안전망 설치 완료 상태 사진',
  '추락방지대_설치사진.jpg': '추락방지대 설치 상태 확인 사진',
  '안전난간_완공사진.jpg': '안전난간 설치 완료 사진',
  '안전표지판_현장설치.jpg': '안전표지판 설치 상태 사진',
  '안전시설_전체사진.jpg': '현장 안전시설물 전체 설치 상태 사진',
  '안전설비_완료확인.jpg': '안전설비 완료 확인 사진',
  '안전보건진단_현장사진.jpg': '안전보건진단 수행 현장 사진',
  '진단결과_현장확인.jpg': '진단 결과를 현장에서 확인하는 사진',
  '위험성평가_현장사진.jpg': '위험성평가 진행 현장 사진',
  '위험요인_확인현장.jpg': '위험요인을 직접 확인하는 장면',
  '위험성평가_결과사진.jpg': '위험성평가 결과 반영 상태 사진',
  '건강검진_현장사진.jpg': '근로자 건강검진 현장 사진',
  '근로자_건강관리_현장.jpg': '근로자 건강관리 활동 사진',
  '건강관리_활동사진.jpg': '건강관리 프로그램 수행 사진',
  '건강상담_현장.jpg': '근로자 건강상담 현장 사진',
};
export const REPORT_DATA: ReportRow[] = [
  { id: 1, cat: '안전관리자 지원', status: 'ok', used: 3200000, tax: 290909, settled: 2909091, note: '' },
  { id: 2, cat: '보건관리자 지원', status: 'ok', used: 5800000, tax: 527273, settled: 5272727, note: '' },
  { id: 3, cat: '안전보건 교육', status: 'ok', used: 1450000, tax: 131818, settled: 1318182, note: '' },
  { id: 4, cat: '개인보호구 구입', status: 'error', used: 980000, tax: 0, settled: 0, note: '사용내역서 기재 금액 ₩1,200,000 대비 영수증 합계 ₩980,000으로 ₩220,000 불일치. 산업안전보건관리비 고시 제7조에 따라 사용내역서와 영수증이 일치하지 않는 경우 해당 금액은 인정되지 않습니다.' },
  { id: 5, cat: '안전시설물 설치', status: 'warn', used: 3100000, tax: 281818, settled: 2818182, note: '영수증 ₩3,100,000 중 ₩850,000 상당 품목(안전난간 부품)에 대한 현장사진 미제출. 조건부 인정 — 현장사진 추후 제출 시 확정.' },
  { id: 6, cat: '안전보건 진단', status: 'ok', used: 800000, tax: 72727, settled: 727273, note: '' },
  { id: 7, cat: '위험성평가 지원', status: 'ok', used: 2100000, tax: 190909, settled: 1909091, note: '' },
  { id: 8, cat: '본사 사용비', status: 'error', used: 4800000, tax: 0, settled: 0, note: '본사 사용비 계상액 ₩4,800,000은 전체 산업안전관리비의 25.4%로 허용 한도(20%) 초과. 산업안전보건관리비 고시 제5조 제2항 위반 — 초과분 ₩1,007,400 반환 조치 필요.' },
  { id: 9, cat: '근로자 건강관리', status: 'ok', used: 4200000, tax: 381818, settled: 3818182, note: '' },
];

let FILE_SEQ = 0;
export const nextFileId = () => `file-${++FILE_SEQ}`;
export const isImageFile = (name: string) => /\.(png|jpe?g|gif|webp)$/i.test(name || '');
const makeMockUploadedDate = () => {
  const day = (FILE_SEQ % 5) + 18;
  return `2026-04-${String(day).padStart(2, '0')}`;
};
export const classifyEvidenceToCategoryIds = (name: string, description = ''): number[] => {
  const text = `${name} ${description}`.toLowerCase();
  const matches = CATS.filter((cat) => CATEGORY_KEYWORDS[cat.id].some((keyword) => text.includes(keyword.toLowerCase()))).map((cat) => cat.id);
  return matches.length > 0 ? matches.slice(0, 3) : [((name.length % CATS.length) || CATS.length)];
};
export const getCategoryLabels = (categoryIds: number[]) => categoryIds.map((id) => CATS.find((cat) => cat.id === id)?.short || `${id}번 항목`);
export const makeEntry = (name: string, kind: EvidenceCategory, extra: Partial<EvidenceFile> = {}): EvidenceFile => ({
  id: extra.id || nextFileId(),
  name,
  kind,
  description: extra.description || (kind === 'site_photo' ? (SITE_DESCRIPTION_SEED[name] || '') : ''),
  amount: extra.amount || '',
  previewUrl: extra.previewUrl || '',
  uploadedAt: extra.uploadedAt || makeMockUploadedDate(),
  categoryIds: extra.categoryIds || classifyEvidenceToCategoryIds(name, extra.description || ''),
});
export const createEntryFromFile = (file: File, kind: EvidenceCategory, extra: Partial<EvidenceFile> = {}): EvidenceFile => makeEntry(file.name, kind, {
  ...extra,
  previewUrl: isImageFile(file.name) ? URL.createObjectURL(file) : '',
  uploadedAt: extra.uploadedAt || new Date().toISOString().slice(0, 10),
});
export const seedArchiveEntries = (source: MockFileBuckets, kind: EvidenceCategory): ArchiveCategoryMap =>
  Object.fromEntries(Object.entries(source).map(([catId, list]) => [catId, list.map((name) => makeEntry(name, kind))]));
const seedProjectUsageStatements = (source: MockFileBuckets): EvidenceFile[] =>
  Object.values(source).flatMap((list) => list.map((name) => makeEntry(name, 'usage_statement', { categoryIds: [] })));
export const normalizeArchiveData = (seed: ArchiveSeed | null): ArchiveSeed => {
  const base = createDefaultArchiveData();
  if (!seed) return base;
  const rawUsageStatement = seed.usage_statement as EvidenceFile[] | ArchiveCategoryMap;
  const usageStatement = Array.isArray(rawUsageStatement)
    ? rawUsageStatement
    : Object.values(rawUsageStatement || {}).flat();
  return {
    receipt: seed.receipt || base.receipt,
    site_photo: seed.site_photo || base.site_photo,
    usage_statement: usageStatement.map((file) => ({ ...file, kind: 'usage_statement', categoryIds: [] })),
    tax_invoice: seed.tax_invoice || base.tax_invoice,
    other_document: seed.other_document || base.other_document,
  };
};
export const createDefaultArchiveData = (): ArchiveSeed => ({
  receipt: seedArchiveEntries(MOCK_FILES.receipt, 'receipt'),
  site_photo: seedArchiveEntries(MOCK_FILES.site_photo, 'site_photo'),
  usage_statement: seedProjectUsageStatements(MOCK_FILES.usage_statement),
  tax_invoice: seedArchiveEntries(MOCK_FILES.tax_invoice, 'tax_invoice'),
  other_document: seedArchiveEntries(MOCK_FILES.other_document, 'other_document'),
});
export const buildArchiveDataFromUploads = (files?: UploadedEvidenceMap | null): ArchiveSeed => {
  const base = createDefaultArchiveData();
  if (!files) return base;
  (['receipt', 'site_photo', 'tax_invoice', 'other_document'] as const).forEach((kind) => {
    const list = files[kind] || [];
    list.forEach((entry, index) => {
      const categoryIds = entry.categoryIds?.length ? entry.categoryIds : [((index % CATS.length) + 1)];
      categoryIds.forEach((categoryId) => {
        const catId = String(categoryId);
        base[kind][catId] = [...(base[kind][catId] || []), { ...entry, id: entry.id || nextFileId(), kind, categoryIds }];
      });
    });
  });
  base.usage_statement = [
    ...base.usage_statement,
    ...(files.usage_statement || []).map((entry) => ({ ...entry, id: entry.id || nextFileId(), kind: 'usage_statement' as const, categoryIds: [] })),
  ];
  return base;
};
export const makeThumbSvg = (kind: EvidenceCategory) => encodeURIComponent(
  kind === 'site_photo'
    ? "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 92'><rect width='120' height='92' rx='16' fill='#DDEEE2'/><rect x='14' y='14' width='92' height='64' rx='12' fill='#B8D4BE'/><circle cx='44' cy='40' r='12' fill='#87AF91'/><path d='M24 68l22-20 18 14 14-10 18 16H24z' fill='#5E8D6B'/></svg>"
    : "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 92'><rect width='120' height='92' rx='16' fill='#EEF4EF'/><rect x='28' y='16' width='64' height='60' rx='10' fill='#FFFFFF' stroke='#C9D9CD'/><rect x='40' y='34' width='40' height='4' rx='2' fill='#A7BCAF'/><rect x='40' y='44' width='30' height='4' rx='2' fill='#C0CEC3'/></svg>",
);
export const fmt = (n: number) => n.toLocaleString('ko-KR') + '원';
