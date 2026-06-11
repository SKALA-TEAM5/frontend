import type { ValidationDashboardResult } from '../types/domain';
import { CATS, fmt } from './evidence-utils';
import type { ProjectSummary } from './project-data';

export interface ReportTable {
  title: string | null;
  headers: string[];
  rows: string[][];
}

export interface ReportSection {
  section_id: string;
  title: string;
  kind: 'cover' | 'table' | 'detail' | 'opinion';
  paragraphs: string[];
  tables: ReportTable[];
}

export interface ReportDraft {
  layout_version: 'safety_cost_report_v1';
  report_no: string;
  title: string;
  site_name: string;
  report_period_label: string;
  written_date_label: string;
  department_label: string;
  reviewer_label: string;
  basic_info: Record<string, string>;
  amount_summary: Array<{ label: string; amount: string; ratio_label: string; count_label: string }>;
  category_summaries: Array<{ category_code: string; category_name: string; amount: string; count: number; note: string }>;
  evidence_validation_summaries: Array<{ evidence_type_code: string; evidence_type_name: string; submitted_count: number; passed_count: number; error_count: number; missing_count: number; major_error: string }>;
  conclusion: string;
  item_reviews: Array<{ no: number; category_code: string; item_name: string; amount: string; decision: string; decision_label: string; summary_reason: string; risk_level: string }>;
  issue_details: Array<{ issue_type: string; no: number; title: string; amount_label: string; problem: string; legal_basis: string; agent_conclusion: string; required_action: string }>;
  overall_opinion: string;
  report_sections: ReportSection[];
  needs_human_review: string[];
}

const decisionLabel: Record<string, string> = {
  appropriate: '적정',
  conditional: '조건부',
  inappropriate: '부적정',
};

const riskLabel: Record<string, string> = {
  low: '낮음',
  medium: '중간',
  high: '높음',
};

const todayLabel = () => {
  const now = new Date();
  return `${now.getFullYear()}년 ${String(now.getMonth() + 1).padStart(2, '0')}월 ${String(now.getDate()).padStart(2, '0')}일`;
};

