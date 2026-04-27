export type ProjectStageId =
  | 'registered'
  | 'evidence_upload'
  | 'validation'
  | 'she_review'
  | 'action_request'
  | 'supplement_upload'
  | 'report_draft'
  | 'report_review'
  | 'finalized';

export interface ProjectStageDefinition {
  id: ProjectStageId;
  label: string;
}

export const PROJECT_STAGE_DEFINITIONS: ProjectStageDefinition[] = [
  { id: 'registered', label: '프로젝트 등록' },
  { id: 'evidence_upload', label: '서류/증빙 업로드' },
  { id: 'validation', label: '유효성 검증' },
  { id: 'she_review', label: 'SHE 검토' },
  { id: 'action_request', label: '현장 조치 요청' },
  { id: 'supplement_upload', label: '보완 업로드' },
  { id: 'report_draft', label: '보고서 초안 생성' },
  { id: 'report_review', label: '사용자 수정' },
  { id: 'finalized', label: '최종 보고서 확정' },
];

export const PROJECT_STAGES = PROJECT_STAGE_DEFINITIONS.map((stage) => stage.label);

export const getStageIndex = (stageId: ProjectStageId) =>
  PROJECT_STAGE_DEFINITIONS.findIndex((stage) => stage.id === stageId);

export const getStageLabel = (stageId: ProjectStageId) =>
  PROJECT_STAGE_DEFINITIONS.find((stage) => stage.id === stageId)?.label || stageId;

export const getStageByIndex = (stageIndex: number) =>
  PROJECT_STAGE_DEFINITIONS[stageIndex] || PROJECT_STAGE_DEFINITIONS[0];
