import type { AppUser } from './permissions';
import { can } from './permissions';
import type { ProjectSummary } from './project-data';
import { getStageByIndex, type ProjectStageId } from './project-stages';

export type ProjectActionKind =
  | 'uploadEvidence'
  | 'runValidation'
  | 'requestAction'
  | 'uploadSupplement'
  | 'requestReport'
  | 'reviewReport'
  | 'confirmFinalReport'
  | 'viewHistory';

export type ProjectActionTargetTab = 'overview' | 'upload' | 'validation' | 'report' | 'archive';

export interface ProjectAction {
  kind: ProjectActionKind;
  label: string;
  description: string;
  targetTab: ProjectActionTargetTab;
  priority: 'primary' | 'secondary';
}

const makeAction = (
  kind: ProjectActionKind,
  label: string,
  description: string,
  targetTab: ProjectActionTargetTab,
  priority: ProjectAction['priority'] = 'primary',
): ProjectAction => ({ kind, label, description, targetTab, priority });

export const getProjectStageId = (project: ProjectSummary): ProjectStageId => project.stageId || getStageByIndex(project.stageIndex).id;

export const getAvailableProjectActions = (user: AppUser, project: ProjectSummary): ProjectAction[] => {
  const stageId = getProjectStageId(project);
  const actions: ProjectAction[] = [];

  if ((stageId === 'registered' || stageId === 'upload') && can(user, 'uploadEvidence')) {
    actions.push(makeAction('uploadEvidence', '증빙자료 업로드', '참여 중인 프로젝트의 정산 증빙을 제출합니다.', 'upload'));
  }

  if ((stageId === 'photo_check' || stageId === 'validation' || stageId === 'supplement_validation') && can(user, 'runValidation')) {
    actions.push(makeAction('runValidation', '유효성 검증', '업로드된 증빙을 기준으로 검증을 실행하고 결과를 확인합니다.', 'validation'));
  }

  if ((stageId === 'she_review' || stageId === 'action_request') && can(user, 'requestAction')) {
    actions.push(makeAction('requestAction', '조치 요청 등록', '검증 결과에 따라 현장 보완 조치를 요청합니다.', 'validation'));
  }

  if ((stageId === 'action_request' || stageId === 'supplement_validation') && project.hasActionRequest && can(user, 'uploadEvidence')) {
    actions.push(makeAction('uploadSupplement', '보완 증빙 업로드', '요청받은 조치에 대한 보완 자료를 제출합니다.', 'upload'));
  }

  if (stageId === 'report_generation' && can(user, 'requestReport')) {
    actions.push(makeAction('requestReport', '보고서 요청', '검증 결과와 보완 현황을 바탕으로 보고서 초안을 요청합니다.', 'report'));
  }

  if (stageId === 'report_generation' && can(user, 'reviewReport')) {
    actions.push(makeAction('reviewReport', '보고서 검토', '생성된 보고서 초안을 검토하고 수정 의견을 확인합니다.', 'report'));
  }

  if (actions.length === 0) {
    actions.push(makeAction('viewHistory', '진행 이력 확인', '현재 단계에서 직접 처리할 작업은 없으며 진행 이력을 확인할 수 있습니다.', 'archive', 'secondary'));
  }

  return actions;
};

export const getPrimaryProjectAction = (user: AppUser, project: ProjectSummary) =>
  getAvailableProjectActions(user, project)[0];