export const buildReportDraftJson = (project: ProjectSummary | null, result: ValidationDashboardResult, contractName: string): ReportDraft => {
  const siteName = project?.constructionName || contractName;
  const reportNo = `AR-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
  const writtenDate = todayLabel();
  const totalUsage = result.categories.reduce((sum, item) => sum + item.usageAmount, 0);
  const totalRecognized = result.categories.reduce((sum, item) => sum + item.recognizedAmount, 0);
  const issues = result.categories.flatMap((category) => category.issues.map((issue) => ({ ...issue, category })));
  const reportPeriod = result.checkedAt || '검토 기간 미지정';

  const amountSummary = [
    { label: '법정 계상액 (기준)', amount: String(project?.plannedAmount?.replace(/\D/g, '') || totalUsage), ratio_label: '100.0%', count_label: '-' },
    { label: '당기 집행 누계액', amount: String(totalRecognized), ratio_label: `${Math.round((totalRecognized / totalUsage) * 100)}%`, count_label: `${result.categories.length}개 항목` },
    { label: '잔액 (미집행)', amount: String(Math.max(0, Number(project?.plannedAmount?.replace(/\D/g, '') || totalUsage) - totalRecognized)), ratio_label: '-', count_label: '-' },
    { label: '이번 검토 대상 금액 (월)', amount: String(totalUsage), ratio_label: '100.0%', count_label: `${issues.length}건` },
  ];
  const categorySummaries = CATS.map((cat) => {
    const category = result.categories.find((item) => item.categoryId === cat.id);
    return {
    category_code: String(category?.categoryId || cat.id),
    category_name: category?.categoryName || cat.label,
    amount: String(category?.usageAmount || 0),
    count: category?.issues.length || 0,
    note: category?.issues.length ? `보완 필요 ${category.issues.length}건 포함` : '특이사항 없음',
    };
  });
  const dynamicOtherEvidenceNames = Array.from(new Set(issues.flatMap((issue) => issue.recommendedFiles))).filter((name) => !['영수증', '거래명세서', '현장사진', '세금계산서', '제3자발급사실조회서', '사용내역서'].some((baseName) => name.includes(baseName)));
  const evidenceSummaries = [
    { evidence_type_code: 'usage_statement', evidence_type_name: '사용내역서', submitted_count: 1, passed_count: 1, error_count: 0, missing_count: 0, major_error: '-' },
    { evidence_type_code: 'receipt', evidence_type_name: '영수증 / 거래명세서', submitted_count: 0, passed_count: 0, error_count: issues.filter((issue) => issue.problemFileNames.length).length, missing_count: issues.filter((issue) => issue.recommendedFiles.length).length, major_error: issues[0]?.title || '-' },
    { evidence_type_code: 'site_photo', evidence_type_name: '현장사진', submitted_count: 0, passed_count: 0, error_count: 0, missing_count: 0, major_error: '-' },
    { evidence_type_code: 'tax_invoice', evidence_type_name: '세금계산서 + 제3자발급사실조회서', submitted_count: 0, passed_count: 0, error_count: 0, missing_count: 0, major_error: '-' },
    ...(dynamicOtherEvidenceNames.length
      ? dynamicOtherEvidenceNames.map((name) => ({ evidence_type_code: `other_document:${name}`, evidence_type_name: `기타서류 (${name})`, submitted_count: 0, passed_count: 0, error_count: 0, missing_count: 1, major_error: `${name} 보완 필요` }))
      : [{ evidence_type_code: 'other_document', evidence_type_name: '기타서류', submitted_count: 0, passed_count: 0, error_count: 0, missing_count: 0, major_error: '-' }]),
  ];
  const issueDetails = issues.map((issue, index) => ({
    issue_type: issue.category.decision,
    no: index + 1,
    title: issue.title,
    amount_label: fmt(issue.category.disputedAmount),
    problem: issue.description,
    legal_basis: issue.category.legalBasis.map((basis) => `${basis.lawName} ${basis.article}${basis.clause ? ` ${basis.clause}` : ''}`).join(', ') || '-',
    agent_conclusion: issue.description,
    required_action: issue.requiredAction,
  }));
  const conclusion = issues.length
    ? `${issues.length}건의 부적정 또는 보완 필요 사항이 확인되어 담당자 확인 및 자료 보완이 필요합니다.`
    : '검토 대상 항목에서 즉시 보완이 필요한 리스크는 확인되지 않았습니다.';
  const overallOpinion = `${reportPeriod} 기준 산업안전보건관리비 집행 내역에 대한 증빙 검토를 완료했습니다. ${conclusion} 본 보고서는 시스템 검증 결과를 바탕으로 자동 생성된 초안이며, 최종 판단 및 결재는 담당자 확인을 통해 확정해야 합니다.`;

  const basicInfo = {
    '보고서 번호': reportNo,
    '검토 일자': writtenDate,
    현장명: siteName,
    프로젝트번호: project?.contractNumber || '-',
    발주처: project?.client || '-',
    시공사: project?.constructionCompany || '-',
    계약금액: project ? `${project.constructionAmount}원` : '-',
    공사기간: project?.period || '-',
    '검토 대상 기간': reportPeriod,
    검토자: 'SHE 담당자',
    '검토 목적': '산업안전보건관리비 집행 증빙 적정성 확인',
  };

  return {
    layout_version: 'safety_cost_report_v1',
    report_no: reportNo,
    title: '산업안전보건관리비 집행 증빙 검토 결과 보고서',
    site_name: siteName,
    report_period_label: reportPeriod,
    written_date_label: writtenDate,
    department_label: '안전관리팀',
    reviewer_label: 'SHE 담당자',
    basic_info: basicInfo,
    amount_summary: amountSummary,
    category_summaries: categorySummaries,
    evidence_validation_summaries: evidenceSummaries,
    conclusion,
    item_reviews: result.categories.map((category, index) => ({
      no: index + 1,
      category_code: String(category.categoryId),
      item_name: category.categoryName,
      amount: String(category.usageAmount),
      decision: category.decision,
      decision_label: decisionLabel[category.decision],
      summary_reason: category.issues[0]?.title || '특이사항 없음',
      risk_level: riskLabel[category.riskLevel],
    })),
    issue_details: issueDetails,
    overall_opinion: overallOpinion,
    report_sections: [
      {
        section_id: 'cover',
        title: '산업안전보건관리비 집행 증빙 검토 결과 보고서',
        kind: 'cover',
        paragraphs: [],
        tables: [{ title: null, headers: [], rows: [['현장명', siteName], ['검토 대상 기간', reportPeriod], ['보고서 번호', reportNo], ['작성일', writtenDate], ['작성 부서', '안전관리팀']] }],
      },
      {
        section_id: 'basic_info',
        title: '1. 기본 정보',
        kind: 'table',
        paragraphs: [],
        tables: [{ title: null, headers: [], rows: Object.entries(basicInfo).reduce<string[][]>((rows, entry, index, entries) => index % 2 === 0 ? [...rows, [...entry, ...(entries[index + 1] || ['', ''])]] : rows, []) }],
      },
      {
        section_id: 'execution_summary',
        title: '2. 집행 내역 요약',
        kind: 'table',
        paragraphs: [],
        tables: [
          { title: null, headers: ['구분', '금액', '집행률', '비고'], rows: amountSummary.map((item) => [item.label, fmt(Number(item.amount)), item.ratio_label, item.count_label]) },
          { title: '항목별 집행 현황 (법정 9개 항목 기준)', headers: ['집행 항목', '집행액 (원)', '건수', '비고'], rows: [...categorySummaries.map((item) => [item.category_name, fmt(Number(item.amount)), `${item.count}건`, item.note]), ['합   계', fmt(totalUsage), `${issues.length}건`, conclusion]] },
        ],
      },
      {
        section_id: 'evidence_validation',
        title: '3. 증빙 유효성 검증 결과',
        kind: 'table',
        paragraphs: [],
        tables: [{ title: null, headers: ['증빙 유형', '제출', '통과', '오류', '누락', '주요 내용'], rows: [...evidenceSummaries.map((item) => [item.evidence_type_name, `${item.submitted_count}건`, `${item.passed_count}건`, `${item.error_count}건`, `${item.missing_count}건`, item.major_error]), ['합   계', `${evidenceSummaries.reduce((sum, item) => sum + item.submitted_count, 0)}건`, `${evidenceSummaries.reduce((sum, item) => sum + item.passed_count, 0)}건`, `${evidenceSummaries.reduce((sum, item) => sum + item.error_count, 0)}건`, `${evidenceSummaries.reduce((sum, item) => sum + item.missing_count, 0)}건`, conclusion]] }],
      },
      {
        section_id: 'item_reviews',
        title: '4. 항목별 적정성 검토 결과',
        kind: 'table',
        paragraphs: [],
        tables: [{ title: null, headers: ['No.', '집행 항목', '집행액', '판정', '요약 사유'], rows: result.categories.length ? result.categories.map((category, index) => [String(index + 1), category.categoryName, fmt(category.usageAmount), decisionLabel[category.decision], category.issues[0]?.title || '특이사항 없음']) : [['-', '검토 대상 없음', '-', '-', '-']] }],
      },
      {
        section_id: 'issue_details',
        title: '5. 부적정 및 검토 필요 상세 내역',
        kind: 'detail',
        paragraphs: [],
        tables: issueDetails.length ? issueDetails.map((issue) => ({ title: `5.${issue.no} ${issue.title}`, headers: [], rows: [['집행 금액', issue.amount_label], ['확인된 문제', issue.problem], ['법령 근거', issue.legal_basis], ['필요 조치', issue.required_action]] })) : [{ title: null, headers: [], rows: [['확인 결과', '부적정 및 검토 필요 상세 내역이 없습니다.']] }],
      },
      {
        section_id: 'overall_opinion',
        title: '6. 종합 의견',
        kind: 'opinion',
        paragraphs: ['본 보고서는 AI 증빙 검토 시스템(v2.1)에 의해 자동 생성되었으며, 최종 판단 및 결재는 담당자 및 책임자의 확인을 거쳐야 합니다.', overallOpinion, '검 토 자 :   SHE 담당자          (서명)  ______________________', `검토 일자 :   ${writtenDate}`, '[회사명] 안전관리팀'],
        tables: [],
      },
    ],
    needs_human_review: [],
  };
};
