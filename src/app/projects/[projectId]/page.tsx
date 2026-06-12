'use client';
import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Card from '../../../components/ui/Card';
import CenterModal from '../../../components/ui/CenterModal';
import InlineLoader from '../../../components/ui/InlineLoader';
import Modal from '../../../components/ui/Modal';
import ProjectInfoEditorModal from '../../../components/project/ProjectInfoEditorModal';
import { ChevronIcon } from '../../../components/ui';
import { AppFrame } from '../../../components/common';
import { ApiClientError } from '../../../lib/api-client';
import { C } from '../../../lib/theme';
import { EMPTY_PROJECT, PROJECT_STATUS_CODE, USAGE_WORKFLOW_STATUS, getProjectManagers, getProjectSheManagers, normalizeUsageWorkflowStatus, STATUS_META, type MonthlyUsageStatementSummary, type ProjectSummary, type UsageWorkflowStatus } from '../../../lib/project-data';
import { getProject, isProjectManagerRole, isSheManagerRole, listProjectManagerCandidates, listSheManagerCandidates, replaceProjectAssignees, updateProject, type UpdateProjectInput } from '../../../lib/project-api';
import type { BackendUserProfile } from '../../../lib/auth-api';
import { completeUsageStatementReview, deleteProjectFile, deleteUsageStatement, getLatestUsageStatementArchive, getProjectArchiveFromCategories, getUsageStatementArchiveById, listProjectFiles, listUsageStatementArchives, submitUsageStatement, uploadProjectFile, type UsageStatementArchiveData } from '../../../lib/archive-api';
import { getAgentFailureMessage, type AgentFailureTarget } from '../../../lib/agent-failure';
import { getAgentButtonStates, getOrchestratorStatus, isAgentStageRunning, parseUsageStatementWithOcr, waitForAgentButtonEnabled, type AgentButtonStage, type OrchestratorTodo } from '../../../lib/agent-api';
import { can } from '../../../lib/permissions';
import { useCurrentUser } from '../../../lib/dev-user';
import UsageStatementDetailScreen from '../../../features/project-tab/UsageStatementDetailScreen';
import VerifyScreen, { type ValidationGateItem } from '../../../features/project-tab/VerifyScreen';
import ReportScreen from '../../../features/project-tab/ReportScreen';
import { CATS, type UsageLineItem } from '../../../lib/evidence-utils';
import type { ArchiveSeed } from '../../../types/domain';
type DetailTab = 'overview' | 'details' | 'validation' | 'report';
const FALLBACK_ACTION_ASSIGNEE = '프로젝트 담당자';

const getProjectAssigneeNames = (project: ProjectSummary) => {
    const names = project.participants.length > 0 ? project.participants : getProjectManagers(project);
    return names.filter(Boolean);
};

