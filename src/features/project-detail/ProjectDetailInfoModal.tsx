import ProjectInfoEditorModal from '../../components/project/ProjectInfoEditorModal';
import type { ProjectAssigneeCandidate } from '../../lib/project-api';
import type { UsageStatementInfoDraft } from './project-detail-types';

interface ProjectDetailInfoModalProps {
  open: boolean;
  constructionName: string;
  draft: UsageStatementInfoDraft;
  error: string;
  saving: boolean;
  managerCandidates: ProjectAssigneeCandidate[];
  sheManagerCandidates: ProjectAssigneeCandidate[];
  onClose: () => void;
  onSave: () => void;
  onChange: (patch: Partial<UsageStatementInfoDraft>) => void;
}

const toAssigneeOption = (candidate: ProjectAssigneeCandidate) => ({
  userId: candidate.id,
  realName: candidate.realName,
  employeeNo: candidate.employeeNo,
});

export default function ProjectDetailInfoModal({
  open,
  constructionName,
  draft,
  error,
  saving,
  managerCandidates,
  sheManagerCandidates,
  onClose,
  onSave,
  onChange,
}: ProjectDetailInfoModalProps) {
  return (
    <ProjectInfoEditorModal
      open={open}
      mode="usage"
      title="사용내역서 기본 정보 수정"
      subtitle={constructionName}
      draft={draft}
      error={error}
      saving={saving}
      assigneeOptions={managerCandidates.map(toAssigneeOption)}
      sheAssigneeOptions={sheManagerCandidates.map(toAssigneeOption)}
      onClose={onClose}
      onSave={onSave}
      onChange={onChange}
    />
  );
}
