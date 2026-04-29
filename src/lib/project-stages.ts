export type ProjectStageId =
  | 'registered'
  | 'upload'
  | 'photo_check'
  | 'validation'
  | 'she_review'
  | 'action_request'
  | 'supplement_validation'
  | 'report_generation';

export interface ProjectStageDefinition {
  id: ProjectStageId;
  label: string;
}

export const PROJECT_STAGE_DEFINITIONS: ProjectStageDefinition[] = [
  { id: 'registered', label: '등록' },
  { id: 'upload', label: '증빙 업로드' },
  { id: 'photo_check', label: '현장사진 검증' },
  { id: 'validation', label: '유효성 검증' },
  { id: 'she_review', label: 'SHE 검토' },
  { id: 'action_request', label: '조치 요청' },
  { id: 'supplement_validation', label: '보완/재검증' },
  { id: 'report_generation', label: '보고서 생성' },
];

export const PROJECT_STAGES = PROJECT_STAGE_DEFINITIONS.map((stage) => stage.label);

export const getStageIndex = (stageId: ProjectStageId) =>
  PROJECT_STAGE_DEFINITIONS.findIndex((stage) => stage.id === stageId);

export const getStageLabel = (stageId: ProjectStageId) =>
  PROJECT_STAGE_DEFINITIONS.find((stage) => stage.id === stageId)?.label || stageId;

export const getStageByIndex = (stageIndex: number) =>
  PROJECT_STAGE_DEFINITIONS[stageIndex] || PROJECT_STAGE_DEFINITIONS[0];