const getProjectAssigneeLabel = (project: ProjectSummary) => {
    const names = getProjectAssigneeNames(project);
    return names.length > 0 ? names.join(', ') : FALLBACK_ACTION_ASSIGNEE;
};
const getProjectSheManagerNames = (project: ProjectSummary) => getProjectSheManagers(project).filter(Boolean);
const getProjectSheManagerLabel = (project: ProjectSummary) => {
    const names = getProjectSheManagerNames(project);
    return names.length > 0 ? names.join(', ') : '-';
};
type UsageStatementInfoDraft = UpdateProjectInput & {
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
type UsageUploadStage = 'idle' | 'ocr' | 'classifying';
type ClassificationMoveNotice = {
    id: string;
    itemName: string;
    fromCategoryName: string;
    toCategoryName: string;
    reason?: string;
};
type SharedWorkflowStatus = UsageWorkflowStatus;
type MonthUsageStatementArchiveData = UsageStatementArchiveData & {
    workflowStatus?: SharedWorkflowStatus;
    actionRequestDetails?: ProjectSummary['actionRequestDetails'];
    orchestratorTodos?: OrchestratorTodo[];
    legalResultCode?: string | null;
    legalReady?: boolean;
    legalDisabledReason?: string | null;
    reportReady?: boolean;
    reportDisabledReason?: string | null;
};
const EVIDENCE_TYPE_LABELS: Record<string, string> = {
    usage_statement: '사용내역서',
    receipt: '영수증',
    tax_invoice: '세금계산서',
    tax_invoice_confirm: '세금계산서 확인서',
    third_party_lookup: '제3자발급사실조회서',
    transaction_statement: '거래명세서',
    site_photo: '현장사진',
    item_photo: '물품 사진',
    wearing_photo: '착용 확인 사진',
    work_photo: '작업 사진',
    appointment_report: '선임 신고서',
    pay_stub: '급여명세서',
    work_log: '업무일지',
    daily_output_log: '일일 출력일보',
    inspection_log: '점검일지',
    supply_ledger: '지급대장',
    inventory_ledger: '재고대장',
    edu_confirm: '교육 확인서',
    edu_attendance: '교육 참석자 명단',
    transfer_confirm: '이체확인증',
    health_checkup_result: '건강검진 결과서',
    health_checkup_contract: '건강검진 계약서',
    tech_guidance_contract: '기술지도 계약서',
    tech_guidance_report: '기술지도 보고서',
    tech_guidance_photo: '기술지도 사진',
    usage_statement_file: '사용내역서',
    usage_statement_doc: '사용내역서',
    other_document: '기타 자료',
};
const normalizeEvidenceTypeLabel = (value: string) => {
    const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
    return EVIDENCE_TYPE_LABELS[normalized] || value.trim();
};
const formatActionGuideReason = (reason: string) => {
    const withoutNumber = reason.trim().replace(/^\d+\.\s*/, '').trim();
    const missingMatch = withoutNumber.match(/^필수\s*증빙\s*누락\s*[:：]\s*(.+)$/u);
    if (missingMatch) {
        const documents = missingMatch[1]
            .split(/[,/·ㆍ，、]/)
            .map((item) => normalizeEvidenceTypeLabel(item))
            .filter(Boolean);
        if (documents.length > 0) return `${documents.join(', ')}가 누락되었습니다.`;
    }
    const translated = withoutNumber.replace(/\b[a-z][a-z0-9_-]*\b/gi, (match) => normalizeEvidenceTypeLabel(match));
    return /[.!?。]$/.test(translated) ? translated : `${translated}.`;
};
const parseActionGuideReasons = (reason: string) => {
    const normalized = reason
        .replace(/\r/g, '')
        .replace(/\s+(?=\d+\.\s*)/g, '\n')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    return normalized.length > 0 ? normalized.map(formatActionGuideReason) : [];
};
const TABS: Array<{
    id: DetailTab;
    label: string;
}> = [
    { id: 'overview', label: '사용내역서' },
    { id: 'details', label: '세부 내역' },
    { id: 'validation', label: '법령 검증' },
    { id: 'report', label: '보고서' },
];
const DETAIL_TABS = new Set<DetailTab>(['overview', 'details', 'validation', 'report']);
const EMPTY_USAGE_STATEMENT: MonthlyUsageStatementSummary = {
    month: '',
    label: '사용내역서',
    sourceFileName: '-',
    revisionNo: 0,
    documentWrittenDate: '-',
    uploadedAt: '-',
    uploadedBy: '-',
    parseStatus: '-',
    validationStatus: '-',
    currentAmount: '0',
    cumulativeAmount: '0',
    evidenceCount: 0,
    issueCount: 0,
};
const EMPTY_OVERVIEW_ROWS = [...CATS.map((cat) => [`${cat.id}. ${cat.label}`, '-', '-', '-'] as [string, string, string, string]), ['계', '-', '-', '-'] as [string, string, string, string]];
const formatMonthLabel = (month: string) => {
    const [year, monthNo] = month.split('-');
    return `${year}년 ${Number(monthNo)}월`;
};
const normalizeMonthKey = (month?: string | null) => {
    if (!month)
        return '';
    const match = month.match(/^(\d{4})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}` : month;
};
const toMonthKeyFromDate = (value?: string | null) => {
    const match = value?.trim().replace(/\//g, '-').match(/^(\d{4})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}` : '';
};
const parseProjectPeriodMonthRange = (period: string) => {
    const [startDate = '', endDate = ''] = period.split('~').map((value) => value.trim());
    return {
        startMonth: toMonthKeyFromDate(startDate),
        endMonth: toMonthKeyFromDate(endDate),
    };
};
const asRecord = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const readStringField = (source: unknown, keys: string[]) => {
    const record = asRecord(source);
    if (!record)
        return '';
    for (const key of keys) {
        const value = record[key];
        if (typeof value === 'string' && value.trim())
            return value.trim();
        if (typeof value === 'number' && Number.isFinite(value))
            return String(value);
    }
    return '';
};
const readRecordField = (source: unknown, keys: string[]) => {
    const record = asRecord(source);
    if (!record)
        return null;
    for (const key of keys) {
        const value = asRecord(record[key]);
        if (value)
            return value;
    }
    return null;
};
const categoryIdFromCode = (value: string) => {
    const match = value.match(/\d+/);
    if (!match)
        return undefined;
    const categoryId = Number(match[0]);
    return Number.isFinite(categoryId) ? categoryId : undefined;
};
const categoryNameFromClassificationValue = (value: string) => {
    if (!value)
        return '';
    const categoryId = categoryIdFromCode(value);
    const category = categoryId ? CATS.find((cat) => cat.id === categoryId) : undefined;
    return (category?.short || value).replace(/\s+/g, ' ').trim();
};
const extractClassificationMoveNotices = (workflow: unknown): ClassificationMoveNotice[] => {
    const workflowRecord = asRecord(workflow);
    const workflowResult = workflowRecord?.result;
    const resultRecord = asRecord(workflowResult);
    const classifierDetails = readRecordField(workflowResult, ['classifierDetails', 'classifier_details'])
        || readRecordField(workflow, ['classifierDetails', 'classifier_details'])
        || readRecordField(workflowResult, ['details'])
        || readRecordField(workflow, ['details']);
    const payload = readRecordField(classifierDetails, ['payload'])
        || readRecordField(workflowResult, ['payload'])
        || readRecordField(workflow, ['payload']);
    const classification = resultRecord?.classification || workflowRecord?.classification || workflow;
    const items = [
        ...asArray(payload?.changes),
        ...asArray(payload?.results),
        ...asArray(asRecord(classification)?.lineItems),
        ...asArray(asRecord(classification)?.line_items),
        ...asArray(asRecord(classification)?.items),
    ];
    const seen = new Set<string>();
    return items.flatMap((item, index) => {
        const before = readRecordField(item, ['before']);
        const after = readRecordField(item, ['after']);
        const fromCategory = readStringField(item, [
            'givenCategoryCode',
            'given_category_code',
            'originalCategoryCode',
            'original_category_code',
            'previousCategoryCode',
            'previous_category_code',
            'sourceCategoryCode',
            'source_category_code',
            'beforeCategoryCode',
            'before_category_code',
        ]) || readStringField(before, ['categoryCode', 'category_code']);
        const toCategory = readStringField(item, [
            'recommendedCategoryCode',
            'recommended_category_code',
            'classifiedCategoryCode',
            'classified_category_code',
            'targetCategoryCode',
            'target_category_code',
            'finalCategoryCode',
            'final_category_code',
            'decidedCategoryCode',
            'decided_category_code',
            'newCategoryCode',
            'new_category_code',
            'changedCategoryCode',
            'changed_category_code',
        ]) || readStringField(after, ['categoryCode', 'category_code']);
        if (!fromCategory || !toCategory || fromCategory === toCategory)
            return [];
        const id = `${readStringField(item, ['rowId', 'row_id', 'id', 'itemId', 'item_id', 'lineId', 'line_id']) || index}`;
        const dedupeKey = `${id}:${fromCategory}:${toCategory}`;
        if (seen.has(dedupeKey))
            return [];
        seen.add(dedupeKey);
        return [{
            id,
            itemName: readStringField(item, ['itemName', 'item_name', 'name', 'usageItemName', 'usage_item_name']) || '사용내역서 세부항목',
            fromCategoryName: categoryNameFromClassificationValue(fromCategory),
            toCategoryName: categoryNameFromClassificationValue(toCategory),
            reason: readStringField(item, ['reason', 'classificationReason', 'classification_reason', 'decisionReason', 'decision_reason', 'rationale']),
        }];
    });
};
const getNextMonthKey = (month?: string) => {
    const base = month ? new Date(`${month}-01`) : new Date();
    if (Number.isNaN(base.getTime()))
        return new Date().toISOString().slice(0, 7);
    base.setMonth(base.getMonth() + 1);
    return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`;
};
const isSupplementClearedWorkflow = (status?: string | null) => {
    const normalized = normalizeUsageWorkflowStatus(status);
    return normalized === USAGE_WORKFLOW_STATUS.UPLOAD_COMPLETED || normalized === USAGE_WORKFLOW_STATUS.REVIEW_COMPLETED;
};
const applyWorkflowToProject = (project: ProjectSummary, status: SharedWorkflowStatus, actionRequestDetails?: ProjectSummary['actionRequestDetails']): ProjectSummary => ({
    ...project,
    hasActionRequest: status === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED,
    actionRequestDetails: status === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED ? actionRequestDetails : undefined,
    reportReady: status === USAGE_WORKFLOW_STATUS.REVIEW_COMPLETED || status === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED,
});
const withActionRequestMonth = (details: ProjectSummary['actionRequestDetails'] | undefined, month?: string): ProjectSummary['actionRequestDetails'] | undefined => {
    if (!details)
        return details;
    return details.month || !month ? details : { ...details, month };
};
const orchestratorTodosToDetails = (todos: OrchestratorTodo[], month?: string, assignee = FALLBACK_ACTION_ASSIGNEE): ProjectSummary['actionRequestDetails'] | undefined => {
    const openTodos = todos.filter((todo) => todo.statusCode !== 'closed' && !todo.confirmed);
    if (!openTodos.length)
        return undefined;
    const reason = openTodos.map((todo, index) => `${index + 1}. ${formatActionGuideReason(todo.reason)}`).join('\n');
    return {
        title: '부족한 서류 안내',
        reason,
        assignee,
        dueDate: '',
        requestedAt: '-',
        month,
    };
};
const getPendingOrchestratorTodos = (todos: OrchestratorTodo[] = []) => todos.filter((todo) => todo.statusCode !== 'closed' && !todo.confirmed);
const formatLegalDisabledReason = (reason?: string | null) => {
    const text = (reason || '').trim();
    if (!text)
        return '세부 내역 탭에서 유효성 검증을 먼저 실행해야 합니다.';
    if (text.includes('validate를 먼저 실행'))
        return '세부 내역 탭에서 유효성 검증을 먼저 실행해야 합니다.';
    return text;
};
const buildValidationGateItems = (input: { usageStatementUploaded: boolean; uploadCompleted: boolean; legalReady: boolean; legalDisabledReason?: string | null }): ValidationGateItem[] => {
    return [{
        id: 'upload-completed',
        label: '업로드 완료',
        required: true,
        state: input.usageStatementUploaded ? (input.uploadCompleted ? 'passed' : 'waiting') : 'failed',
        statusText: input.uploadCompleted ? '완료' : '대기',
        detail: input.usageStatementUploaded
            ? '프로젝트 담당자가 해당 월 사용내역서의 업로드 완료를 눌러야 합니다.'
            : '사용내역서를 먼저 업로드해야 합니다.',
    },
    {
        id: 'validity-check',
        label: '유효성 검증',
        required: true,
        state: input.legalReady ? 'passed' : 'waiting',
        statusText: input.legalReady ? '완료' : '대기',
        detail: input.legalReady
            ? '유효성 검증 조건이 충족되었습니다.'
            : formatLegalDisabledReason(input.legalDisabledReason),
    }];
};
const getUsageStatementOcrFailureReason = (file: File) => {
    const fileName = file.name.toLowerCase();
    const supportedExtension = /\.pdf$/i.test(file.name);
    const supportedMime = !file.type || file.type === 'application/pdf';
    if (!supportedExtension || !supportedMime)
        return '사용내역서는 PDF 파일만 지원합니다.';
    if (file.size <= 0 || /empty|blank|null|빈|공백|추출실패/.test(fileName))
        return '사용내역서에서 필요한 값을 추출하지 못했습니다.';
    if (/date|날짜|기간오류|일자오류|날짜오류|이상/.test(fileName))
        return '문서의 작성일 또는 정산 월 정보가 올바르지 않습니다.';
    if (/blur|low|poor|quality|화질|흐림|저화질|흔들림/.test(fileName))
        return '문서 이미지의 화질이 낮아 금액과 날짜를 정확히 읽을 수 없습니다.';
    return null;
};
function ProjectDetailPageContent() {
    const router = useRouter();
    const params = useParams<{
        projectId: string;
    }>();
    const searchParams = useSearchParams();
    const { user } = useCurrentUser();
    const projectId = params?.projectId || '';
    const [project, setProject] = useState<ProjectSummary>(EMPTY_PROJECT);
    const [projectLoading, setProjectLoading] = useState(true);
    const [projectError, setProjectError] = useState('');
    const [dbUsageStatementsByMonth, setDbUsageStatementsByMonth] = useState<Record<string, MonthUsageStatementArchiveData>>({});
    const latestFallbackStatement = EMPTY_USAGE_STATEMENT;
    const canUploadEvidence = can(user, 'uploadEvidence');
    const canRunValidation = can(user, 'runValidation');
    const canReviewReport = can(user, 'reviewReport');
    const availableTabs = TABS.filter((tab) => {
        if (tab.id === 'validation')
            return canRunValidation;
        if (tab.id === 'report')
            return canReviewReport;
        return true;
    });
    const availableTabIds = new Set(availableTabs.map((tab) => tab.id));
    const requestedTabParam = searchParams.get('tab');
    const requestedMonth = normalizeMonthKey(searchParams.get('month'));
    const requestedTab = requestedTabParam && DETAIL_TABS.has(requestedTabParam as DetailTab) && availableTabIds.has(requestedTabParam as DetailTab) ? requestedTabParam as DetailTab : 'overview';
    const [activeTab, setActiveTab] = useState<DetailTab>(requestedTab);
    const [archiveSeed, setArchiveSeed] = useState<ArchiveSeed | null>(null);
    const [archiveUsageItems, setArchiveUsageItems] = useState<UsageLineItem[]>([]);
    const [selectedMonth, setSelectedMonth] = useState(requestedMonth);
    const [usageUploadStage, setUsageUploadStage] = useState<UsageUploadStage>('idle');
    const [validationStatusByMonth, setValidationStatusByMonth] = useState<Record<string, 'idle' | 'running' | 'done'>>({});
    const [projectHeaderOpen, setProjectHeaderOpen] = useState(true);
    const [actionGuideOpen, setActionGuideOpen] = useState(false);
    const [actionGuideClosingMotion, setActionGuideClosingMotion] = useState<{ x: number; y: number; scale: number } | null>(null);
    const [actionCompletionSent, setActionCompletionSent] = useState(false);
    const [todoClearSignal, setTodoClearSignal] = useState(0);
    const [uploadCompleteSubmitting, setUploadCompleteSubmitting] = useState(false);
    const [projectInfoModalOpen, setProjectInfoModalOpen] = useState(false);
    const [monthCreateModalOpen, setMonthCreateModalOpen] = useState(false);
    const [newMonthYear, setNewMonthYear] = useState(String(new Date().getFullYear()));
    const [newMonthNo, setNewMonthNo] = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
    const [newMonthError, setNewMonthError] = useState('');
    const [monthDeleteTarget, setMonthDeleteTarget] = useState<MonthlyUsageStatementSummary | null>(null);
    const [monthDeleting, setMonthDeleting] = useState(false);
    const [monthDeleteError, setMonthDeleteError] = useState('');
    const [agentFailureTarget, setAgentFailureTarget] = useState<AgentFailureTarget | null>(null);
    const [agentFailureMessage, setAgentFailureMessage] = useState('');
    const [usageUploadFailureMessage, setUsageUploadFailureMessage] = useState('');
    const [ocrFailureReason, setOcrFailureReason] = useState('');
    const [duplicateUsageMonthWarning, setDuplicateUsageMonthWarning] = useState('');
    const [classificationMoveNotices, setClassificationMoveNotices] = useState<ClassificationMoveNotice[]>([]);
    const [projectInfoDraft, setProjectInfoDraft] = useState<UsageStatementInfoDraft>({
        contractNumber: '',
        constructionName: '',
        constructionCompany: '',
        representative: '',
        client: '',
        constructionAmount: '',
        appropriatedAmount: '',
        startDate: '',
        endDate: '',
        location: '',
        projectStatusCode: PROJECT_STATUS_CODE.ACTIVE,
        progressRate: '',
        usageRate: '',
        uploadedAt: '',
        documentWrittenDate: '',
        assigneeUserIds: [],
        sheAssigneeUserIds: [],
    });
    const [projectInfoSaveError, setProjectInfoSaveError] = useState('');
    const [projectInfoSaving, setProjectInfoSaving] = useState(false);
    const [managerCandidates, setManagerCandidates] = useState<BackendUserProfile[]>([]);
    const [sheManagerCandidates, setSheManagerCandidates] = useState<BackendUserProfile[]>([]);
    const [statementOverrides, setStatementOverrides] = useState<Record<string, Partial<MonthlyUsageStatementSummary>>>({});
    const showAgentFailure = (target: AgentFailureTarget, error?: unknown) => {
        setAgentFailureTarget(target);
        setAgentFailureMessage(getAgentFailureMessage(target, error));
    };
    const actionGuideCardRef = useRef<HTMLDivElement | null>(null);
    const actionRequestBadgeRef = useRef<HTMLButtonElement | null>(null);
    const monthHistoryPushedRef = useRef(false);
    const usageUploadTimersRef = useRef<number[]>([]);
    const monthlyStatements = useMemo(() => {
        const byMonth = new Map<string, MonthlyUsageStatementSummary>();
        Object.values(dbUsageStatementsByMonth).forEach((entry) => {
            const month = normalizeMonthKey(entry.statementSummary.month);
            if (!month)
                return;
            byMonth.set(month, {
                ...entry.statementSummary,
                month,
                label: formatMonthLabel(month),
                ...(statementOverrides[month] || {}),
            });
        });
        return Array.from(byMonth.values()).toSorted((a, b) => a.month.localeCompare(b.month));
    }, [dbUsageStatementsByMonth, statementOverrides]);
    const latestStatement = monthlyStatements[monthlyStatements.length - 1] || latestFallbackStatement;
    const patchMonthWorkflow = (month: string, status: SharedWorkflowStatus, actionRequestDetails?: ProjectSummary['actionRequestDetails']) => {
        if (!month)
            return;
        setDbUsageStatementsByMonth((current) => {
            const entry = current[month];
            if (!entry)
                return current;
            return {
                ...current,
                [month]: {
                    ...entry,
                    workflowStatus: status,
                    actionRequestDetails: status === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED ? withActionRequestMonth(actionRequestDetails, month) : undefined,
                    orchestratorTodos: status === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED ? entry.orchestratorTodos : [],
                },
            };
        });
    };
    const attachOrchestratorState = async (item: UsageStatementArchiveData): Promise<MonthUsageStatementArchiveData> => {
        const month = normalizeMonthKey(item.statementSummary.month);
        if (!item.usageStatementId) {
            return { ...item, statementSummary: { ...item.statementSummary, month, label: formatMonthLabel(month) } };
        }
        try {
            const archiveWorkflowStatus = normalizeUsageWorkflowStatus(item.workflowStatus);
            const clearedByWorkflow = archiveWorkflowStatus !== USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED
                && isSupplementClearedWorkflow(archiveWorkflowStatus);
            const status = await getOrchestratorStatus(project.id || projectId, item.usageStatementId);
            const todos = clearedByWorkflow ? [] : status.todos || [];
            const pendingTodos = getPendingOrchestratorTodos(todos);
            const actionRequestDetails = orchestratorTodosToDetails(pendingTodos, month, getProjectAssigneeLabel(project));
            return {
                ...item,
                statementSummary: { ...item.statementSummary, month, label: formatMonthLabel(month) },
                workflowStatus: clearedByWorkflow
                    ? (archiveWorkflowStatus || item.workflowStatus)
                    : actionRequestDetails ? USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED : item.workflowStatus,
                actionRequestDetails,
                orchestratorTodos: todos,
                legalResultCode: status.legalResultCode,
                legalReady: status.legalReady,
                legalDisabledReason: status.legalDisabledReason,
                reportReady: status.reportReady,
                reportDisabledReason: status.reportDisabledReason,
            };
        } catch {
            return { ...item, statementSummary: { ...item.statementSummary, month, label: formatMonthLabel(month) } };
        }
    };
    const refreshArchiveData = async (targetProjectId: string) => {
        const [statementArchives, latestData, archiveData] = await Promise.all([
            listUsageStatementArchives(targetProjectId).catch(() => []),
            getLatestUsageStatementArchive(targetProjectId).catch(() => null),
            getProjectArchiveFromCategories(targetProjectId).catch(() => null),
        ]);
        const mergedWithOrchestrator = await Promise.all(statementArchives.map(attachOrchestratorState));
        if (mergedWithOrchestrator.length) {
            setDbUsageStatementsByMonth(Object.fromEntries(mergedWithOrchestrator.map((item) => {
                const month = normalizeMonthKey(item.statementSummary.month);
                return [month, {
                    ...item,
                    statementSummary: {
                        ...item.statementSummary,
                        month,
                        label: formatMonthLabel(month),
                    },
                    actionRequestDetails: withActionRequestMonth(item.actionRequestDetails, month),
                }];
            })) as Record<string, MonthUsageStatementArchiveData>);
        }
        if (latestData) {
            const latestMonth = normalizeMonthKey(latestData.statementSummary.month);
            const latestWithOrchestrator = mergedWithOrchestrator.find((item) => normalizeMonthKey(item.statementSummary.month) === latestMonth) || await attachOrchestratorState(latestData);
            const latestWorkflowStatus = latestWithOrchestrator.workflowStatus || latestData.workflowStatus || USAGE_WORKFLOW_STATUS.DRAFT;
            const latestActionRequestDetails = latestWithOrchestrator.actionRequestDetails;
            const mergedArchiveSeed = archiveData?.archiveSeed || latestData.archiveSeed;
            setArchiveSeed({
                usage_statement: latestData.archiveSeed.usage_statement.length ? latestData.archiveSeed.usage_statement : mergedArchiveSeed.usage_statement,
                categories: Object.keys(mergedArchiveSeed.categories || {}).length ? mergedArchiveSeed.categories : latestData.archiveSeed.categories,
            });
            setArchiveUsageItems(archiveData?.usageItems.length ? archiveData.usageItems : latestData.usageItems);
            setProject((current) => applyWorkflowToProject({
                ...current,
                hasUploads: latestData.statementSummary.evidenceCount > 0 || Boolean(latestData.statementSummary.sourceFileName && latestData.statementSummary.sourceFileName !== '-'),
                accumulatedAmount: latestData.statementSummary.cumulativeAmount,
                usageRate: calculateUsageRateText(latestData.statementSummary.cumulativeAmount, current.plannedAmount),
            }, latestWorkflowStatus, latestActionRequestDetails));
            return;
        }
        if (archiveData) {
            setArchiveSeed(archiveData.archiveSeed);
            setArchiveUsageItems(archiveData.usageItems);
            setProject((current) => applyWorkflowToProject({
                ...current,
                hasUploads: Boolean(archiveData.archiveSeed.usage_statement.length || archiveData.usageItems.length || current.hasUploads),
            }, normalizeUsageWorkflowStatus(current.latestUsageStatementStatusCode) || USAGE_WORKFLOW_STATUS.DRAFT));
        }
    };
    const selectedStatement = monthlyStatements.find((statement) => statement.month === selectedMonth) || latestStatement;
    const selectedStatementArchive = selectedStatement.month ? dbUsageStatementsByMonth[selectedStatement.month] : undefined;
    const selectedMonthHasUploadedStatement = Boolean(selectedStatement.sourceFileName && selectedStatement.sourceFileName !== '-');
    const hasUsageStatement = monthlyStatements.length > 0 || Boolean(archiveSeed?.usage_statement?.length || archiveUsageItems.length);
    const selectedValidationStatus = validationStatusByMonth[selectedStatement.month] || 'idle';
    const selectedOpenOrchestratorTodos = getPendingOrchestratorTodos(selectedStatementArchive?.orchestratorTodos);
    const selectedLegalResultCode = String(selectedStatementArchive?.legalResultCode || '').toLowerCase();
    const selectedLegalAllowsReport = selectedLegalResultCode === 'success' || selectedLegalResultCode === 'hil' || (!selectedLegalResultCode && selectedValidationStatus === 'done');
    const selectedReportGenerationEnabled = Boolean(
        selectedMonthHasUploadedStatement
        && selectedLegalAllowsReport
        && (selectedStatementArchive?.reportReady ?? selectedValidationStatus === 'done')
    );
    const selectedReportDisabledReason = selectedStatementArchive?.reportDisabledReason
        || (!selectedMonthHasUploadedStatement
            ? '사용내역서를 업로드한 뒤 법령 검증을 완료해야 보고서를 생성할 수 있습니다.'
            : !selectedLegalAllowsReport
                ? '법령 검증을 완료해야 보고서를 생성할 수 있습니다.'
                : '법령 검증 결과가 있어야 보고서 초안을 생성할 수 있습니다.');
    const selectedMonthHasActionRequest = Boolean(
        selectedStatementArchive?.workflowStatus === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED
        || selectedOpenOrchestratorTodos.length
    );
    const selectedMonthWorkflowStatus: SharedWorkflowStatus = selectedStatementArchive?.workflowStatus
        || (selectedMonthHasActionRequest
            ? USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED
            : selectedValidationStatus === 'done'
                ? USAGE_WORKFLOW_STATUS.REVIEW_COMPLETED
                : selectedMonthHasUploadedStatement
                    ? USAGE_WORKFLOW_STATUS.DRAFT
                    : USAGE_WORKFLOW_STATUS.DRAFT);
    const canSubmitUploadComplete = selectedMonthHasUploadedStatement
        && (selectedMonthWorkflowStatus === USAGE_WORKFLOW_STATUS.DRAFT
            || selectedMonthWorkflowStatus === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED);
    const uploadCompleteAlreadySubmitted = selectedMonthWorkflowStatus === USAGE_WORKFLOW_STATUS.UPLOAD_COMPLETED
        || selectedMonthWorkflowStatus === USAGE_WORKFLOW_STATUS.REVIEW_COMPLETED;
    const selectedMonthShouldDisplayWorkflowStatus = selectedMonthHasUploadedStatement || Boolean(selectedStatementArchive?.workflowStatus || selectedOpenOrchestratorTodos.length);
    const selectedMonthActionRequestDetails = selectedStatementArchive?.actionRequestDetails
        || orchestratorTodosToDetails(selectedOpenOrchestratorTodos, selectedStatement.month, getProjectAssigneeLabel(project))
        || (selectedMonthHasActionRequest ? withActionRequestMonth(project.actionRequestDetails, selectedStatement.month) : undefined);
    const selectedValidationGateItems = buildValidationGateItems({
        usageStatementUploaded: selectedMonthHasUploadedStatement,
        uploadCompleted: selectedMonthWorkflowStatus === USAGE_WORKFLOW_STATUS.UPLOAD_COMPLETED || selectedMonthWorkflowStatus === USAGE_WORKFLOW_STATUS.REVIEW_COMPLETED,
        legalReady: Boolean(selectedStatementArchive?.legalReady),
        legalDisabledReason: selectedStatementArchive?.legalDisabledReason,
    });
    const selectedValidationGateBlockedItem = selectedValidationGateItems.find((item) => item.state !== 'passed');
    const canStartValidationForCurrentView = Boolean(selectedStatementArchive?.usageStatementId)
        && selectedValidationGateItems.every((item) => item.state === 'passed');
    const selectedValidationDisabledReason = selectedValidationGateBlockedItem
        ? `${selectedValidationGateBlockedItem.label} 조건이 충족되어야 법령 검증을 시작할 수 있습니다.`
        : '사용내역서와 에이전트 검증 로그를 확인한 뒤 법령 검증을 시작할 수 있습니다.';
    const pushMonthHistory = () => {
        if (typeof window === 'undefined' || monthHistoryPushedRef.current)
            return;
        window.history.pushState({ iveriUsageMonth: true }, '', window.location.href);
        monthHistoryPushedRef.current = true;
    };
    const selectUsageMonth = (month: string) => {
        pushMonthHistory();
        setSelectedMonth(month);
        setActiveTab('overview');
        const archiveData = dbUsageStatementsByMonth[month];
        if (archiveData) {
            setArchiveSeed(archiveData.archiveSeed);
            setArchiveUsageItems(archiveData.usageItems);
        }
    };
    const openMonthCreateModal = () => {
        const nextMonth = getNextMonthKey(monthlyStatements[monthlyStatements.length - 1]?.month);
        setNewMonthYear(nextMonth.slice(0, 4));
        setNewMonthNo(nextMonth.slice(5, 7));
        setNewMonthError('');
        setMonthCreateModalOpen(true);
    };
    const addUsageMonth = () => {
        const year = Number(newMonthYear);
        const monthNo = Number(newMonthNo);
        if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(monthNo) || monthNo < 1 || monthNo > 12) {
            setNewMonthError('연도와 월을 올바르게 입력해 주세요.');
            return;
        }
        const month = `${year}-${String(monthNo).padStart(2, '0')}`;
        if (dbUsageStatementsByMonth[month]) {
            setNewMonthError('이미 추가된 월입니다.');
            return;
        }
        const { startMonth, endMonth } = parseProjectPeriodMonthRange(project.period);
        if (startMonth && endMonth && (month < startMonth || month > endMonth)) {
            setNewMonthError(`프로젝트 기간(${startMonth} ~ ${endMonth})에 맞지 않는 월입니다.`);
            return;
        }
        const statementSummary: MonthlyUsageStatementSummary = {
            month,
            label: formatMonthLabel(month),
            sourceFileName: '-',
            revisionNo: 0,
            documentWrittenDate: '-',
            uploadedAt: '-',
            uploadedBy: '-',
            parseStatus: '미업로드',
            validationStatus: '미검증',
            currentAmount: '0',
            cumulativeAmount: '0',
            evidenceCount: 0,
            issueCount: 0,
        };
        setDbUsageStatementsByMonth((current) => ({
            ...current,
            [month]: {
                archiveSeed: current[month]?.archiveSeed || { usage_statement: [], categories: {} },
                usageItems: current[month]?.usageItems || [],
                overviewRows: current[month]?.overviewRows || EMPTY_OVERVIEW_ROWS,
                statementSummary: current[month]?.statementSummary || statementSummary,
            },
        }));
        setArchiveSeed({ usage_statement: [], categories: {} });
        setArchiveUsageItems([]);
        pushMonthHistory();
        setSelectedMonth(month);
        setActiveTab('details');
        router.replace(`/projects/${project.id}?tab=details`, { scroll: false });
        setMonthCreateModalOpen(false);
    };
    const deleteUsageMonth = async () => {
        const targetMonth = monthDeleteTarget?.month;
        if (!targetMonth)
            return;
        const usageStatementId = dbUsageStatementsByMonth[targetMonth]?.usageStatementId;
        if (!usageStatementId) {
            setMonthDeleteError('삭제할 사용내역서 ID를 찾을 수 없습니다. 새로고침 후 다시 시도해 주세요.');
            return;
        }
        setMonthDeleting(true);
        setMonthDeleteError('');
        try {
            await deleteUsageStatement(project.id || projectId, usageStatementId);
        } catch (error) {
            const message = error instanceof ApiClientError && error.status === 405
                ? '백엔드에 사용내역서 삭제 API가 아직 연결되지 않았습니다.'
                : error instanceof Error ? error.message : '사용내역서 삭제에 실패했습니다.';
            setMonthDeleteError(message);
            return;
        } finally {
            setMonthDeleting(false);
        }
        setDbUsageStatementsByMonth((current) => {
            const next = { ...current };
            delete next[targetMonth];
            return next;
        });
        setStatementOverrides((current) => {
            const next = { ...current };
            delete next[targetMonth];
            return next;
        });
        setValidationStatusByMonth((current) => {
            const next = { ...current };
            delete next[targetMonth];
            return next;
        });
        if (selectedMonth === targetMonth) {
            setSelectedMonth('');
            setArchiveSeed(null);
            setArchiveUsageItems([]);
        }
        setMonthDeleteError('');
        setMonthDeleteTarget(null);
    };
    const canViewActionGuide = user.role === 'project_manager' && selectedMonthHasActionRequest && !actionCompletionSent && Boolean(selectedMonthActionRequestDetails);
    const currentUserId = Number(user.id);
    const isAssignedSheManager = user.role === 'she_manager'
        && (
            (Number.isFinite(currentUserId) && Boolean(project.sheManagerUserIds?.includes(currentUserId)))
            || getProjectSheManagerNames(project).includes(user.name)
        );
    const canEditManagers = user.role === 'system_admin' || isAssignedSheManager;
    const shouldPulseActionBadge = canViewActionGuide;
    useEffect(() => {
        if (!projectId)
            return;
        let alive = true;
        setProjectLoading(true);
        setProjectError('');
        getProject(projectId)
            .then((item) => {
                if (alive)
                    setProject(item);
            })
            .catch((error) => {
                if (alive)
                    setProjectError(error instanceof Error ? error.message : '프로젝트 정보를 불러오지 못했습니다.');
            })
            .finally(() => {
                if (alive)
                    setProjectLoading(false);
            });
        return () => {
            alive = false;
        };
    }, [projectId]);
    useEffect(() => {
        if (!project.id)
            return;
        let alive = true;
        setArchiveSeed(null);
        setArchiveUsageItems([]);
        setDbUsageStatementsByMonth({});
        setValidationStatusByMonth({});
        setActionGuideOpen(user.role === 'project_manager' && selectedMonthHasActionRequest);
        setActionCompletionSent(false);
        refreshArchiveData(project.id)
            .catch(() => {
                if (!alive)
                    return;
                setArchiveSeed(null);
            });
        listProjectFiles(project.id)
            .then((files) => {
                if (!alive)
                    return;
                const fileCount = Object.values(files).flat().length;
                setProject((current) => ({ ...current, hasUploads: fileCount > 0 || current.hasUploads }));
            })
            .catch(() => undefined);
        return () => {
            alive = false;
        };
    }, [project.id]);
    useEffect(() => {
        setActionGuideOpen(user.role === 'project_manager' && selectedMonthHasActionRequest);
    }, [selectedMonthHasActionRequest, user.role]);
    useEffect(() => () => {
        usageUploadTimersRef.current.forEach((timer) => window.clearTimeout(timer));
        usageUploadTimersRef.current = [];
    }, []);
    useEffect(() => {
        setProjectHeaderOpen(Boolean(selectedMonth));
    }, [selectedMonth]);
    useEffect(() => {
        if (!selectedMonth)
            monthHistoryPushedRef.current = false;
    }, [selectedMonth]);
    useEffect(() => {
        if (!selectedMonth)
            return;
        const handlePopState = () => {
            setSelectedMonth('');
            setActiveTab('overview');
            setArchiveSeed(null);
            setArchiveUsageItems([]);
            monthHistoryPushedRef.current = false;
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [selectedMonth]);
    useEffect(() => {
        setActiveTab(requestedTab);
    }, [requestedTab, requestedTabParam]);
    useEffect(() => {
        if (requestedMonth)
            setSelectedMonth(requestedMonth);
    }, [requestedMonth]);
    const updateTab = (tab: DetailTab) => {
        if (!availableTabIds.has(tab))
            return;
        setActiveTab(tab);
        router.replace(`/projects/${project.id}?tab=${tab}`, { scroll: false });
    };
    const openArchiveView = () => {
        setActiveTab('details');
        router.replace(`/projects/${project.id}?tab=details`, { scroll: false });
    };
    const revertReviewedProjectToDraft = () => {
        patchMonthWorkflow(selectedStatement.month, USAGE_WORKFLOW_STATUS.DRAFT);
        if (selectedStatement.month) {
            setDbUsageStatementsByMonth((current) => {
                const entry = current[selectedStatement.month];
                if (!entry)
                    return current;
                return {
                    ...current,
                    [selectedStatement.month]: {
                        ...entry,
                        legalReady: false,
                        legalResultCode: null,
                        legalDisabledReason: '유효성 검증을 다시 실행해야 합니다.',
                        reportReady: false,
                        reportDisabledReason: '법령 검증을 다시 완료해야 보고서를 생성할 수 있습니다.',
                    },
                };
            });
        }
        setProject((current) => ({ ...current, hasUploads: true }));
        setValidationStatusByMonth((prev) => prev[selectedStatement.month] ? { ...prev, [selectedStatement.month]: 'idle' } : prev);
    };
    const refreshSelectedAgentButtonState = async () => {
        const usageStatementId = selectedStatementArchive?.usageStatementId;
        if (!usageStatementId || !selectedStatement.month)
            return;
        const status = await getOrchestratorStatus(project.id, usageStatementId).catch(() => null);
        if (!status)
            return;
        setDbUsageStatementsByMonth((current) => {
            const entry = current[selectedStatement.month];
            if (!entry)
                return current;
            const archiveWorkflowStatus = normalizeUsageWorkflowStatus(entry.workflowStatus);
            const clearedByWorkflow = archiveWorkflowStatus !== USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED
                && isSupplementClearedWorkflow(archiveWorkflowStatus);
            const todos = clearedByWorkflow ? [] : status.todos || [];
            const pendingTodos = getPendingOrchestratorTodos(todos);
            return {
                ...current,
                [selectedStatement.month]: {
                    ...entry,
                    orchestratorTodos: todos,
                    actionRequestDetails: orchestratorTodosToDetails(pendingTodos, selectedStatement.month, getProjectAssigneeLabel(project)),
                    legalReady: status.legalReady,
                    legalDisabledReason: status.legalDisabledReason,
                    legalResultCode: status.legalResultCode,
                    reportReady: status.reportReady,
                    reportDisabledReason: status.reportDisabledReason,
                },
            };
        });
    };
    useEffect(() => {
        const usageStatementId = selectedStatementArchive?.usageStatementId;
        if (!project.id || !usageStatementId)
            return;
        let cancelled = false;
        const pollRunningAgent = async () => {
            const states = await getAgentButtonStates(project.id, usageStatementId).catch(() => null);
            if (!states || cancelled)
                return;
            const runningStage = (['report', 'legal', 'validate'] as AgentButtonStage[])
                .find((stage) => isAgentStageRunning(states, stage));
            if (!runningStage)
                return;
            await waitForAgentButtonEnabled(project.id, usageStatementId, runningStage).catch(() => null);
            if (cancelled)
                return;
            await refreshSelectedAgentButtonState();
            await refreshArchiveData(project.id);
        };
        void pollRunningAgent();
        return () => {
            cancelled = true;
        };
    }, [project.id, selectedStatement.month, selectedStatementArchive?.usageStatementId]);
    const completeReviewRequest = async () => {
        if (!canUploadEvidence || !hasUsageStatement || uploadCompleteSubmitting || !canSubmitUploadComplete)
            return;
        setUploadCompleteSubmitting(true);
        const usageStatementId = selectedStatementArchive?.usageStatementId;
        try {
            if (usageStatementId) {
                await submitUsageStatement(project.id, usageStatementId);
            }
            const nextWorkflowStatus: SharedWorkflowStatus = USAGE_WORKFLOW_STATUS.UPLOAD_COMPLETED;
            patchMonthWorkflow(selectedStatement.month, nextWorkflowStatus);
            setProject((current) => applyWorkflowToProject({
                ...current,
                hasUploads: true,
            }, nextWorkflowStatus));
            setValidationStatusByMonth((prev) => ({ ...prev, [selectedStatement.month]: 'idle' }));
            setActionCompletionSent(true);
            setActionGuideOpen(false);
            setActionGuideClosingMotion(null);
            setTodoClearSignal((signal) => signal + 1);
        } catch (error) {
            showAgentFailure('server-request', error);
        } finally {
            setUploadCompleteSubmitting(false);
        }
    };
    const loadManagerCandidates = async () => {
        if (managerCandidates.length > 0)
            return;
        const candidates = await listProjectManagerCandidates();
        setManagerCandidates(candidates);
    };
    const loadSheManagerCandidates = async () => {
        if (sheManagerCandidates.length > 0)
            return;
        const candidates = await listSheManagerCandidates();
        setSheManagerCandidates(candidates);
    };
    const openProjectInfoModal = () => {
        void Promise.all([loadManagerCandidates(), loadSheManagerCandidates()]).catch((error) => {
            setProjectInfoSaveError(error instanceof Error ? error.message : '담당자 목록을 불러오지 못했습니다.');
        });
        const { startDate, endDate } = parseProjectPeriod(project.period);
        setProjectInfoDraft({
            contractNumber: project.contractNumber,
            constructionName: project.constructionName,
            constructionCompany: project.constructionCompany,
            representative: project.representative,
            client: project.client,
            constructionAmount: String(project.constructionAmount || '').replace(/[^\d]/g, ''),
            appropriatedAmount: String(project.plannedAmount || '').replace(/[^\d]/g, ''),
            startDate,
            endDate,
            location: project.location,
            projectStatusCode: project.projectStatusCode,
            progressRate: project.progressRate,
            usageRate: `${safetyUsagePercent}%`,
            uploadedAt: selectedStatement.uploadedAt,
            documentWrittenDate: selectedStatement.documentWrittenDate,
            assigneeUserIds: project.assigneeUserIds || [],
            sheAssigneeUserIds: project.sheManagerUserIds || [],
        });
        setProjectInfoSaveError('');
        setProjectInfoModalOpen(true);
    };
    const uploadUsageStatementFromOverview = () => {
        if (!canUploadEvidence || usageUploadStage !== 'idle' || selectedMonthHasUploadedStatement)
            return;
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = false;
        input.accept = 'application/pdf,.pdf';
        input.onchange = (event) => {
            try {
                const pickedFile = Array.from((event.target as HTMLInputElement).files || [])[0];
                if (!pickedFile)
                    return;
                usageUploadTimersRef.current.forEach((timer) => window.clearTimeout(timer));
                usageUploadTimersRef.current = [];
                const ocrFailureReason = getUsageStatementOcrFailureReason(pickedFile);
                if (ocrFailureReason) {
                    setUsageUploadStage('idle');
                    setOcrFailureReason(ocrFailureReason);
                    return;
                }
                const existingUploadedMonths = new Set(
                    Object.entries(dbUsageStatementsByMonth)
                        .filter(([, data]) => {
                            const summary = data.statementSummary;
                            return Boolean(summary?.sourceFileName && summary.sourceFileName !== '-');
                        })
                        .map(([month]) => month),
                );
                setUsageUploadStage('ocr');
                uploadProjectFile(project.id, pickedFile, 'usage_statement')
                    .then(async (uploadedEntry) => {
                        let savedArchive: UsageStatementArchiveData | null = null;
                        const uploadedFileId = Number(uploadedEntry.fileId);
                        if (!Number.isFinite(uploadedFileId) || uploadedFileId <= 0) {
                            throw new Error('업로드된 사용내역서 파일 ID가 없습니다.');
                        }
                        let ocrWorkflow: Awaited<ReturnType<typeof parseUsageStatementWithOcr>>;
                        try {
                            setUsageUploadStage('classifying');
                            ocrWorkflow = await parseUsageStatementWithOcr(project.id, uploadedFileId);
                            if (!ocrWorkflow.usageStatementId) {
                                throw new Error('사용내역서 OCR 결과에 사용내역서 ID가 없습니다.');
                            }
                        } catch (error) {
                            await deleteProjectFile(project.id, uploadedFileId).catch(() => null);
                            throw error;
                        }
                        savedArchive = await getUsageStatementArchiveById(project.id, ocrWorkflow.usageStatementId).catch(() => null);
                        const moveNotices = extractClassificationMoveNotices(ocrWorkflow);
                        if (moveNotices.length) {
                            setClassificationMoveNotices(moveNotices);
                        }
                        const uploadedAt = uploadedEntry.uploadedAt || new Date().toISOString().slice(0, 10);
                        const month = savedArchive?.statementSummary.month || selectedMonth || uploadedAt.slice(0, 7);
                        if (savedArchive && existingUploadedMonths.has(month)) {
                            setDuplicateUsageMonthWarning(`${formatMonthLabel(month)} 사용내역서가 이미 존재합니다. 파일의 세부항목 사용일자를 확인한 뒤 다시 업로드해주세요.`);
                            setUsageUploadStage('idle');
                            return;
                        }
                        const statementSummary: MonthlyUsageStatementSummary = savedArchive?.statementSummary || {
                            month,
                            label: formatMonthLabel(month),
                            sourceFileName: uploadedEntry.name,
                            revisionNo: 1,
                            documentWrittenDate: '-',
                            uploadedAt,
                            uploadedBy: user.name,
                            parseStatus: '업로드 완료',
                            validationStatus: '미검증',
                            currentAmount: '0',
                            cumulativeAmount: project.accumulatedAmount || '0',
                            evidenceCount: 1,
                            issueCount: 0,
                        };
                        setDbUsageStatementsByMonth((current) => ({
                            ...current,
                            [month]: {
                                archiveSeed: savedArchive?.archiveSeed || current[month]?.archiveSeed || { usage_statement: [], categories: {} },
                                usageItems: savedArchive?.usageItems || current[month]?.usageItems || [],
                                overviewRows: savedArchive?.overviewRows || current[month]?.overviewRows || EMPTY_OVERVIEW_ROWS,
                                statementSummary,
                                usageStatementId: savedArchive?.usageStatementId || current[month]?.usageStatementId,
                                workflowStatus: savedArchive?.workflowStatus || USAGE_WORKFLOW_STATUS.DRAFT,
                            },
                        }));
                        setArchiveSeed((current) => savedArchive?.archiveSeed || ({
                            usage_statement: [uploadedEntry, ...(current?.usage_statement || []).filter((file) => file.fileId !== uploadedEntry.fileId)],
                            categories: current?.categories || {},
                        }));
                        if (savedArchive) {
                            setArchiveUsageItems(savedArchive.usageItems);
                        }
                        setProject((current) => ({ ...current, hasUploads: true }));
                        setSelectedMonth(month);
                        await refreshArchiveData(project.id);
                        setUsageUploadStage('idle');
                        openArchiveView();
                    })
                    .catch((error) => {
                        setUsageUploadStage('idle');
                        const message = error instanceof ApiClientError
                            ? error.message
                            : error instanceof Error
                                ? error.message
                                : '사용내역서 업로드 후 OCR/classi 처리에 실패했습니다.';
                        setUsageUploadFailureMessage(message);
                    });
            } catch {
                usageUploadTimersRef.current.forEach((timer) => window.clearTimeout(timer));
                usageUploadTimersRef.current = [];
                setUsageUploadStage('idle');
                setUsageUploadFailureMessage('사용내역서 업로드 처리를 시작하지 못했습니다.');
            }
        };
        input.click();
    };
    const saveProjectInfo = async () => {
        const requiredValues = [
            projectInfoDraft.contractNumber,
            projectInfoDraft.constructionName,
            projectInfoDraft.constructionCompany,
            projectInfoDraft.representative,
            projectInfoDraft.client,
            projectInfoDraft.constructionAmount,
            projectInfoDraft.appropriatedAmount,
            projectInfoDraft.startDate,
            projectInfoDraft.endDate,
            projectInfoDraft.location,
            projectInfoDraft.progressRate,
        ];
        if (requiredValues.some((value) => !String(value || '').trim())) {
            setProjectInfoSaveError('필수 정보를 모두 입력해 주세요.');
            return;
        }
        if (!(projectInfoDraft.assigneeUserIds || []).length) {
            setProjectInfoSaveError('프로젝트 담당자를 1명 이상 선택해 주세요.');
            return;
        }
        if (!(projectInfoDraft.sheAssigneeUserIds || []).length) {
            setProjectInfoSaveError('SHE 담당자를 1명 이상 선택해 주세요.');
            return;
        }
        if (new Date(projectInfoDraft.startDate || '').getTime() > new Date(projectInfoDraft.endDate || '').getTime()) {
            setProjectInfoSaveError('공사 시작일은 마감일보다 늦을 수 없습니다.');
            return;
        }
        setProjectInfoSaving(true);
        setProjectInfoSaveError('');
        try {
            const savedProject = await updateProject(project.id, {
                contractNumber: projectInfoDraft.contractNumber,
                constructionName: projectInfoDraft.constructionName,
                constructionCompany: projectInfoDraft.constructionCompany,
                representative: projectInfoDraft.representative,
                client: projectInfoDraft.client,
                constructionAmount: projectInfoDraft.constructionAmount,
                appropriatedAmount: projectInfoDraft.appropriatedAmount,
                startDate: projectInfoDraft.startDate,
                endDate: projectInfoDraft.endDate,
                location: projectInfoDraft.location,
                projectStatusCode: projectInfoDraft.projectStatusCode,
            });
            const savedAssignees = await replaceProjectAssignees(project.id, [
                ...(projectInfoDraft.assigneeUserIds || []),
                ...(projectInfoDraft.sheAssigneeUserIds || []),
            ]);
            const projectManagerAssignees = savedAssignees.filter((assignee) => isProjectManagerRole(assignee.roleCode));
            const sheManagerAssignees = savedAssignees.filter((assignee) => isSheManagerRole(assignee.roleCode));
            const assigneeNames = projectManagerAssignees.map((assignee) => assignee.realName).filter(Boolean);
            const assigneeUserIds = projectManagerAssignees.map((assignee) => assignee.userId);
            const sheManagerNames = sheManagerAssignees.map((assignee) => assignee.realName).filter(Boolean);
            const sheManagerUserIds = sheManagerAssignees.map((assignee) => assignee.userId);
            setProject((current) => ({
                ...current,
                contractNumber: savedProject.contractNumber,
                name: savedProject.name,
                constructionName: savedProject.constructionName,
                constructionCompany: savedProject.constructionCompany,
                representative: savedProject.representative,
                client: savedProject.client,
                constructionAmount: savedProject.constructionAmount,
                period: savedProject.period,
                location: savedProject.location,
                plannedAmount: savedProject.plannedAmount,
                projectStatusCode: savedProject.projectStatusCode,
                progressRate: projectInfoDraft.progressRate,
                usageRate: calculateUsageRateText(latestStatement.cumulativeAmount, savedProject.plannedAmount),
                recentActivity: savedProject.recentActivity,
                manager: assigneeNames.join(', '),
                participants: assigneeNames,
                assigneeUserIds,
                sheManager: sheManagerNames.join(', '),
                sheManagers: sheManagerNames,
                sheManagerUserIds,
            }));
            setProjectInfoModalOpen(false);
        } catch (error) {
            setProjectInfoSaveError(error instanceof Error ? error.message : '사용내역서 기본 정보 저장에 실패했습니다.');
        } finally {
            setProjectInfoSaving(false);
        }
    };
    const projectInfoModal = (<ProjectInfoEditorModal open={projectInfoModalOpen} mode="usage" title="사용내역서 기본 정보 수정" subtitle={project.constructionName} draft={projectInfoDraft} error={projectInfoSaveError} saving={projectInfoSaving} assigneeOptions={managerCandidates.map((candidate) => ({ userId: candidate.id, realName: candidate.realName, employeeNo: candidate.employeeNo }))} sheAssigneeOptions={sheManagerCandidates.map((candidate) => ({ userId: candidate.id, realName: candidate.realName, employeeNo: candidate.employeeNo }))} onClose={() => setProjectInfoModalOpen(false)} onSave={saveProjectInfo} onChange={(patch) => {
            setProjectInfoDraft((current) => ({ ...current, ...patch }));
            setProjectInfoSaveError('');
        }}/>);
    const monthCreateInputStyle: CSSProperties = {
      width: '100%',
      boxSizing: 'border-box',
      height: 44,
      border: `1px solid ${C.g200}`,
      borderRadius: 10,
      padding: '0 13px',
      background: C.white,
      color: C.g800,
      fontFamily: 'inherit',
      fontSize: 15,
      fontWeight: 900,
      outline: 'none',
    };
    const monthCreateButtonStyle: CSSProperties = {
      height: 40,
      borderRadius: 999,
      padding: '0 18px',
      fontFamily: 'inherit',
      fontSize: 13,
      fontWeight: 900,
      cursor: 'pointer',
    };
    const monthCreateModal = (
      <Modal open={monthCreateModalOpen} onClose={() => setMonthCreateModalOpen(false)} zIndex={970} maxWidth={390}>
        <div style={{ background: C.white, border: `1px solid ${C.g200}`, borderRadius: 16, boxShadow: '0 18px 44px rgba(0,0,0,.16)', overflow: 'hidden' }}>
          <div style={{ padding: '22px 22px 18px' }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: C.g800, marginBottom: 6 }}>사용내역서 월 추가</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.g400, lineHeight: 1.55, marginBottom: 18 }}>추가할 사용내역서의 연도와 월을 입력해 주세요.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: C.g600 }}>연도</span>
              <input
                value={newMonthYear}
                onChange={(event) => {
                  setNewMonthYear(event.target.value.replace(/\D/g, '').slice(0, 4));
                  setNewMonthError('');
                }}
                inputMode="numeric"
                placeholder="2026"
                style={monthCreateInputStyle}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: C.g600 }}>월</span>
              <input
                value={newMonthNo}
                onChange={(event) => {
                  setNewMonthNo(event.target.value.replace(/\D/g, '').slice(0, 2));
                  setNewMonthError('');
                }}
                inputMode="numeric"
                placeholder="04"
                style={monthCreateInputStyle}
              />
            </label>
          </div>
          {newMonthError && <div style={{ marginTop: 10, borderRadius: 8, background: C.dangerBg, color: C.danger, padding: '9px 10px', fontSize: 12, fontWeight: 900 }}>{newMonthError}</div>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 22px 18px', borderTop: `1px solid ${C.g100}`, background: '#FAFBFA' }}>
            <button type="button" onClick={() => setMonthCreateModalOpen(false)} style={{ ...monthCreateButtonStyle, border: `1px solid ${C.g200}`, background: C.white, color: C.g600 }}>취소</button>
            <button type="button" onClick={addUsageMonth} style={{ ...monthCreateButtonStyle, border: 'none', minWidth: 74, background: C.primary, color: C.white }}>추가</button>
          </div>
        </div>
      </Modal>
    );
    const monthDeleteModal = (
      <Modal open={Boolean(monthDeleteTarget)} onClose={() => {
        if (monthDeleting)
          return;
        setMonthDeleteTarget(null);
        setMonthDeleteError('');
      }} zIndex={980} maxWidth={440}>
        <div style={{ background: C.white, border: `1px solid ${C.g200}`, borderRadius: 18, boxShadow: '0 18px 44px rgba(0,0,0,.16)', padding: 22 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: C.g800, marginBottom: 8 }}>사용내역서 월 삭제</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.g600, lineHeight: 1.6 }}>
            {monthDeleteTarget?.label} 사용내역서를 삭제하시겠습니까? 해당 월의 사용내역서와 증빙 서류가 제거됩니다.
          </div>
          {monthDeleteError && <div style={{ marginTop: 12, borderRadius: 10, background: C.dangerBg, color: C.danger, padding: '10px 12px', fontSize: 12, fontWeight: 900, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{monthDeleteError}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <button type="button" onClick={() => { setMonthDeleteTarget(null); setMonthDeleteError(''); }} disabled={monthDeleting} style={{ height: 38, border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: monthDeleting ? C.g400 : C.g600, padding: '0 15px', fontFamily: 'inherit', fontSize: 13, fontWeight: 900, cursor: monthDeleting ? 'not-allowed' : 'pointer' }}>취소</button>
            <button type="button" onClick={deleteUsageMonth} disabled={monthDeleting} style={{ height: 38, border: 'none', borderRadius: 999, background: monthDeleting ? C.g200 : C.danger, color: C.white, padding: '0 16px', fontFamily: 'inherit', fontSize: 13, fontWeight: 900, cursor: monthDeleting ? 'wait' : 'pointer' }}>{monthDeleting ? '삭제 중' : '삭제'}</button>
          </div>
        </div>
      </Modal>
    );
    const actionGuideMessage = selectedMonthActionRequestDetails?.reason || '';
    const actionGuideItems = parseActionGuideReasons(actionGuideMessage);
    const actionGuideRequestedFiles: string[] = [];
    const actionGuideMonthLabel = selectedStatement.month ? formatMonthLabel(selectedStatement.month) : '';
    const actionGuideMeta = selectedMonthActionRequestDetails
        ? `${actionGuideMonthLabel ? `${actionGuideMonthLabel} · ` : ''}요청 ${selectedMonthActionRequestDetails.requestedAt} · 담당 ${selectedMonthActionRequestDetails.assignee}`
        : '';
    const closeActionGuide = () => {
        if (actionGuideClosingMotion)
            return;
        const cardRect = actionGuideCardRef.current?.getBoundingClientRect();
        const badgeRect = actionRequestBadgeRef.current?.getBoundingClientRect();
        if (!cardRect || !badgeRect) {
            setActionGuideOpen(false);
            return;
        }
        setActionGuideClosingMotion({
            x: badgeRect.left + badgeRect.width / 2 - (cardRect.left + cardRect.width / 2),
            y: badgeRect.top + badgeRect.height / 2 - (cardRect.top + cardRect.height / 2),
            scale: Math.max(0.08, Math.min(0.18, badgeRect.width / cardRect.width)),
        });
        window.setTimeout(() => {
            setActionGuideOpen(false);
            setActionGuideClosingMotion(null);
        }, 360);
    };
    const actionGuideModal = canViewActionGuide && selectedMonthActionRequestDetails ? (
        <Modal open={actionGuideOpen} onClose={closeActionGuide} zIndex={960} maxWidth={680}>
          <div
            ref={actionGuideCardRef}
            className={actionGuideClosingMotion ? 'action-guide-collapse' : undefined}
            style={{
                background: C.white,
                borderRadius: 6,
                border: `1px solid ${C.g200}`,
                boxShadow: '0 18px 44px rgba(0,0,0,.16)',
                overflow: 'hidden',
                ...(actionGuideClosingMotion ? {
                    '--action-guide-x': `${actionGuideClosingMotion.x}px`,
                    '--action-guide-y': `${actionGuideClosingMotion.y}px`,
                    '--action-guide-scale': actionGuideClosingMotion.scale,
                } as CSSProperties : {}),
            }}
          >
            <div style={{ padding: '20px 22px 16px', borderBottom: `1px solid ${C.g100}`, display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 900, color: C.danger }}>부족한 서류 안내</span>
                  {selectedMonthActionRequestDetails?.dueDate && <span style={{ fontSize: 11, fontWeight: 900, color: C.g600, background: C.g100, borderRadius: 999, padding: '4px 8px' }}>기한 {selectedMonthActionRequestDetails.dueDate}</span>}
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, color: C.g800, lineHeight: 1.35 }}>부족한 서류를 확인해 주세요</div>
                {actionGuideMeta && <div style={{ fontSize: 12, color: C.g400, fontWeight: 900, marginTop: 6 }}>{actionGuideMeta}</div>}
              </div>
              <button type="button" aria-label="부족한 서류 안내 닫기" onClick={closeActionGuide} style={{ border: 'none', background: 'transparent', color: C.g400, cursor: 'pointer', fontSize: 24, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: '18px 22px 20px' }}>
              <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
                {(actionGuideItems.length > 0 ? actionGuideItems : ['제출 자료를 다시 확인해 주세요.']).map((item, index) => (
                  <div key={`${item}-${index}`} style={{ display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr)', gap: 8, alignItems: 'start', border: `1px solid ${C.g100}`, borderRadius: 6, background: '#FCFEFD', padding: '10px 12px' }}>
                    <span style={{ width: 24, height: 24, borderRadius: 999, background: C.g100, color: C.g600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900 }}>{index + 1}</span>
                    <span style={{ minWidth: 0, fontSize: 13, color: C.g600, fontWeight: 800, lineHeight: 1.65 }}>{item}</span>
                  </div>
                ))}
              </div>
              {actionGuideRequestedFiles.length > 0 && <div style={{ border: `1px solid ${C.g100}`, borderRadius: 6, background: '#FCFEFD', padding: '12px 14px', display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: C.g800 }}>요청 자료</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {actionGuideRequestedFiles.map((fileName) => <span key={fileName} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.g600, padding: '4px 8px', fontSize: 12, fontWeight: 900 }}>{fileName}</span>)}
                </div>
              </div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                <button type="button" onClick={closeActionGuide} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '9px 14px', background: C.white, color: C.g600, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer' }}>닫기</button>
              </div>
            </div>
          </div>
        </Modal>
    ) : null;
    const projectDetailCardShadow = 'var(--ui-shadow-card)';
    const overviewUsageRows = selectedStatementArchive?.overviewRows || EMPTY_OVERVIEW_ROWS;
    const usageInfoGridStyle = { display: 'grid', gridTemplateColumns: '120px minmax(170px, 1fr) 120px minmax(170px, 1fr)', minWidth: 620 } as const;
    const usageSummaryGridStyle = { display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) 130px 150px 130px', minWidth: 670 } as const;
    const usageTableScrollStyle = { width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'auto', overflowY: 'hidden' } as const;
    const detailPanelWidth = 'min(1180px, 100%)';
    const tabPanelMinWidth = selectedMonth ? 1180 : 0;
    const tabPanelStyle: CSSProperties = selectedMonth && activeTab === 'report'
        ? { padding: 0, border: 'none', boxShadow: 'none', background: 'transparent', width: detailPanelWidth, minWidth: tabPanelMinWidth, maxWidth: '100%', overflow: 'visible', margin: '0 auto' }
        : { padding: 24, borderRadius: 12, border: `1px solid ${C.g200}`, background: C.white, width: detailPanelWidth, minWidth: tabPanelMinWidth, maxWidth: '100%', overflow: 'visible', boxShadow: projectDetailCardShadow, margin: '0 auto' };
    const parseProjectPeriod = (period: string) => {
        const [startDate = '', endDate = ''] = period.split('~').map((value) => value.trim().replace(/\//g, '-'));
        return { startDate, endDate };
    };
    const parseCurrencyValue = (value: string) => {
        const numeric = Number(String(value || '').replace(/[^\d]/g, ''));
        return Number.isFinite(numeric) ? numeric : 0;
    };
    const calculateUsageRateText = (accumulatedAmount?: string | number | null, plannedAmount?: string | number | null) => {
        const used = parseCurrencyValue(String(accumulatedAmount || ''));
        const planned = parseCurrencyValue(String(plannedAmount || ''));
        if (planned <= 0)
            return '0%';
        const rate = Math.round((used / planned) * 1000) / 10;
        return `${rate}%`;
    };
    const editableUsageRows = overviewUsageRows.filter(([item]) => item !== '계');
    const monthlyUsageTotal = editableUsageRows.reduce((sum, [, , current]) => sum + parseCurrencyValue(current), 0);
    const usedSafetyCost = parseCurrencyValue(selectedStatement.cumulativeAmount);
    const totalSafetyCost = parseCurrencyValue(project.plannedAmount);
    const safetyUsagePercent = totalSafetyCost > 0 ? Math.round((usedSafetyCost / totalSafetyCost) * 1000) / 10 : 0;
    const safetyUsageBarWidth = Math.min(100, Math.max(0, safetyUsagePercent));
    const remainingSafetyCost = Math.max(0, totalSafetyCost - usedSafetyCost);
    const usageStatementInfoRows = [
        ['건설업체명', project.constructionCompany, '공사명', project.constructionName],
        ['소재지', project.location, '대표자', project.representative],
        ['공사금액', `${project.constructionAmount}원`, '공사기간', project.period],
        ['발주자', project.client, '공정률', project.progressRate],
        ['프로젝트 담당자', getProjectAssigneeLabel(project), 'SHE 담당자', getProjectSheManagerLabel(project)],
        ['계상된 안전관리비', `${project.plannedAmount}원`, '사용률', `${safetyUsagePercent}%`],
        ...(selectedMonth
            ? [
                ['업로드일', selectedStatement.uploadedAt, '최종수정일', selectedStatement.documentWrittenDate],
            ]
            : []),
    ];
    const showUsageStatementHeaderInfo = true;
    if (projectLoading) {
        return (<AppFrame title="프로젝트 상세">
          <Card style={{ padding: 24, textAlign: 'center', color: C.g400, fontWeight: 900, borderRadius: 6 }}>프로젝트 정보를 불러오는 중입니다.</Card>
        </AppFrame>);
    }
    if (projectError) {
        return (<AppFrame title="프로젝트 상세">
          <Card style={{ padding: 24, textAlign: 'center', color: C.danger, fontWeight: 900, borderRadius: 6 }}>{projectError}</Card>
        </AppFrame>);
    }
    const canUploadUsageStatementFile = canUploadEvidence && Boolean(selectedMonth) && !selectedMonthHasUploadedStatement;
    const usageUploadButton = canUploadUsageStatementFile ? (
      <button type="button" onClick={uploadUsageStatementFromOverview} disabled={usageUploadStage !== 'idle'} style={{ flex: '0 0 auto', border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: usageUploadStage === 'idle' ? C.primary : C.g400, height: 34, padding: '0 13px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, fontFamily: 'inherit', cursor: usageUploadStage === 'idle' ? 'pointer' : 'wait', boxShadow: 'none', whiteSpace: 'nowrap' }}>
        {usageUploadStage === 'ocr' ? 'OCR/분류 처리 중' : usageUploadStage === 'classifying' ? '목록 갱신 중' : '사용내역서 업로드'}
      </button>
    ) : null;
    const uploadCompleteAction = canUploadEvidence ? (
      <button
        type="button"
        onClick={() => void completeReviewRequest()}
        disabled={!canSubmitUploadComplete || uploadCompleteSubmitting}
        style={{
          height: 40,
          border: `1px solid ${uploadCompleteAlreadySubmitted ? C.primary : !canSubmitUploadComplete ? C.g200 : C.primary}`,
          borderRadius: 999,
          padding: '0 16px',
          background: uploadCompleteAlreadySubmitted ? C.primary : !canSubmitUploadComplete ? C.g100 : C.bg,
          color: uploadCompleteAlreadySubmitted ? C.white : !canSubmitUploadComplete ? C.g400 : C.primary,
          cursor: uploadCompleteAlreadySubmitted ? 'default' : !canSubmitUploadComplete || uploadCompleteSubmitting ? 'not-allowed' : 'pointer',
          fontSize: 13,
          fontWeight: 900,
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
          boxShadow: uploadCompleteAlreadySubmitted ? '0 8px 18px rgba(27, 94, 59, .18)' : 'none',
        }}
      >
        {uploadCompleteSubmitting ? '처리 중...' : uploadCompleteAlreadySubmitted ? '업로드 완료됨' : '업로드 완료'}
      </button>
    ) : null;
    const monthGridContent = (
      <div style={{ display: 'grid', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: C.g800 }}>월별 사용내역서</div>
            <div style={{ marginTop: 5, fontSize: 13, fontWeight: 800, color: C.g400 }}>확인할 월을 선택하거나 새 월을 추가해 주세요.</div>
          </div>
          <div style={{ height: 32, padding: '0 12px', borderRadius: 999, border: `1px solid ${C.g200}`, background: C.bg, color: C.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, whiteSpace: 'nowrap' }}>
            {monthlyStatements.length}개월
          </div>
        </div>
        <div style={{ border: `1px solid ${C.g200}`, borderRadius: 'var(--ui-radius-card)', background: C.white, padding: 18, boxShadow: projectDetailCardShadow }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {monthlyStatements.map((statement) => {
            const uploaded = Boolean(statement.sourceFileName && statement.sourceFileName !== '-');
            const archiveData = dbUsageStatementsByMonth[statement.month];
            const hasSupplementRequest = archiveData?.workflowStatus === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED;
            const workflowStatus = archiveData?.workflowStatus || (uploaded ? USAGE_WORKFLOW_STATUS.DRAFT : undefined);
            const workflowMeta = workflowStatus ? STATUS_META[workflowStatus] : undefined;
            const totalAmount = archiveData?.overviewRows?.find(([label]) => label === '계')?.[3] || statement.cumulativeAmount || '0';
            return (
              <button
                key={statement.month}
                type="button"
                onClick={() => selectUsageMonth(statement.month)}
                className={`interactive-card${hasSupplementRequest ? ' interactive-card--supplement' : ''}`}
                style={{ position: 'relative', border: `1px solid ${hasSupplementRequest ? '#FFB7BC' : uploaded ? C.light : C.g200}`, borderRadius: 'var(--ui-radius-card)', background: hasSupplementRequest ? '#FFF6F7' : uploaded ? 'color-mix(in srgb, var(--c-bg) 42%, #fff)' : C.white, padding: '17px 16px', minHeight: 142, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 14, boxShadow: hasSupplementRequest ? '0 10px 22px rgba(229, 57, 53, .10)' : 'var(--ui-shadow-card)' }}
              >
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`${statement.label} 삭제`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setMonthDeleteError('');
                    setMonthDeleteTarget(statement);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ')
                      return;
                    event.preventDefault();
                    event.stopPropagation();
                    setMonthDeleteError('');
                    setMonthDeleteTarget(statement);
                  }}
                  style={{ position: 'absolute', top: 12, right: 12, width: 24, height: 24, borderRadius: 999, border: `1px solid ${hasSupplementRequest ? '#FFCDD2' : C.g200}`, background: C.white, color: hasSupplementRequest ? C.danger : C.g400, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, lineHeight: 1, cursor: 'pointer' }}
                >
                  ×
                </span>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 28 }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: hasSupplementRequest ? C.danger : C.g800 }}>{statement.label}</div>
                  </div>
                  <div style={{ marginTop: 9, minHeight: 19, display: 'flex', alignItems: 'center' }}>
                    {workflowMeta && (
                      <span style={{ color: workflowMeta.color, fontSize: 12, fontWeight: 900, lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                        {workflowMeta.label}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ borderTop: `1px solid ${hasSupplementRequest ? '#FFE1E4' : C.g100}`, paddingTop: 12, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'end', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 900, color: C.g400 }}>누계</div>
                    <div title={`${totalAmount}원`} style={{ marginTop: 4, fontSize: 15, fontWeight: 900, color: hasSupplementRequest ? C.danger : uploaded ? C.primary : C.g600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{totalAmount}원</div>
                  </div>
                  <div style={{ height: 28, padding: '0 10px', borderRadius: 999, border: `1px solid ${hasSupplementRequest ? '#FFCDD2' : C.light}`, background: C.white, color: hasSupplementRequest ? C.danger : C.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900 }}>보기</div>
                </div>
              </button>
            );
          })}
          <button
            type="button"
            onClick={openMonthCreateModal}
            className="interactive-card"
            style={{ border: `1px dashed ${C.light}`, borderRadius: 'var(--ui-radius-card)', background: 'color-mix(in srgb, var(--c-bg) 28%, #fff)', minHeight: 142, cursor: 'pointer', fontFamily: 'inherit', display: 'grid', placeItems: 'center', color: C.primary, boxShadow: 'var(--ui-shadow-card)' }}
          >
            <span aria-hidden="true" style={{ position: 'relative', width: 40, height: 40, borderRadius: 999, border: `1px solid ${C.primary}`, background: C.white, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ position: 'absolute', width: 16, height: 2, borderRadius: 999, background: C.primary }} />
              <span style={{ position: 'absolute', width: 2, height: 16, borderRadius: 999, background: C.primary }} />
            </span>
          </button>
        </div>
        </div>
      </div>
    );
    const tabContent = {
        overview: (<div style={{ minWidth: 0 }}>
        {!selectedMonth ? monthGridContent : !hasUsageStatement ? (
          <div style={{ minHeight: 360, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div style={{ width: 'min(100%, 420px)', border: `1px solid ${C.g200}`, borderRadius: 12, background: C.white, padding: '34px 28px', textAlign: 'center', boxShadow: '0 10px 24px rgba(31,47,39,.05)' }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: C.g800, marginBottom: 9 }}>사용내역서가 없습니다</div>
            </div>
          </div>
        ) : <>
        <div data-ui="project-detail.15" style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto', alignItems: 'center', gap: 10, marginBottom: 16, minWidth: 0 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{ minWidth: 0, display: 'inline-flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: C.g800, whiteSpace: 'nowrap' }}>사용내역서</div>
              <div style={{ fontSize: 12, color: C.g400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {usageUploadStage === 'ocr' ? 'OCR 처리 후 세부 항목 분류까지 진행하고 있습니다.' : usageUploadStage === 'classifying' ? '분류 결과를 화면에 반영하고 있습니다.' : '사용 현황 및 9개 항목 요약'}
              </div>
            </div>
          </div>
          <div />
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => updateTab('details')} style={{ height: 40, border: 'none', borderRadius: 999, background: C.primary, color: C.white, cursor: 'pointer', fontSize: 13, fontWeight: 900, fontFamily: 'inherit', padding: '0 16px', whiteSpace: 'nowrap', boxShadow: 'none' }}>세부 내역 보기</button>
          </div>
        </div>
        <>
        <div style={{ border: `1px solid ${C.g200}`, borderRadius: 12, background: C.white, padding: '18px 20px', marginBottom: 16, boxShadow: '0 8px 18px rgba(31,47,39,.04)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 900, color: C.g800 }}>안전관리비 사용 현황</div>
              <div style={{ fontSize: 12, color: C.g400, fontWeight: 800, marginTop: 4 }}>사용한 안전관리비 / 계상된 안전관리비</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 24, lineHeight: 1, fontWeight: 900, color: C.primary }}>{safetyUsagePercent}%</div>
              <div style={{ fontSize: 11, color: C.g400, fontWeight: 900, marginTop: 5 }}>사용률</div>
            </div>
          </div>
          <div style={{ height: 18, borderRadius: 999, background: C.g100, border: `1px solid ${C.g200}`, overflow: 'hidden', marginBottom: 13 }}>
            <div style={{ width: `${safetyUsageBarWidth}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${C.primary}, ${C.light})` }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 24px minmax(0, 1fr) 24px minmax(0, 1fr)', gap: 8, alignItems: 'center' }}>
            {[
              ['전체 계상', `${totalSafetyCost.toLocaleString('ko-KR')}원`, C.g800],
              ['사용 누계', `${usedSafetyCost.toLocaleString('ko-KR')}원`, C.primary],
              ['잔여', `${remainingSafetyCost.toLocaleString('ko-KR')}원`, C.g600],
            ].map(([label, value, color], index) => (
              <Fragment key={label}>
                {index === 1 && <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.g400, fontSize: 18, fontWeight: 900 }}>-</div>}
                {index === 2 && <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.g400, fontSize: 18, fontWeight: 900 }}>=</div>}
                <div style={{ borderRadius: 10, background: C.white, border: `1px solid ${C.g200}`, padding: '11px 12px', minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: C.g400, fontWeight: 900, marginBottom: 5 }}>{label}</div>
                  <div title={value} style={{ fontSize: 14, color, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
                </div>
              </Fragment>
            ))}
          </div>
        </div>
        <div className="thin-x-scroll" style={usageTableScrollStyle}>
        <div style={{ border: `1px solid ${C.g200}`, borderRadius: 12, overflow: 'hidden', minWidth: usageSummaryGridStyle.minWidth }}>
          <div style={{ ...usageSummaryGridStyle, background: C.g100, borderBottom: `1px solid ${C.g200}` }}>
            {['항목', '전회', '금회', '누계'].map((head) => <div key={head} style={{ padding: '10px 12px', fontSize: 13, color: C.g600, fontWeight: 900, textAlign: head === '항목' ? 'left' : 'right', borderRight: head === '누계' ? 'none' : `1px solid ${C.g200}` }}>{head}</div>)}
          </div>
          {[...editableUsageRows, [
            '계',
            editableUsageRows.reduce((sum, [, previous]) => sum + parseCurrencyValue(previous), 0).toLocaleString('ko-KR'),
            monthlyUsageTotal.toLocaleString('ko-KR'),
            editableUsageRows.reduce((sum, [, , , cumulative]) => sum + parseCurrencyValue(cumulative), 0).toLocaleString('ko-KR'),
          ] as [string, string, string, string]].map(([item, previous, current, cumulative], index) => {
                const isTotal = item === '계';
                return (<div key={item} style={{ ...usageSummaryGridStyle, background: isTotal ? C.g100 : C.white, borderBottom: index === overviewUsageRows.length - 1 ? 'none' : `1px solid ${C.g200}` }}>
                <div style={{ padding: '10px 12px', fontSize: 13, color: C.g800, fontWeight: isTotal ? 900 : 800, borderRight: `1px solid ${C.g200}` }}>{item}</div>
                <div style={{ padding: '10px 12px', fontSize: 13, color: C.g800, fontWeight: isTotal ? 900 : 800, textAlign: 'right', borderRight: `1px solid ${C.g200}` }}>{previous}</div>
                <div style={{ padding: '10px 12px', fontSize: 13, color: C.g800, fontWeight: isTotal ? 900 : 800, textAlign: 'right', borderRight: `1px solid ${C.g200}` }}>{current}</div>
                <div style={{ padding: '10px 12px', fontSize: 13, color: C.g800, fontWeight: isTotal ? 900 : 800, textAlign: 'right' }}>{cumulative}</div>
              </div>);
            })}
        </div>
        </div>
        </>
        </>}
      </div>),
        details: (<div style={{ minWidth: 0 }}>
        {!hasUsageStatement ? (
          <div style={{ minHeight: 360, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div style={{ width: 'min(100%, 420px)', border: `1px solid ${C.g200}`, borderRadius: 12, background: C.white, padding: '34px 28px', textAlign: 'center', boxShadow: '0 10px 24px rgba(31,47,39,.05)' }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: C.g800, marginBottom: 9 }}>사용내역서가 없습니다</div>
            </div>
          </div>
        ) : <>
        {!selectedMonthHasUploadedStatement ? <>
        <div style={{ minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ width: 'min(100%, 420px)', border: `1px solid ${C.g200}`, borderRadius: 12, background: C.white, padding: '34px 28px', textAlign: 'center', boxShadow: '0 10px 24px rgba(31,47,39,.05)' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: C.g800, marginBottom: 9 }}>{selectedStatement.label} 사용내역서가 업로드되지 않았습니다</div>
            {usageUploadButton}
          </div>
        </div>
        </> : null}
        {selectedMonthHasUploadedStatement && <UsageStatementDetailScreen projectId={project.id} usageStatementId={selectedStatementArchive?.usageStatementId} usageDetailSeed={archiveSeed} usageItems={archiveUsageItems} onUsageItemsChange={(items) => {
                setArchiveUsageItems(items);
                if (selectedStatement.month) {
                    setDbUsageStatementsByMonth((current) => {
                        const currentArchive = current[selectedStatement.month];
                        if (!currentArchive)
                            return current;
                        return {
                            ...current,
                            [selectedStatement.month]: {
                                ...currentArchive,
                                usageItems: items,
                            },
                        };
                    });
                }
                revertReviewedProjectToDraft();
            }} onUsageDetailSeedChange={(seed) => {
                setArchiveSeed(seed);
                if (!selectedStatement.month)
                    return;
                setDbUsageStatementsByMonth((current) => {
                    const currentArchive = current[selectedStatement.month];
                    if (!currentArchive)
                        return current;
                    return {
                        ...current,
                        [selectedStatement.month]: {
                            ...currentArchive,
                            archiveSeed: seed,
                        },
                    };
                });
            }} onUsageDetailContentMutated={revertReviewedProjectToDraft} contentVisible todoStorageKey={selectedStatement.month} clearTodoSignal={todoClearSignal} onVerificationComplete={refreshSelectedAgentButtonState} uploadCompleteAction={uploadCompleteAction}/>}
        </>}
      </div>),
        validation: (<VerifyScreen key={`validation-${project.id}-${selectedStatement.month}`} projectId={project.id} usageStatementId={selectedStatementArchive?.usageStatementId} initialStatus={selectedValidationStatus === 'done' ? 'done' : 'idle'} hideValidationIntro canStartValidation={canStartValidationForCurrentView} validationGateItems={selectedValidationGateItems} validationDisabledReason={selectedValidationDisabledReason} onValidationComplete={() => {
                setValidationStatusByMonth((prev) => ({ ...prev, [selectedStatement.month]: 'done' }));
                void refreshSelectedAgentButtonState();
            }} onValidationApproved={async () => {
                const usageStatementId = selectedStatementArchive?.usageStatementId;
                if (!usageStatementId) {
                    showAgentFailure('server-request');
                    return;
                }
                try {
                    if (selectedMonthWorkflowStatus === USAGE_WORKFLOW_STATUS.DRAFT) {
                        await submitUsageStatement(project.id, usageStatementId);
                    }
                    await completeUsageStatementReview(project.id, usageStatementId);
                    setValidationStatusByMonth((prev) => ({ ...prev, [selectedStatement.month]: 'done' }));
                    patchMonthWorkflow(selectedStatement.month, USAGE_WORKFLOW_STATUS.REVIEW_COMPLETED);
                    setProject((current) => applyWorkflowToProject(current, USAGE_WORKFLOW_STATUS.REVIEW_COMPLETED));
                    updateTab('report');
                    await refreshArchiveData(project.id);
                } catch (error) {
                    showAgentFailure('server-request', error);
                }
            }} onActionRequested={async () => {
                const usageStatementId = selectedStatementArchive?.usageStatementId;
                if (!usageStatementId) {
                    showAgentFailure('server-request');
                    return;
                }
                try {
                    if (selectedMonthWorkflowStatus === USAGE_WORKFLOW_STATUS.DRAFT) {
                        await submitUsageStatement(project.id, usageStatementId);
                    }
                    setValidationStatusByMonth((prev) => ({ ...prev, [selectedStatement.month]: 'done' }));
                    await refreshArchiveData(project.id);
                } catch (error) {
                    showAgentFailure('server-request', error);
                }
            }}/>),
        report: (<ReportScreen projectId={project.id} usageStatementId={selectedStatementArchive?.usageStatementId} validationComplete={selectedMonthWorkflowStatus === USAGE_WORKFLOW_STATUS.REVIEW_COMPLETED || selectedMonthWorkflowStatus === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED || selectedValidationStatus === 'done'} reportGenerationEnabled={selectedReportGenerationEnabled} reportDisabledReason={selectedReportDisabledReason} contractName={`${project.name} · ${selectedStatement.label}`}/>),
    };
    return (<AppFrame title={project.name} mainClassName="project-detail-main">
      <Card style={{ padding: '18px 20px', marginBottom: 14, overflow: 'visible', position: 'relative', zIndex: 20, borderRadius: 12, border: `1px solid ${C.g200}`, boxShadow: projectDetailCardShadow, width: detailPanelWidth, minWidth: selectedMonth ? tabPanelMinWidth : 0, maxWidth: '100%', marginLeft: 'auto', marginRight: 'auto' }}>
        <div data-ui="project-detail.19" style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div data-ui="project-detail.20" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', minWidth: 0 }}>
            <h2 data-ui="project-detail.21" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 22, fontWeight: 900, color: C.g800, lineHeight: 1.25, margin: 0, minWidth: 240, flex: '1 1 360px' }}>
              {selectedMonth && <button type="button" aria-label="월 목록으로 돌아가기" title="월 목록으로 돌아가기" onClick={() => setSelectedMonth('')} style={{ width: 30, height: 30, border: `1px solid ${C.g200}`, borderRadius: 999, padding: 0, background: C.white, color: C.primary, fontFamily: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'none', flex: '0 0 auto' }}>
                <ChevronIcon direction="left" size={15} color={C.primary} />
              </button>}
              {!selectedMonth && <button type="button" aria-label="전체 프로젝트로 이동" title="전체 프로젝트로 이동" onClick={() => router.push('/projects')} style={{ width: 30, height: 30, border: `1px solid ${C.g200}`, borderRadius: 999, padding: 0, background: C.white, color: C.primary, fontFamily: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'none', flex: '0 0 auto' }}>
                <ChevronIcon direction="left" size={15} color={C.primary} />
              </button>}
              <span>{project.constructionName} 계약 정산</span>
              <span style={{ fontSize: 12, fontWeight: 900, color: C.g400, lineHeight: 1, whiteSpace: 'nowrap' }}>{project.contractNumber}</span>
              {selectedMonthShouldDisplayWorkflowStatus && selectedMonthWorkflowStatus === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED && (canViewActionGuide ? (
                <button type="button" ref={actionRequestBadgeRef} data-ui="project-detail.27" className={shouldPulseActionBadge ? 'action-request-pulse' : undefined} onClick={() => setActionGuideOpen(true)} style={{ border: `1px solid ${STATUS_META[selectedMonthWorkflowStatus].color}`, fontFamily: 'inherit', fontSize: 12, fontWeight: 800, color: STATUS_META[selectedMonthWorkflowStatus].color, background: STATUS_META[selectedMonthWorkflowStatus].bg, borderRadius: 999, padding: '4px 10px', cursor: 'pointer', lineHeight: 1, whiteSpace: 'nowrap' }}>
                  {STATUS_META[selectedMonthWorkflowStatus].label}
                </button>
              ) : (
                <span data-ui="project-detail.27" style={{ fontSize: 12, fontWeight: 800, color: STATUS_META[selectedMonthWorkflowStatus].color, background: STATUS_META[selectedMonthWorkflowStatus].bg, border: `1px solid ${STATUS_META[selectedMonthWorkflowStatus].color}`, borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap', lineHeight: 1 }}>
                  {STATUS_META[selectedMonthWorkflowStatus].label}
                </span>
              ))}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flex: '1 1 260px', maxWidth: '100%', minWidth: 0, flexWrap: 'wrap' }}>
              {showUsageStatementHeaderInfo && <button type="button" onClick={() => setProjectHeaderOpen((open) => !open)} style={{ flex: '0 0 auto', border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.g600, height: 34, padding: '0 11px', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer', boxShadow: '0 7px 16px rgba(31, 55, 43, .08)' }}>
                <ChevronIcon direction={projectHeaderOpen ? 'up' : 'down'} size={14} />
              </button>}
              {activeTab === 'overview' && selectedMonth ? usageUploadButton : null}
              {canEditManagers && <button type="button" onClick={openProjectInfoModal} style={{ flex: '0 0 auto', border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.primary, height: 34, padding: '0 13px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer', boxShadow: 'none' }}>기본 정보 수정</button>}
            </div>
          </div>
          {projectHeaderOpen && showUsageStatementHeaderInfo && <div data-ui="project-detail.26" style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 2, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {selectedMonth && <span style={{ fontSize: 13, fontWeight: 900, color: C.primary, whiteSpace: 'nowrap' }}>{selectedStatement.label}</span>}
              <span style={{ fontSize: 13, fontWeight: 900, color: C.g400 }}>사용내역서 기본 정보</span>
              {selectedMonthShouldDisplayWorkflowStatus && selectedMonthWorkflowStatus !== USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED && (canViewActionGuide ? (
                <button type="button" ref={actionRequestBadgeRef} data-ui="project-detail.27" className={shouldPulseActionBadge ? 'action-request-pulse' : undefined} onClick={() => setActionGuideOpen(true)} style={{ border: `1px solid ${STATUS_META[selectedMonthWorkflowStatus].color}`, fontFamily: 'inherit', fontSize: 12, fontWeight: 800, color: STATUS_META[selectedMonthWorkflowStatus].color, background: STATUS_META[selectedMonthWorkflowStatus].bg, borderRadius: 999, padding: '4px 10px', cursor: 'pointer' }}>
                  {STATUS_META[selectedMonthWorkflowStatus].label}
                </button>
              ) : (
                <span data-ui="project-detail.27" style={{ fontSize: 12, fontWeight: 800, color: STATUS_META[selectedMonthWorkflowStatus].color, background: STATUS_META[selectedMonthWorkflowStatus].bg, border: `1px solid ${STATUS_META[selectedMonthWorkflowStatus].color}`, borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap' }}>
                  {STATUS_META[selectedMonthWorkflowStatus].label}
                </span>
              ))}
            </div>
            <div className="thin-x-scroll" style={usageTableScrollStyle}>
              <div data-ui="project-detail.16" style={{ ...usageInfoGridStyle, border: `1px solid ${C.g200}`, borderRadius: 12, overflow: 'hidden', fontSize: 13 }}>
                {usageStatementInfoRows.map(([labelA, valueA, labelB, valueB]) => (
                  <Fragment key={`${labelA}-${labelB}`}>
                    <div data-ui="project-detail.17" style={{ padding: '9px 11px', background: C.g100, color: C.g600, fontWeight: 900, borderRight: `1px solid ${C.g200}`, borderBottom: `1px solid ${C.g200}` }}>{labelA}</div>
                    <div data-ui="project-detail.18" title={valueA} style={{ gridColumn: labelB ? undefined : 'span 3', padding: '9px 11px', color: C.g800, fontWeight: 800, borderRight: labelB ? `1px solid ${C.g200}` : 'none', borderBottom: `1px solid ${C.g200}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{valueA}</div>
                    {labelB && <>
                      <div style={{ padding: '9px 11px', background: C.g100, color: C.g600, fontWeight: 900, borderRight: `1px solid ${C.g200}`, borderBottom: `1px solid ${C.g200}` }}>{labelB}</div>
                      <div title={valueB} style={{ padding: '9px 11px', color: C.g800, fontWeight: 800, borderBottom: `1px solid ${C.g200}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{valueB}</div>
                    </>}
                  </Fragment>
                ))}
              </div>
            </div>
          </div>}
        </div>
      </Card>
      {actionGuideModal}
      {projectInfoModal}
      {monthCreateModal}
      {monthDeleteModal}
      <CenterModal open={Boolean(ocrFailureReason)} title="사용내역서 OCR 실패" body={<div>
        <div style={{ marginBottom: 8 }}>사용내역서를 다시 업로드해주세요.</div>
        <div style={{ border: `1px solid ${C.g200}`, borderRadius: 6, background: C.g100, padding: '10px 12px', color: C.g800 }}>{ocrFailureReason}</div>
      </div>} actionLabel="확인" onAction={() => setOcrFailureReason('')} />
      <CenterModal open={Boolean(duplicateUsageMonthWarning)} title="이미 존재하는 사용내역서" body={<div>
        <div style={{ marginBottom: 8 }}>업로드한 파일의 세부항목 사용일자가 이미 등록된 월에 해당합니다.</div>
        <div style={{ border: `1px solid ${C.g200}`, borderRadius: 6, background: C.g100, padding: '10px 12px', color: C.g800, lineHeight: 1.6 }}>{duplicateUsageMonthWarning}</div>
      </div>} actionLabel="확인" onAction={() => setDuplicateUsageMonthWarning('')} />
      <CenterModal open={Boolean(usageUploadFailureMessage)} title="사용내역서 처리 실패" body={<div>
        <div style={{ marginBottom: 8 }}>파일 업로드 후 OCR/classi 처리 단계에서 문제가 발생했습니다.</div>
        <div style={{ border: `1px solid ${C.g200}`, borderRadius: 6, background: C.g100, padding: '10px 12px', color: C.g800, lineHeight: 1.6 }}>{usageUploadFailureMessage}</div>
      </div>} actionLabel="확인" onAction={() => setUsageUploadFailureMessage('')} />
      <Modal open={usageUploadStage === 'classifying'} onClose={() => {}} zIndex={1200} maxWidth={360}>
        <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.g200}`, boxShadow: '0 18px 44px rgba(0,0,0,.18)', padding: 20 }}>
          <style>{'.usage-upload-loader [data-ui="card.1"]{margin-top:0!important;}'}</style>
          <div className="usage-upload-loader">
          <InlineLoader title="사용내역서를 분석하고 있어요" body="완료될 때까지 다른 작업을 할 수 없습니다." />
          </div>
        </div>
      </Modal>
      <CenterModal open={classificationMoveNotices.length > 0} title="세부항목 분류 변경" body={<div>
        <div style={{ marginBottom: 10, fontSize: 13, color: C.g600, lineHeight: 1.6 }}>classi 에이전트가 일부 세부항목의 9개 항목 위치를 변경했습니다.</div>
        <div style={{ display: 'grid', gap: 8, maxHeight: 280, overflowY: 'auto', marginLeft: -36, width: 'calc(100% + 36px)' }}>
          {classificationMoveNotices.map((notice) => (
            <div key={notice.id} style={{ border: `1px solid ${C.g200}`, borderRadius: 6, background: C.white, padding: '10px 12px' }}>
              <div title={notice.itemName} style={{ fontSize: 13, fontWeight: 900, color: C.g800, marginBottom: 7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{notice.itemName}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', alignItems: 'center', gap: 8 }}>
                <span title={notice.fromCategoryName} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, border: `1px solid ${C.g200}`, borderRadius: 6, padding: '6px 9px', background: C.g100, color: C.g600, fontSize: 11, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>{notice.fromCategoryName}</span>
                <span style={{ color: C.primary, fontWeight: 900 }}>→</span>
                <span title={notice.toCategoryName} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, border: `1px solid ${C.light}`, borderRadius: 6, padding: '6px 9px', background: C.bg, color: C.primary, fontSize: 11, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>{notice.toCategoryName}</span>
              </div>
              {notice.reason && <div style={{ marginTop: 7, fontSize: 11, color: C.g600, lineHeight: 1.5 }}>{notice.reason}</div>}
            </div>
          ))}
        </div>
      </div>} actionLabel="확인" onAction={() => setClassificationMoveNotices([])} />
      <CenterModal open={Boolean(agentFailureTarget)} title="처리 실패" body={agentFailureMessage} actionLabel="확인" onAction={() => { setAgentFailureTarget(null); setAgentFailureMessage(''); }} />

      {selectedMonth && <div data-ui="project-detail.28" style={{ width: detailPanelWidth, maxWidth: '100%', margin: '0 auto 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div role="tablist" aria-label="프로젝트 상세 탭" style={{ display: 'flex', alignItems: 'center', gap: 2, flex: '1 1 360px', minWidth: 0, borderBottom: `1px solid ${C.g200}`, overflowX: 'auto' }}>
          {availableTabs.map((tab) => (<button data-ui="project-detail.29" key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => updateTab(tab.id)} style={{ border: 'none', borderBottom: `2px solid ${activeTab === tab.id ? C.primary : 'transparent'}`, background: 'transparent', color: activeTab === tab.id ? C.primary : C.g600, opacity: activeTab === tab.id ? 1 : 0.58, padding: '8px 12px 9px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: activeTab === tab.id ? 900 : 800, whiteSpace: 'nowrap' }}>
              {tab.label}
            </button>))}
        </div>
      </div>}

      <div
        data-ui="project-detail.31"
        className="thin-x-scroll"
        style={{
          minWidth: 0,
          maxWidth: '100%',
          overflowX: 'auto',
          overflowY: 'visible',
        }}
      >
        <Card style={tabPanelStyle}>
          {selectedMonth ? tabContent[activeTab] : tabContent.overview}
        </Card>
      </div>
    </AppFrame>);
}

export default function ProjectDetailPage() {
    return (
      <Suspense fallback={null}>
        <ProjectDetailPageContent />
      </Suspense>
    );
}
