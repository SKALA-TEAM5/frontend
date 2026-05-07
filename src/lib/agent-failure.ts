export type AgentFailureTarget =
  | 'usage-classification'
  | 'evidence-matching'
  | 'photo-validation'
  | 'legal-validation'
  | 'report-generation'
  | 'server-request';

const AGENT_FAILURE_LABELS: Record<AgentFailureTarget, string> = {
  'usage-classification': '사용내역서 분류',
  'evidence-matching': '증빙자료 매칭',
  'photo-validation': '현장사진 검증',
  'legal-validation': '유효성 검증',
  'report-generation': '보고서 생성',
  'server-request': '서버 요청',
};

export const getAgentFailureMessage = (target: AgentFailureTarget) =>
  `${AGENT_FAILURE_LABELS[target]}에 실패했습니다. 잠시 후 다시 시도해주세요.`;
