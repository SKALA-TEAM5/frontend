import type { OrchestratorTodo } from '../../lib/agent-api';
import type { UsageStatementArchiveData } from '../../lib/archive-api';
import type { ProjectSummary, UsageWorkflowStatus } from '../../lib/project-data';
import type { UpdateProjectInput } from '../../lib/project-api';

export type DetailTab = 'overview' | 'details' | 'validation' | 'report';

export type UsageUploadStage = 'idle' | 'ocr' | 'classifying';

export type ClassificationMoveNotice = {
  id: string;
  itemName: string;
  fromCategoryName: string;
  toCategoryName: string;
  reason?: string;
};

export type SharedWorkflowStatus = UsageWorkflowStatus;

export type MonthUsageStatementArchiveData = UsageStatementArchiveData & {
  workflowStatus?: SharedWorkflowStatus;
  actionRequestDetails?: ProjectSummary['actionRequestDetails'];
  orchestratorTodos?: OrchestratorTodo[];
  legalResultCode?: string | null;
  legalReady?: boolean;
  legalDisabledReason?: string | null;
  reportReady?: boolean;
  reportDisabledReason?: string | null;
};

export type UsageStatementInfoDraft = UpdateProjectInput & {
  contractNumber: string;
  constructionName: string;
  constructionCompany: string;
  representative: string;
  client: string;
  constructionAmount: string;
  appropriatedAmount: string;
  startDate: string;
  endDate: string;
  location: string;
  progressRate: string;
  usageRate: string;
  uploadedAt: string;
  documentWrittenDate: string;
  assigneeUserIds: number[];
  sheAssigneeUserIds: number[];
};
