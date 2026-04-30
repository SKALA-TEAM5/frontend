import type { ArchiveCategoryMap, ArchiveSeed, ContractInfo, EvidenceCategory, EvidenceFile, FolderEvidenceCategory, ReportRow, ValidationDashboardResult } from '../types/domain';

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

type MockFileBuckets = Record<number, string[]>;

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

export const USAGE_LINE_ITEMS: UsageLineItem[] = [
  { id: 'line-001', categoryId: 5, name: '안전테이프(접근방지책)', amount: 320000 },
  { id: 'line-002', categoryId: 5, name: '안전타포린(추락위험, 접근금지)', amount: 540000 },
  { id: 'line-003', categoryId: 5, name: '안전난간 부품 및 설치 자재', amount: 850000 },
  { id: 'line-004', categoryId: 4, name: '안전모 및 턱끈 세트', amount: 380000 },
  { id: 'line-005', categoryId: 4, name: '안전화, 안전장갑, 안전조끼 지급분', amount: 820000 },
  { id: 'line-006', categoryId: 1, name: '안전관리자 현장 순찰 및 점검 수수료', amount: 3200000 },
  { id: 'line-007', categoryId: 7, name: '위험성평가 컨설팅 및 결과 보고', amount: 2100000 },
  { id: 'line-008', categoryId: 8, name: '본사 전담조직 안전관리 인건비', amount: 4800000 },
  { id: 'line-009', categoryId: 9, name: '근로자 건강검진 및 건강상담', amount: 4200000 },
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

export const CONTRACT_DB: ContractInfo[] = [
  { name: '동탄 물류센터 증축공사 산안비 정산', num: '2024-0042', project: '동탄 물류센터 증축공사', period: '2024/10/23~2025/06/21', round: '4차', planned: '12,000,000,000', accumulated: '48,614,045' },
  { name: '평택 제조시설 안전보건관리비 집행', num: '2024-0108', project: '평택 제조시설 증설', period: '2023/06/01~2024/12/31', round: '2차', planned: '8,500,000,000', accumulated: '31,120,000' },
  { name: '광명 데이터센터 산업안전보건관리비', num: '2025-0016', project: '광명 데이터센터 신축', period: '2025/02/01~2026/08/31', round: '1차', planned: '15,700,000,000', accumulated: '9,820,000' },
];
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

export const VALIDATION_DASHBOARD_RESULT: ValidationDashboardResult = {
  id: 'validation-202604-001',
  checkedAt: '2026-04-30 14:18',
  usageStatementFile: '동탄_산안비_사용내역서_2026-04.xlsx',
  lawAgent: {
    name: '법령 agent',
    version: '산업안전보건관리비 고시 기준 검토',
    basis: '산업안전보건법 및 건설업 산업안전보건관리비 계상 및 사용기준',
  },
  categories: [
    {
      categoryId: 1,
      categoryName: CATS[0].label,
      usageAmount: 3200000,
      recognizedAmount: 3200000,
      disputedAmount: 0,
      decision: 'appropriate',
      riskLevel: 'low',
      evidenceSummary: {
        requiredTypes: ['사용내역서', '영수증', '세금내역서', '선임계'],
        submittedFiles: [
          { id: 'seed-1-r', name: '안전관리자_선임수수료_1월.pdf', kind: 'receipt' },
          { id: 'seed-1-t', name: '세금내역서_안전관리자_1월.pdf', kind: 'tax_invoice' },
          { id: 'seed-1-o', name: '안전관리자_선임계.pdf', kind: 'other_document' },
        ],
        missingTypes: [],
        problematicFiles: [],
      },
      legalBasis: [{ lawName: '건설업 산업안전보건관리비 계상 및 사용기준', article: '제7조', summary: '안전관리자 등 인건비와 업무수행 비용은 목적에 맞는 경우 사용 가능 항목입니다.', agentReasoning: '사용내역서 금액과 영수증, 세금내역서가 일치하고 선임 관련 문서가 제출되어 적정으로 판단했습니다.' }],
      issues: [],
    },
    {
      categoryId: 2,
      categoryName: CATS[1].label,
      usageAmount: 5800000,
      recognizedAmount: 5800000,
      disputedAmount: 0,
      decision: 'appropriate',
      riskLevel: 'low',
      evidenceSummary: {
        requiredTypes: ['사용내역서', '영수증', '현장사진'],
        submittedFiles: [
          { id: 'seed-2-r', name: '보건관리_용역비_청구서.pdf', kind: 'receipt' },
          { id: 'seed-2-p', name: '보건시설_점검_사진.jpg', kind: 'site_photo' },
        ],
        missingTypes: [],
        problematicFiles: [],
      },
      legalBasis: [{ lawName: '건설업 산업안전보건관리비 계상 및 사용기준', article: '제7조', summary: '안전시설 및 보건관리 활동에 직접 필요한 비용은 목적 적합성이 확인되면 인정됩니다.', agentReasoning: '현장 설치 및 점검 사진이 제출되어 보건관리 활동과 비용의 직접 관련성이 확인됩니다.' }],
      issues: [],
    },
    {
      categoryId: 3,
      categoryName: CATS[2].label,
      usageAmount: 1450000,
      recognizedAmount: 1450000,
      disputedAmount: 0,
      decision: 'appropriate',
      riskLevel: 'low',
      evidenceSummary: {
        requiredTypes: ['사용내역서', '교육비 영수증', '교육 이수 자료'],
        submittedFiles: [
          { id: 'seed-3-r', name: '안전교육_수강료_영수증.jpg', kind: 'receipt' },
          { id: 'seed-3-o', name: '보호구_지급대장.xlsx', kind: 'other_document' },
        ],
        missingTypes: [],
        problematicFiles: [],
      },
      legalBasis: [{ lawName: '산업안전보건법', article: '제29조', summary: '근로자 안전보건교육은 사업주의 의무이며 관련 비용은 목적 적합성 검토 대상입니다.', agentReasoning: '교육비 영수증과 사용내역서 금액이 일치하고 교육 목적이 확인되어 적정으로 판단했습니다.' }],
      issues: [],
    },
    {
      categoryId: 4,
      categoryName: CATS[3].label,
      usageAmount: 1200000,
      recognizedAmount: 980000,
      disputedAmount: 220000,
      decision: 'inappropriate',
      riskLevel: 'high',
      evidenceSummary: {
        requiredTypes: ['사용내역서', '구매 영수증', '지급대장', '현장 착용 사진'],
        submittedFiles: [
          { id: 'seed-4-r1', name: '안전모_구입_영수증.jpg', kind: 'receipt' },
          { id: 'seed-4-r2', name: '보호구_세트_영수증.pdf', kind: 'receipt' },
          { id: 'seed-4-p', name: '보호구_착용확인.jpg', kind: 'site_photo' },
        ],
        missingTypes: ['지급대장 일부'],
        problematicFiles: [{ fileName: '보호구_세트_영수증.pdf', kind: 'receipt', reason: '사용내역서 보호구 금액 1,200,000원 대비 영수증 합계가 980,000원으로 220,000원 부족합니다.' }],
      },
      legalBasis: [{ lawName: '건설업 산업안전보건관리비 계상 및 사용기준', article: '제7조', clause: '사용내역 증빙', summary: '사용내역서와 증빙 금액의 일치 및 목적 외 사용 여부를 확인해야 합니다.', agentReasoning: '금액 불일치가 존재하고 지급대장 일부가 없어 초과 기재분 220,000원은 인정하기 어렵습니다.' }],
      issues: [{ title: '사용내역서와 영수증 금액 불일치', description: '보호구 항목의 증빙 합계가 사용내역서보다 작아 초과 계상 가능성이 있습니다.', problemFileNames: ['보호구_세트_영수증.pdf'], requiredAction: '사용내역서 금액을 증빙 합계에 맞게 정정하거나 부족 금액에 대한 추가 영수증을 제출해야 합니다.', recommendedFiles: ['누락 구매 영수증', '보호구 지급대장 보완본'] }],
    },
    {
      categoryId: 5,
      categoryName: CATS[4].label,
      usageAmount: 3100000,
      recognizedAmount: 2250000,
      disputedAmount: 850000,
      decision: 'conditional',
      riskLevel: 'medium',
      evidenceSummary: {
        requiredTypes: ['사용내역서', '설치 영수증', '현장 설치 사진', '설치확인서'],
        submittedFiles: [
          { id: 'seed-5-r', name: '안전난간_영수증.jpg', kind: 'receipt' },
          { id: 'seed-5-p', name: '안전시설_전체사진.jpg', kind: 'site_photo' },
          { id: 'seed-5-o', name: '안전시설_설치확인서.pdf', kind: 'other_document' },
        ],
        missingTypes: ['안전난간 상세 설치 사진'],
        problematicFiles: [{ fileName: '안전난간_영수증.jpg', kind: 'receipt', reason: '850,000원 상당 안전난간 부품의 설치 위치와 완성 상태를 특정할 현장사진이 부족합니다.' }],
      },
      legalBasis: [{ lawName: '건설업 산업안전보건관리비 계상 및 사용기준', article: '제7조', summary: '안전시설 설치비는 현장 안전조치와 직접 관련된 설치 사실이 확인되어야 합니다.', agentReasoning: '영수증과 설치확인서는 있으나 일부 품목의 설치 사진이 부족해 조건부 인정으로 판단했습니다.' }],
      issues: [{ title: '현장 설치 증빙 부족', description: '안전난간 부품 구매 사실은 확인되지만 실제 설치 상태 확인 자료가 부족합니다.', problemFileNames: ['안전난간_영수증.jpg'], requiredAction: '안전난간 설치 위치와 완성 상태가 보이는 사진을 추가 제출해야 합니다.', recommendedFiles: ['안전난간 상세 설치 사진', '설치 전후 비교 사진'] }],
    },
    {
      categoryId: 6,
      categoryName: CATS[5].label,
      usageAmount: 800000,
      recognizedAmount: 800000,
      disputedAmount: 0,
      decision: 'appropriate',
      riskLevel: 'low',
      evidenceSummary: {
        requiredTypes: ['진단 용역 계약/청구서', '현장 확인 자료'],
        submittedFiles: [
          { id: 'seed-6-r', name: '안전보건진단_용역비.pdf', kind: 'receipt' },
          { id: 'seed-6-p', name: '안전보건진단_현장사진.jpg', kind: 'site_photo' },
        ],
        missingTypes: [],
        problematicFiles: [],
      },
      legalBasis: [{ lawName: '산업안전보건법', article: '제47조', summary: '안전보건진단 등 예방 목적의 전문 진단 비용은 관련성과 증빙을 기준으로 검토합니다.', agentReasoning: '진단 수행 자료와 청구서가 함께 제출되어 비용의 목적 적합성이 확인됩니다.' }],
      issues: [],
    },
    {
      categoryId: 7,
      categoryName: CATS[6].label,
      usageAmount: 2100000,
      recognizedAmount: 2100000,
      disputedAmount: 0,
      decision: 'appropriate',
      riskLevel: 'low',
      evidenceSummary: {
        requiredTypes: ['기술지도 영수증', '세금내역서', '결과 자료'],
        submittedFiles: [
          { id: 'seed-7-r', name: '위험성평가_수수료_1차.pdf', kind: 'receipt' },
          { id: 'seed-7-t', name: '세금내역서_위험성평가_6월.pdf', kind: 'tax_invoice' },
          { id: 'seed-7-p', name: '위험성평가_결과사진.jpg', kind: 'site_photo' },
        ],
        missingTypes: [],
        problematicFiles: [],
      },
      legalBasis: [{ lawName: '산업안전보건법', article: '제36조', summary: '위험성평가와 그 결과 개선에 필요한 비용은 예방 활동의 직접성을 기준으로 판단합니다.', agentReasoning: '위험성평가 수행, 결과 확인, 세금내역서가 모두 제출되어 적정으로 판단했습니다.' }],
      issues: [],
    },
    {
      categoryId: 8,
      categoryName: CATS[7].label,
      usageAmount: 4800000,
      recognizedAmount: 3792600,
      disputedAmount: 1007400,
      decision: 'inappropriate',
      riskLevel: 'high',
      evidenceSummary: {
        requiredTypes: ['사용내역서', '본사 전담조직 인건비 산정표', '업무분장 자료'],
        submittedFiles: [
          { id: 'seed-8-r1', name: '본사_관리비_1분기.pdf', kind: 'receipt' },
          { id: 'seed-8-r2', name: '본사_인건비_2분기.pdf', kind: 'receipt' },
        ],
        missingTypes: ['전담조직 업무분장표', '인건비 산정 근거'],
        problematicFiles: [{ fileName: '본사_운영비_영수증.jpg', kind: 'receipt', reason: '본사 공통 운영비 성격으로 산안비 직접 사용 여부가 불명확합니다.' }],
      },
      legalBasis: [{ lawName: '건설업 산업안전보건관리비 계상 및 사용기준', article: '제5조', clause: '본사 사용비 한도', summary: '본사 전담조직 관련 비용은 정해진 인정 범위와 직접 관련성 확인이 필요합니다.', agentReasoning: '본사 사용비가 내부 산정 기준상 인정 가능 범위를 초과했고 직접 수행 근거가 부족해 초과분은 부적정으로 판단했습니다.' }],
      issues: [{ title: '본사 사용비 인정 범위 초과', description: '현재 계상액 중 1,007,400원은 인정 가능 범위를 초과한 것으로 산정됩니다.', problemFileNames: ['본사_운영비_영수증.jpg'], requiredAction: '본사 전담조직 인건비 산정표와 업무분장 자료를 제출하고 초과분을 정정해야 합니다.', recommendedFiles: ['전담조직 업무분장표', '인건비 산정표', '직접 수행 내역서'] }],
    },
    {
      categoryId: 9,
      categoryName: CATS[8].label,
      usageAmount: 4200000,
      recognizedAmount: 4200000,
      disputedAmount: 0,
      decision: 'appropriate',
      riskLevel: 'low',
      evidenceSummary: {
        requiredTypes: ['건강관리 청구서', '건강검진 자료', '세금내역서'],
        submittedFiles: [
          { id: 'seed-9-r', name: '건강검진_청구서_1차.pdf', kind: 'receipt' },
          { id: 'seed-9-t', name: '세금내역서_건강관리_7월.pdf', kind: 'tax_invoice' },
          { id: 'seed-9-p', name: '근로자_건강관리_현장.jpg', kind: 'site_photo' },
        ],
        missingTypes: [],
        problematicFiles: [],
      },
      legalBasis: [{ lawName: '산업안전보건법', article: '제129조', summary: '근로자 건강진단 및 건강장해 예방 조치는 관련 비용의 적정성 검토 대상입니다.', agentReasoning: '건강검진 청구서와 현장 수행 자료가 제출되어 건강장해 예방 목적이 확인됩니다.' }],
      issues: [],
    },
  ],
};

let FILE_SEQ = 0;
export const nextFileId = () => `file-${++FILE_SEQ}`;
export const isImageFile = (name: string) => /\.(png|jpe?g|gif|webp)$/i.test(name || '');
const makeMockUploadedDate = () => {
  const day = (FILE_SEQ % 5) + 18;
  return `2026-04-${String(day).padStart(2, '0')}`;
};
const makeMockUploader = (kind: EvidenceCategory) => {
  if (kind === 'site_photo') return '김현장';
  if (kind === 'usage_statement') return '박공무';
  if (kind === 'tax_invoice') return '회계담당자';
  return 'SHE 담당자';
};
export const classifyEvidenceToCategoryIds = (name: string, description = ''): number[] => {
  const text = `${name} ${description}`.toLowerCase();
  const matches = CATS.filter((cat) => CATEGORY_KEYWORDS[cat.id].some((keyword) => text.includes(keyword.toLowerCase()))).map((cat) => cat.id);
  return matches.length > 0 ? matches.slice(0, 3) : [((name.length % CATS.length) || CATS.length)];
};
export const getCategoryLabels = (categoryIds: number[]) => categoryIds.map((id) => CATS.find((cat) => cat.id === id)?.short || `${id}번 항목`);
const getDefaultUsageItemIds = (categoryIds: number[]) => categoryIds
  .map((categoryId) => USAGE_LINE_ITEMS.find((item) => item.categoryId === categoryId)?.id)
  .filter(Boolean) as string[];
export const makeEntry = (name: string, kind: EvidenceCategory, extra: Partial<EvidenceFile> = {}): EvidenceFile => {
  const categoryIds = extra.categoryIds || classifyEvidenceToCategoryIds(name, extra.description || '');
  return ({
  id: extra.id || nextFileId(),
  name,
  kind,
  description: extra.description || (kind === 'site_photo' ? (SITE_DESCRIPTION_SEED[name] || '') : ''),
  amount: extra.amount || '',
  previewUrl: extra.previewUrl || '',
  uploadedAt: extra.uploadedAt || makeMockUploadedDate(),
  uploadedBy: extra.uploadedBy || makeMockUploader(kind),
  categoryIds,
  usageItemIds: extra.usageItemIds || getDefaultUsageItemIds(categoryIds),
  });
};
export const createEntryFromFile = (file: File, kind: EvidenceCategory, extra: Partial<EvidenceFile> = {}): EvidenceFile => makeEntry(file.name, kind, {
  ...extra,
  previewUrl: isImageFile(file.name) ? URL.createObjectURL(file) : '',
  uploadedAt: extra.uploadedAt || new Date().toISOString().slice(0, 10),
  uploadedBy: extra.uploadedBy || '현재 사용자',
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
const seedArchiveEntries = (categories: ArchiveCategoryMap, source: MockFileBuckets, kind: FolderEvidenceCategory) => {
  Object.entries(source).forEach(([catId, list]) => {
    const usageItems = USAGE_LINE_ITEMS.filter((item) => item.categoryId === Number(catId));
    const fallbackUsageId = usageItems[0]?.id || `cat-${catId}`;
    list.forEach((name, index) => {
      const usageItemId = usageItems[index % Math.max(usageItems.length, 1)]?.id || fallbackUsageId;
      putArchiveFile(categories, catId, usageItemId, kind, makeEntry(name, kind, { categoryIds: [Number(catId)], usageItemIds: [usageItemId] }));
    });
  });
};
const seedProjectUsageStatements = (source: MockFileBuckets): EvidenceFile[] =>
  Object.values(source).flatMap((list) => list.map((name) => makeEntry(name, 'usage_statement', { categoryIds: [] })));
export const normalizeArchiveData = (seed: ArchiveSeed | null): ArchiveSeed => {
  const base = createDefaultArchiveData();
  if (!seed) return base;
  const legacySeed = seed as unknown as Partial<Record<FolderEvidenceCategory, unknown>> & { usage_statement?: EvidenceFile[] | ArchiveCategoryMap; categories?: ArchiveCategoryMap };
  const rawUsageStatement = legacySeed.usage_statement as EvidenceFile[] | ArchiveCategoryMap;
  const usageStatement = Array.isArray(rawUsageStatement)
    ? rawUsageStatement
    : Object.values(rawUsageStatement || {}).flatMap((value) => Array.isArray(value) ? value : Object.values(value).flat());
  const withUploader = (kind: EvidenceCategory, files: EvidenceFile[]) =>
    files.map((file) => ({ ...file, uploadedBy: file.uploadedBy || makeMockUploader(kind), uploadedAt: file.uploadedAt || makeMockUploadedDate() }));
  const normalizeCategories = (source: ArchiveCategoryMap) => {
    const next: ArchiveCategoryMap = {};
    Object.entries(source || {}).forEach(([catId, lineMap]) => {
      Object.entries(lineMap || {}).forEach(([usageItemId, kindMap]) => {
        (Object.keys(kindMap || {}) as FolderEvidenceCategory[]).forEach((kind) => {
          withUploader(kind, kindMap[kind] || []).forEach((file) => {
            putArchiveFile(next, catId, usageItemId, kind, { ...file, kind, categoryIds: file.categoryIds?.length ? file.categoryIds : [Number(catId)], usageItemIds: file.usageItemIds?.length ? file.usageItemIds : [usageItemId] });
          });
        });
      });
    });
    return next;
  };
  const migrateLegacyKind = (categories: ArchiveCategoryMap, kind: FolderEvidenceCategory, source: unknown) => {
    Object.entries((source || {}) as Record<string, unknown>).forEach(([catId, lineMapOrFiles]) => {
      if (Array.isArray(lineMapOrFiles)) {
        const fallbackUsageId = USAGE_LINE_ITEMS.find((item) => item.categoryId === Number(catId))?.id || `cat-${catId}`;
        withUploader(kind, lineMapOrFiles as EvidenceFile[]).forEach((file) => putArchiveFile(categories, catId, fallbackUsageId, kind, { ...file, kind, categoryIds: file.categoryIds?.length ? file.categoryIds : [Number(catId)], usageItemIds: file.usageItemIds?.length ? file.usageItemIds : [fallbackUsageId] }));
        return;
      }
      Object.entries((lineMapOrFiles || {}) as Record<string, EvidenceFile[]>).forEach(([usageItemId, files]) => {
        withUploader(kind, files).forEach((file) => putArchiveFile(categories, catId, usageItemId, kind, { ...file, kind, categoryIds: file.categoryIds?.length ? file.categoryIds : [Number(catId)], usageItemIds: file.usageItemIds?.length ? file.usageItemIds : [usageItemId] }));
      });
    });
  };
  const categories = legacySeed.categories ? normalizeCategories(legacySeed.categories) : {};
  if (!legacySeed.categories) {
    (['receipt', 'site_photo', 'tax_invoice', 'other_document'] as const).forEach((kind) => migrateLegacyKind(categories, kind, legacySeed[kind]));
  }
  return {
    usage_statement: withUploader('usage_statement', usageStatement).map((file) => ({ ...file, kind: 'usage_statement', categoryIds: [] })),
    categories: Object.keys(categories).length ? categories : base.categories,
  };
};
export const createDefaultArchiveData = (): ArchiveSeed => {
  const categories: ArchiveCategoryMap = {};
  seedArchiveEntries(categories, MOCK_FILES.receipt, 'receipt');
  seedArchiveEntries(categories, MOCK_FILES.site_photo, 'site_photo');
  seedArchiveEntries(categories, MOCK_FILES.tax_invoice, 'tax_invoice');
  seedArchiveEntries(categories, MOCK_FILES.other_document, 'other_document');
  return {
    usage_statement: seedProjectUsageStatements(MOCK_FILES.usage_statement),
    categories,
  };
};
export const buildArchiveDataFromUploads = (files?: UploadedEvidenceMap | null): ArchiveSeed => {
  const base = createDefaultArchiveData();
  if (!files) return base;
  (['receipt', 'site_photo', 'tax_invoice', 'other_document'] as const).forEach((kind) => {
    const list = files[kind] || [];
    list.forEach((entry, index) => {
      const categoryIds = entry.categoryIds?.length ? entry.categoryIds : [((index % CATS.length) + 1)];
      categoryIds.forEach((categoryId) => {
        const catId = String(categoryId);
        const usageItemIds = entry.usageItemIds?.length ? entry.usageItemIds : getDefaultUsageItemIds([categoryId]);
        const targetUsageIds = usageItemIds.length ? usageItemIds : [`cat-${catId}`];
        targetUsageIds.forEach((usageItemId) => {
          putArchiveFile(base.categories, catId, usageItemId, kind, { ...entry, id: entry.id || nextFileId(), kind, categoryIds, usageItemIds: [usageItemId] });
        });
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
