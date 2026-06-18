'use client';
import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Card from '../../../components/ui/Card';
import CenterModal from '../../../components/ui/CenterModal';
import UsageStatementEmptyState from '../../../components/project/UsageStatementEmptyState';
import UsageStatementInfoTable from '../../../components/project/UsageStatementInfoTable';
import UsageStatementMonthGrid from '../../../components/project/UsageStatementMonthGrid';
import { ChevronIcon } from '../../../components/ui';
import { AppFrame } from '../../../components/common';
import { ApiClientError } from '../../../lib/api-client';
import { listUsers, type BackendUserProfile } from '../../../lib/auth-api';
import { C } from '../../../lib/theme';
import { EMPTY_PROJECT, PROJECT_STATUS_CODE, USAGE_WORKFLOW_STATUS, getProjectWorkflowLockedReason, isProjectWorkflowLocked, normalizeUsageWorkflowStatus, STATUS_META, type MonthlyUsageStatementSummary, type ProjectSummary } from '../../../lib/project-data';
import { getProject, isProjectManagerRole, isSheManagerRole, replaceProjectAssignees, updateProject, type ProjectAssigneeCandidate } from '../../../lib/project-api';
import { completeUsageStatementReview, deleteUsageStatement, getLatestUsageStatementArchive, getProjectArchiveFromCategories, getUsageStatementArchiveById, listProjectFiles, listUsageStatementArchives, requestUsageStatementSupplement, submitUsageStatement, type UsageStatementArchiveData } from '../../../lib/archive-api';
import { getAgentFailureMessage, type AgentFailureTarget } from '../../../lib/agent-failure';
import { getAgentButtonStates, getOrchestratorStatus, isAgentStageRunning, waitForAgentButtonEnabled, type AgentButtonStage } from '../../../lib/agent-api';
import { can } from '../../../lib/permissions';
import { useCurrentUser } from '../../../lib/dev-user';
import UsageStatementDetailScreen from '../../../features/project-tab/UsageStatementDetailScreen';
import VerifyScreen from '../../../features/project-tab/VerifyScreen';
import ReportScreen from '../../../features/project-tab/ReportScreen';
import type { UsageLineItem } from '../../../lib/evidence-utils';
import type { ArchiveSeed } from '../../../types/domain';
import {
    EMPTY_OVERVIEW_ROWS,
    FALLBACK_ACTION_ASSIGNEE,
    applyWorkflowToProject,
    buildValidationGateItems,
    calculateUsageRateText,
    formatMonthLabel,
    formatProgressRateText,
    getProjectAssigneeLabel,
    getProjectSheManagerLabel,
    getProjectSheManagerNames,
    normalizeMonthKey,
    parseCurrencyValue,
    parseProjectPeriod,
    pendingMonthSummary,
    readPendingUsageMonths,
    withActionRequestMonth,
    writePendingUsageMonths,
} from '../../../features/project-detail/project-detail-utils';
import useUsageStatementMonths from '../../../features/project-detail/useUsageStatementMonths';
import type { DetailTab, MonthUsageStatementArchiveData, SharedWorkflowStatus, UsageStatementInfoDraft } from '../../../features/project-detail/project-detail-types';
import useUsageStatementUpload from '../../../features/project-detail/useUsageStatementUpload';
import { UsageStatementMonthCreateModal, UsageStatementMonthDeleteModal } from '../../../features/project-detail/UsageStatementMonthModals';
import ProjectDetailInfoModal from '../../../features/project-detail/ProjectDetailInfoModal';
import ActionGuideModal from '../../../features/project-detail/ActionGuideModal';
import UsageStatementUploadModals from '../../../features/project-detail/UsageStatementUploadModals';

const toAssigneeCandidate = (candidate: BackendUserProfile): ProjectAssigneeCandidate => ({
    userId: candidate.id,
    id: candidate.id,
    realName: candidate.realName,
    roleCode: candidate.roleCode,
    employeeNo: candidate.employeeNo,
});

const sortAssigneeCandidates = (candidates: ProjectAssigneeCandidate[]) =>
    candidates.toSorted((a, b) => `${a.realName} ${a.employeeNo || ''}`.localeCompare(`${b.realName} ${b.employeeNo || ''}`, 'ko-KR'));

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
const isAgentRunningReason = (reason?: string | null) => String(reason || '').includes('현재 실행 중');
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
    const projectWorkflowLocked = isProjectWorkflowLocked(project);
    const projectWorkflowLockedReason = getProjectWorkflowLockedReason(project);
    const canUploadEvidence = can(user, 'uploadEvidence') && !projectWorkflowLocked;
    const canRunValidation = can(user, 'runValidation') && !projectWorkflowLocked;
    const canReviewReport = can(user, 'reviewReport') && !projectWorkflowLocked;
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
    const [validationStatusByMonth, setValidationStatusByMonth] = useState<Record<string, 'idle' | 'running' | 'done'>>({});
    const [projectHeaderOpen, setProjectHeaderOpen] = useState(true);
    const [actionGuideOpen, setActionGuideOpen] = useState(false);
    const [actionGuideClosingMotion, setActionGuideClosingMotion] = useState<{ x: number; y: number; scale: number } | null>(null);
    const [actionCompletionSent, setActionCompletionSent] = useState(false);
    const [todoClearSignal, setTodoClearSignal] = useState(0);
    const [activeSupplementTodoCount, setActiveSupplementTodoCount] = useState(0);
    const [uploadCompleteConfirmOpen, setUploadCompleteConfirmOpen] = useState(false);
    const [uploadCompleteSubmitting, setUploadCompleteSubmitting] = useState(false);
    const [projectInfoModalOpen, setProjectInfoModalOpen] = useState(false);
    const [monthDeleteTarget, setMonthDeleteTarget] = useState<MonthlyUsageStatementSummary | null>(null);
    const [monthDeleting, setMonthDeleting] = useState(false);
    const [monthDeleteError, setMonthDeleteError] = useState('');
    const [agentFailureTarget, setAgentFailureTarget] = useState<AgentFailureTarget | null>(null);
    const [agentFailureMessage, setAgentFailureMessage] = useState('');
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
    const [managerCandidates, setManagerCandidates] = useState<ProjectAssigneeCandidate[]>([]);
    const [sheManagerCandidates, setSheManagerCandidates] = useState<ProjectAssigneeCandidate[]>([]);
    const [statementOverrides, setStatementOverrides] = useState<Record<string, Partial<MonthlyUsageStatementSummary>>>({});
    const showAgentFailure = (target: AgentFailureTarget, error?: unknown) => {
        setAgentFailureTarget(target);
        setAgentFailureMessage(getAgentFailureMessage(target, error));
    };
    const actionGuideCardRef = useRef<HTMLDivElement | null>(null);
    const actionRequestBadgeRef = useRef<HTMLButtonElement | null>(null);
    const monthHistoryPushedRef = useRef(false);
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
    const {
        monthCreateModalOpen,
        newMonthYear,
        newMonthNo,
        newMonthError,
        openMonthCreateModal,
        closeMonthCreateModal,
        addUsageMonth,
        updateNewMonthYear,
        updateNewMonthNo,
    } = useUsageStatementMonths({
        projectId: project.id || projectId,
        projectPeriod: project.period,
        latestMonth: monthlyStatements[monthlyStatements.length - 1]?.month,
        hasMonth: (month) => Boolean(dbUsageStatementsByMonth[month]),
        onMonthAdded: (month, statementSummary) => {
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
        },
    });
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
                    orchestratorTodos: entry.orchestratorTodos,
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
            const status = await getOrchestratorStatus(project.id || projectId, item.usageStatementId);
            const todos = status.todos || [];
            const actionRequestDetails = archiveWorkflowStatus === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED
                ? withActionRequestMonth(project.actionRequestDetails, month)
                : undefined;
            return {
                ...item,
                statementSummary: { ...item.statementSummary, month, label: formatMonthLabel(month) },
                workflowStatus: archiveWorkflowStatus || item.workflowStatus,
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
        const statementsByMonth = Object.fromEntries(mergedWithOrchestrator.map((item) => {
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
        })) as Record<string, MonthUsageStatementArchiveData>;
        const pendingMonths = readPendingUsageMonths(targetProjectId).filter((month) => !statementsByMonth[month]);
        setDbUsageStatementsByMonth({
            ...statementsByMonth,
            ...Object.fromEntries(pendingMonths.map((month) => [month, {
                archiveSeed: { usage_statement: [], categories: {} },
                usageItems: [],
                overviewRows: EMPTY_OVERVIEW_ROWS,
                statementSummary: pendingMonthSummary(month),
            } satisfies MonthUsageStatementArchiveData])),
        });
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
                progressRate: formatProgressRateText(latestData.cumulativeProgressRate),
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
    const selectedLegalAgentRunning = isAgentRunningReason(selectedStatementArchive?.legalDisabledReason);
    const selectedValidationStatus = selectedLegalAgentRunning
        ? 'running'
        : validationStatusByMonth[selectedStatement.month] || 'idle';
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
    );
    const selectedMonthWorkflowStatus: SharedWorkflowStatus = selectedStatementArchive?.workflowStatus
        || (selectedMonthHasActionRequest
            ? USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED
            : USAGE_WORKFLOW_STATUS.DRAFT);
    const canSubmitUploadComplete = selectedMonthHasUploadedStatement
        && (selectedMonthWorkflowStatus === USAGE_WORKFLOW_STATUS.DRAFT
            || selectedMonthWorkflowStatus === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED);
    const uploadCompleteAlreadySubmitted = selectedMonthWorkflowStatus === USAGE_WORKFLOW_STATUS.UPLOAD_COMPLETED
        || selectedMonthWorkflowStatus === USAGE_WORKFLOW_STATUS.REVIEW_COMPLETED;
    const selectedMonthShouldDisplayWorkflowStatus = selectedMonthHasUploadedStatement || Boolean(selectedStatementArchive?.workflowStatus);
    const selectedMonthActionRequestDetails = selectedStatementArchive?.actionRequestDetails
        || (selectedMonthHasActionRequest ? withActionRequestMonth(project.actionRequestDetails, selectedStatement.month) : undefined);
    const selectedValidationGateItems = buildValidationGateItems({
        usageStatementUploaded: selectedMonthHasUploadedStatement,
        uploadCompleted: selectedMonthWorkflowStatus === USAGE_WORKFLOW_STATUS.UPLOAD_COMPLETED || selectedMonthWorkflowStatus === USAGE_WORKFLOW_STATUS.REVIEW_COMPLETED,
        legalReady: Boolean(selectedStatementArchive?.legalReady),
        legalDisabledReason: selectedStatementArchive?.legalDisabledReason,
    });
    const selectedValidationGateBlockedItem = selectedValidationGateItems.find((item) => item.state !== 'passed');
    const canStartValidationForCurrentView = !projectWorkflowLocked
        && Boolean(selectedStatementArchive?.usageStatementId)
        && selectedValidationGateItems.every((item) => item.state === 'passed');
    const canApproveValidationForCurrentView = !projectWorkflowLocked && Boolean(
        selectedStatementArchive?.usageStatementId
        && selectedValidationStatus === 'done'
        && (
            selectedMonthWorkflowStatus === USAGE_WORKFLOW_STATUS.UPLOAD_COMPLETED
            || selectedMonthWorkflowStatus === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED
            || selectedMonthWorkflowStatus === USAGE_WORKFLOW_STATUS.REVIEW_COMPLETED
        )
    );
    const selectedValidationDisabledReason = projectWorkflowLocked
        ? projectWorkflowLockedReason || '종료 또는 중단된 프로젝트에서는 법령 검증을 실행할 수 없습니다.'
        : selectedValidationGateBlockedItem
        ? `${selectedValidationGateBlockedItem.label} 조건이 충족되어야 법령 검증을 시작할 수 있습니다.`
        : '사용내역서와 에이전트 검증 로그를 확인한 뒤 법령 검증을 시작할 수 있습니다.';
    const selectedApproveDisabledReason = selectedValidationStatus !== 'done'
        ? '법령 검증을 먼저 완료해야 검토 완료할 수 있습니다.'
        : '세부항목 또는 증빙이 변경되어 다시 업로드 완료와 법령 검증을 진행해야 합니다.';
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
    const deleteUsageMonth = async () => {
        const targetMonth = monthDeleteTarget?.month;
        if (!targetMonth)
            return;
        const usageStatementId = dbUsageStatementsByMonth[targetMonth]?.usageStatementId;
        if (!usageStatementId) {
            writePendingUsageMonths(project.id || projectId, readPendingUsageMonths(project.id || projectId).filter((month) => month !== targetMonth));
            setDbUsageStatementsByMonth((current) => {
                const next = { ...current };
                delete next[targetMonth];
                return next;
            });
            setMonthDeleteError('');
            setMonthDeleteTarget(null);
            if (selectedMonth === targetMonth) {
                setSelectedMonth('');
                setArchiveSeed(null);
                setArchiveUsageItems([]);
            }
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
    const canEditManagers = !projectWorkflowLocked && (user.role === 'system_admin' || isAssignedSheManager);
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
        if (projectLoading || !project.id || !projectWorkflowLocked)
            return;
        router.replace('/projects');
    }, [project.id, projectLoading, projectWorkflowLocked, router]);
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
            const todos = status.todos || [];
            return {
                ...current,
                [selectedStatement.month]: {
                    ...entry,
                    orchestratorTodos: todos,
                    actionRequestDetails: archiveWorkflowStatus === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED
                        ? entry.actionRequestDetails
                        : undefined,
                    legalReady: status.legalReady,
                    legalDisabledReason: status.legalDisabledReason,
                    legalResultCode: status.legalResultCode,
                    reportReady: status.reportReady,
                    reportDisabledReason: status.reportDisabledReason,
                },
            };
        });
    };
    const syncSelectedUsageStatementArchive = async () => {
        const usageStatementId = selectedStatementArchive?.usageStatementId;
        const month = selectedStatement.month;
        if (!usageStatementId || !month)
            return null;
        const latestArchive = await getUsageStatementArchiveById(project.id, usageStatementId);
        const latestWorkflowStatus = normalizeUsageWorkflowStatus(latestArchive.workflowStatus) || USAGE_WORKFLOW_STATUS.DRAFT;
        setDbUsageStatementsByMonth((current) => {
            const entry = current[month];
            if (!entry)
                return current;
            return {
                ...current,
                [month]: {
                    ...entry,
                    ...latestArchive,
                    statementSummary: {
                        ...latestArchive.statementSummary,
                        month,
                        label: formatMonthLabel(month),
                    },
                    workflowStatus: latestWorkflowStatus,
                    actionRequestDetails: latestWorkflowStatus === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED
                        ? entry.actionRequestDetails
                        : undefined,
                    orchestratorTodos: entry.orchestratorTodos,
                    legalReady: latestWorkflowStatus === USAGE_WORKFLOW_STATUS.DRAFT ? false : entry.legalReady,
                    legalResultCode: latestWorkflowStatus === USAGE_WORKFLOW_STATUS.DRAFT ? null : entry.legalResultCode,
                    legalDisabledReason: latestWorkflowStatus === USAGE_WORKFLOW_STATUS.DRAFT ? '유효성 검증을 다시 실행해야 합니다.' : entry.legalDisabledReason,
                    reportReady: latestWorkflowStatus === USAGE_WORKFLOW_STATUS.DRAFT ? false : entry.reportReady,
                    reportDisabledReason: latestWorkflowStatus === USAGE_WORKFLOW_STATUS.DRAFT ? '법령 검증을 다시 완료해야 보고서를 생성할 수 있습니다.' : entry.reportDisabledReason,
                },
            };
        });
        if (latestWorkflowStatus === USAGE_WORKFLOW_STATUS.DRAFT) {
            setValidationStatusByMonth((prev) => prev[month] ? { ...prev, [month]: 'idle' } : prev);
        }
        setArchiveSeed(latestArchive.archiveSeed);
        setArchiveUsageItems(latestArchive.usageItems);
        return {
            ...latestArchive,
            workflowStatus: latestWorkflowStatus,
        };
    };
    useEffect(() => {
        const usageStatementId = selectedStatementArchive?.usageStatementId;
        if (activeTab !== 'validation' || !project.id || !usageStatementId)
            return;
        let cancelled = false;
        const syncForReviewGuard = async () => {
            try {
                await syncSelectedUsageStatementArchive();
                if (!cancelled)
                    await refreshSelectedAgentButtonState();
            } catch {
                return;
            }
        };
        void syncForReviewGuard();
        const timerId = window.setInterval(syncForReviewGuard, 5000);
        return () => {
            cancelled = true;
            window.clearInterval(timerId);
        };
    }, [activeTab, project.id, selectedStatement.month, selectedStatementArchive?.usageStatementId]);
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
    const completeReviewRequest = async (skipTodoWarning = false) => {
        if (!canUploadEvidence || !hasUsageStatement || uploadCompleteSubmitting || !canSubmitUploadComplete)
            return;
        if (!skipTodoWarning && activeSupplementTodoCount > 0) {
            setUploadCompleteConfirmOpen(true);
            return;
        }
        setUploadCompleteConfirmOpen(false);
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
    const loadAssigneeCandidates = async () => {
        if (managerCandidates.length > 0 && sheManagerCandidates.length > 0)
            return;
        const [projectManagers, sheManagers] = await Promise.all([
            listUsers({ roleCode: 'user' }),
            listUsers({ roleCode: 'admin' }),
        ]);
        setManagerCandidates(sortAssigneeCandidates(projectManagers.map(toAssigneeCandidate)));
        setSheManagerCandidates(sortAssigneeCandidates(sheManagers.map(toAssigneeCandidate)));
    };
    const openProjectInfoModal = () => {
        void loadAssigneeCandidates().catch((error) => {
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
    const {
        usageUploadStage,
        uploadUsageStatementFromOverview,
        usageUploadFailureMessage,
        setUsageUploadFailureMessage,
        ocrFailureReason,
        setOcrFailureReason,
        duplicateUsageMonthWarning,
        setDuplicateUsageMonthWarning,
        classificationMoveNotices,
        setClassificationMoveNotices,
    } = useUsageStatementUpload({
        canUploadEvidence,
        selectedMonthHasUploadedStatement,
        selectedStatement,
        selectedMonth,
        project,
        dbUsageStatementsByMonth,
        userName: user.name,
        setDbUsageStatementsByMonth,
        setArchiveSeed,
        setArchiveUsageItems,
        setProject,
        setSelectedMonth,
        refreshArchiveData,
        openArchiveView,
    });
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
    const projectInfoModal = (
      <ProjectDetailInfoModal
        open={projectInfoModalOpen}
        constructionName={project.constructionName}
        draft={projectInfoDraft}
        error={projectInfoSaveError}
        saving={projectInfoSaving}
        managerCandidates={managerCandidates}
        sheManagerCandidates={sheManagerCandidates}
        onClose={() => setProjectInfoModalOpen(false)}
        onSave={saveProjectInfo}
        onChange={(patch) => {
            setProjectInfoDraft((current) => ({ ...current, ...patch }));
            setProjectInfoSaveError('');
        }}
      />
    );
    const closeMonthDeleteModal = () => {
        if (monthDeleting)
            return;
        setMonthDeleteTarget(null);
        setMonthDeleteError('');
    };
    const monthCreateModal = (
      <UsageStatementMonthCreateModal
        open={monthCreateModalOpen}
        year={newMonthYear}
        month={newMonthNo}
        error={newMonthError}
        onYearChange={updateNewMonthYear}
        onMonthChange={updateNewMonthNo}
        onClose={closeMonthCreateModal}
        onAdd={addUsageMonth}
      />
    );
    const monthDeleteModal = (
      <UsageStatementMonthDeleteModal
        target={monthDeleteTarget}
        deleting={monthDeleting}
        error={monthDeleteError}
        onClose={closeMonthDeleteModal}
        onDelete={deleteUsageMonth}
      />
    );
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
        <ActionGuideModal
          open={actionGuideOpen}
          actionRequestDetails={selectedMonthActionRequestDetails}
          monthLabel={selectedStatement.month ? formatMonthLabel(selectedStatement.month) : ''}
          closingMotion={actionGuideClosingMotion}
          cardRef={actionGuideCardRef}
          onClose={closeActionGuide}
        />
    ) : null;
    const projectDetailCardShadow = 'var(--ui-shadow-card)';
    const overviewUsageRows = selectedStatementArchive?.overviewRows || EMPTY_OVERVIEW_ROWS;
    const usageInfoGridStyle = { display: 'grid', gridTemplateColumns: '125px minmax(170px, 1fr) 125px minmax(170px, 1fr)', width: '100%', minWidth: 900, flexShrink: 0 } as const;
    const usageSummaryGridStyle = { display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) 130px 150px 130px', minWidth: 670 } as const;
    const usageTableScrollStyle = { width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'auto', overflowY: 'hidden' } as const;
    const detailPanelWidth = 'min(1180px, 100%)';
    const tabPanelMinWidth = selectedMonth ? 1180 : 0;
    const tabPanelStyle: CSSProperties = selectedMonth && activeTab === 'report'
        ? { padding: 0, border: 'none', boxShadow: 'none', background: 'transparent', width: detailPanelWidth, minWidth: tabPanelMinWidth, maxWidth: selectedMonth ? 'none' : '100%', overflow: 'visible', margin: '0 auto' }
        : { padding: 24, borderRadius: 12, border: `1px solid ${C.g200}`, background: C.white, width: detailPanelWidth, minWidth: tabPanelMinWidth, maxWidth: selectedMonth ? 'none' : '100%', overflow: 'visible', boxShadow: projectDetailCardShadow, margin: '0 auto' };
    const editableUsageRows = overviewUsageRows.filter(([item]) => item !== '계');
    const monthlyUsageTotal = editableUsageRows.reduce((sum, [, , current]) => sum + parseCurrencyValue(current), 0);
    const usedSafetyCost = parseCurrencyValue(selectedStatement.cumulativeAmount);
    const totalSafetyCost = parseCurrencyValue(project.plannedAmount);
    const safetyUsagePercent = totalSafetyCost > 0 ? Math.round((usedSafetyCost / totalSafetyCost) * 1000) / 10 : 0;
    const safetyUsageBarWidth = Math.min(100, Math.max(0, safetyUsagePercent));
    const remainingSafetyCost = Math.max(0, totalSafetyCost - usedSafetyCost);
    const usageStatementInfoRows = [
        ['대표자', project.representative, '발주자', project.client],
        ['건설업체명', project.constructionCompany, '소재지', project.location],
        ['프로젝트 담당자', getProjectAssigneeLabel(project), 'SHE 담당자', getProjectSheManagerLabel(project)],
        ['공사금액', `${project.constructionAmount}원`, '계상된 안전관리비', `${project.plannedAmount}원`],
        ['공사기간', project.period, '공정률', project.progressRate],
        ...(selectedMonth
            ? [
                ['업로드일', selectedStatement.uploadedAt, '사용률', `${safetyUsagePercent}%`],
            ]
            : []),
    ];
    const showUsageStatementHeaderInfo = true;
    if (projectLoading) {
        return (<AppFrame title="프로젝트 상세">
          <Card style={{ padding: 24, textAlign: 'center', color: C.g400, fontWeight: 800, borderRadius: 6 }}>프로젝트 정보를 불러오는 중입니다.</Card>
        </AppFrame>);
    }
    if (projectError) {
        return (<AppFrame title="프로젝트 상세">
          <Card style={{ padding: 24, textAlign: 'center', color: C.danger, fontWeight: 800, borderRadius: 6 }}>{projectError}</Card>
        </AppFrame>);
    }
    const canUploadUsageStatementFile = canUploadEvidence && Boolean(selectedMonth) && !selectedMonthHasUploadedStatement;
    const usageUploadButton = canUploadUsageStatementFile ? (
      <button type="button" onClick={uploadUsageStatementFromOverview} disabled={usageUploadStage !== 'idle'} style={{ flex: '0 0 auto', border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: usageUploadStage === 'idle' ? C.primary : C.g400, height: 34, padding: '0 13px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, fontFamily: 'inherit', cursor: usageUploadStage === 'idle' ? 'pointer' : 'wait', boxShadow: 'none', whiteSpace: 'nowrap' }}>
        {usageUploadStage === 'ocr' ? 'OCR/분류 처리 중' : usageUploadStage === 'classifying' ? '목록 갱신 중' : '사용내역서 업로드'}
      </button>
    ) : null;
    const uploadCompleteDisabled = uploadCompleteAlreadySubmitted || !canSubmitUploadComplete || uploadCompleteSubmitting;
    const uploadCompleteAction = canUploadEvidence ? (
      <button
        type="button"
        onClick={() => void completeReviewRequest()}
        disabled={uploadCompleteDisabled}
        style={{
          height: 40,
          border: `1px solid ${uploadCompleteDisabled ? C.g200 : C.primary}`,
          borderRadius: 999,
          padding: '0 16px',
          background: uploadCompleteDisabled ? C.g100 : C.bg,
          color: uploadCompleteDisabled ? C.g400 : C.primary,
          cursor: uploadCompleteDisabled ? 'not-allowed' : 'pointer',
          fontSize: 14,
          fontWeight: 800,
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
          boxShadow: 'none',
          opacity: uploadCompleteDisabled ? 0.72 : 1,
        }}
      >
        {uploadCompleteSubmitting ? '처리 중...' : uploadCompleteAlreadySubmitted ? '업로드 완료됨' : '업로드 완료'}
      </button>
    ) : null;
    const monthGridContent = (
      <UsageStatementMonthGrid
        monthlyStatements={monthlyStatements}
        usageStatementsByMonth={dbUsageStatementsByMonth}
        cardShadow={projectDetailCardShadow}
        onSelectMonth={selectUsageMonth}
        onCreateMonth={openMonthCreateModal}
        onRequestDelete={(statement) => {
          setMonthDeleteError('');
          setMonthDeleteTarget(statement);
        }}
      />
    );
    const tabContent = {
        overview: (<div style={{ minWidth: 0 }}>
        {!selectedMonth ? monthGridContent : !hasUsageStatement ? (
          <UsageStatementEmptyState title="사용내역서가 없습니다" />
        ) : <>
        <div data-ui="project-detail.15" style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto', alignItems: 'center', gap: 10, marginBottom: 16, minWidth: 0 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{ minWidth: 0, display: 'inline-flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 19, fontWeight: 800, color: C.g800, whiteSpace: 'nowrap' }}>사용내역서</div>
              <div style={{ fontSize: 13, color: C.g400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {usageUploadStage === 'ocr' ? 'OCR 처리 후 세부 항목 분류까지 진행하고 있습니다.' : usageUploadStage === 'classifying' ? '분류 결과를 화면에 반영하고 있습니다.' : '사용 현황 및 9개 항목 요약'}
              </div>
            </div>
          </div>
          <div />
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => updateTab('details')} style={{ height: 40, border: 'none', borderRadius: 999, background: C.primary, color: C.white, cursor: 'pointer', fontSize: 14, fontWeight: 800, fontFamily: 'inherit', padding: '0 16px', whiteSpace: 'nowrap', boxShadow: 'none' }}>세부 내역 보기</button>
          </div>
        </div>
        <>
        <div style={{ border: `1px solid ${C.g200}`, borderRadius: 12, background: C.white, padding: '18px 20px', marginBottom: 16, boxShadow: '0 8px 18px rgba(31,47,39,.04)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.g800 }}>안전관리비 사용 현황</div>
              <div style={{ fontSize: 13, color: C.g400, fontWeight: 700, marginTop: 4 }}>사용한 안전관리비 / 계상된 안전관리비</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 25, lineHeight: 1, fontWeight: 800, color: C.primary }}>{safetyUsagePercent}%</div>
              <div style={{ fontSize: 12, color: C.g400, fontWeight: 800, marginTop: 5 }}>사용률</div>
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
                {index === 1 && <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.g400, fontSize: 19, fontWeight: 800 }}>-</div>}
                {index === 2 && <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.g400, fontSize: 19, fontWeight: 800 }}>=</div>}
                <div style={{ borderRadius: 10, background: C.white, border: `1px solid ${C.g200}`, padding: '11px 12px', minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: C.g400, fontWeight: 800, marginBottom: 5 }}>{label}</div>
                  <div title={value} style={{ fontSize: 15, color, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
                </div>
              </Fragment>
            ))}
          </div>
        </div>
        <div className="thin-x-scroll" style={usageTableScrollStyle}>
        <div style={{ border: `1px solid ${C.g200}`, borderRadius: 12, overflow: 'hidden', minWidth: usageSummaryGridStyle.minWidth }}>
          <div style={{ ...usageSummaryGridStyle, background: C.g100, borderBottom: `1px solid ${C.g200}` }}>
            {['항목', '전회', '금회', '누계'].map((head) => <div key={head} style={{ padding: '10px 12px', fontSize: 14, color: C.g600, fontWeight: 800, textAlign: head === '항목' ? 'left' : 'right', borderRight: head === '누계' ? 'none' : `1px solid ${C.g200}` }}>{head}</div>)}
          </div>
          {[...editableUsageRows, [
            '계',
            editableUsageRows.reduce((sum, [, previous]) => sum + parseCurrencyValue(previous), 0).toLocaleString('ko-KR'),
            monthlyUsageTotal.toLocaleString('ko-KR'),
            editableUsageRows.reduce((sum, [, , , cumulative]) => sum + parseCurrencyValue(cumulative), 0).toLocaleString('ko-KR'),
          ] as [string, string, string, string]].map(([item, previous, current, cumulative], index) => {
                const isTotal = item === '계';
                return (<div key={item} style={{ ...usageSummaryGridStyle, background: isTotal ? C.g100 : C.white, borderBottom: index === overviewUsageRows.length - 1 ? 'none' : `1px solid ${C.g200}` }}>
                <div style={{ padding: '10px 12px', fontSize: 14, color: C.g800, fontWeight: isTotal ? 800 : 700, borderRight: `1px solid ${C.g200}` }}>{item}</div>
                <div style={{ padding: '10px 12px', fontSize: 14, color: C.g800, fontWeight: isTotal ? 800 : 700, textAlign: 'right', borderRight: `1px solid ${C.g200}` }}>{previous}</div>
                <div style={{ padding: '10px 12px', fontSize: 14, color: C.g800, fontWeight: isTotal ? 800 : 700, textAlign: 'right', borderRight: `1px solid ${C.g200}` }}>{current}</div>
                <div style={{ padding: '10px 12px', fontSize: 14, color: C.g800, fontWeight: isTotal ? 800 : 700, textAlign: 'right' }}>{cumulative}</div>
              </div>);
            })}
        </div>
        </div>
        </>
        </>}
      </div>),
        details: (<div style={{ minWidth: 0 }}>
        {!hasUsageStatement ? (
          <UsageStatementEmptyState title="사용내역서가 없습니다" />
        ) : <>
        {!selectedMonthHasUploadedStatement ? <>
        <UsageStatementEmptyState title={`${selectedStatement.label} 사용내역서가 업로드되지 않았습니다`} minHeight={320} cardWidth={440} titleMarginBottom={22}>
          {usageUploadButton}
        </UsageStatementEmptyState>
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
            }} onUsageDetailContentMutated={revertReviewedProjectToDraft} contentVisible todoStorageKey={selectedStatement.month} clearTodoSignal={todoClearSignal} onTodoCountChange={setActiveSupplementTodoCount} onVerificationComplete={refreshSelectedAgentButtonState} uploadCompleteAction={uploadCompleteAction} readOnly={projectWorkflowLocked} readOnlyReason={projectWorkflowLockedReason}/>}
        </>}
      </div>),
        validation: (<VerifyScreen key={`validation-${project.id}-${selectedStatement.month}`} projectId={project.id} usageStatementId={selectedStatementArchive?.usageStatementId} initialStatus={selectedValidationStatus === 'done' ? 'done' : selectedValidationStatus === 'running' ? 'loading' : 'idle'} initialSheReviewDecision={selectedMonthWorkflowStatus === USAGE_WORKFLOW_STATUS.REVIEW_COMPLETED ? 'review_completed' : selectedMonthWorkflowStatus === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED ? 'supplement_requested' : 'pending'} hideValidationIntro canStartValidation={canStartValidationForCurrentView} validationGateItems={selectedValidationGateItems} validationDisabledReason={selectedValidationDisabledReason} canApproveValidation={canApproveValidationForCurrentView} approveDisabledReason={selectedApproveDisabledReason} onValidationComplete={() => {
                setValidationStatusByMonth((prev) => ({ ...prev, [selectedStatement.month]: 'done' }));
                void refreshSelectedAgentButtonState();
            }} onValidationApproved={async () => {
                const usageStatementId = selectedStatementArchive?.usageStatementId;
                if (!usageStatementId) {
                    throw new Error('사용내역서 정보를 찾을 수 없습니다.');
                }
                try {
                    const latestArchive = await syncSelectedUsageStatementArchive();
                    const latestWorkflowStatus = latestArchive?.workflowStatus || USAGE_WORKFLOW_STATUS.DRAFT;
                    if (selectedValidationStatus !== 'done'
                        || (latestWorkflowStatus !== USAGE_WORKFLOW_STATUS.UPLOAD_COMPLETED
                            && latestWorkflowStatus !== USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED
                            && latestWorkflowStatus !== USAGE_WORKFLOW_STATUS.REVIEW_COMPLETED)) {
                        setValidationStatusByMonth((prev) => ({ ...prev, [selectedStatement.month]: 'idle' }));
                        throw new Error('세부항목 또는 증빙이 변경되어 다시 업로드 완료와 법령 검증을 진행해야 합니다.');
                    }
                    if (latestWorkflowStatus !== USAGE_WORKFLOW_STATUS.REVIEW_COMPLETED) {
                        await completeUsageStatementReview(project.id, usageStatementId);
                    }
                    setValidationStatusByMonth((prev) => ({ ...prev, [selectedStatement.month]: 'done' }));
                    patchMonthWorkflow(selectedStatement.month, USAGE_WORKFLOW_STATUS.REVIEW_COMPLETED);
                    setProject((current) => applyWorkflowToProject(current, USAGE_WORKFLOW_STATUS.REVIEW_COMPLETED));
                    updateTab('report');
                    await refreshArchiveData(project.id);
                } catch (error) {
                    throw error;
                }
            }} onActionRequested={async (details) => {
                const usageStatementId = selectedStatementArchive?.usageStatementId;
                if (!usageStatementId) {
                    showAgentFailure('server-request');
                    return;
                }
                try {
                    const backendWorkflowStatus = selectedStatementArchive?.workflowStatus;
                    if (backendWorkflowStatus !== USAGE_WORKFLOW_STATUS.UPLOAD_COMPLETED
                        && backendWorkflowStatus !== USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED
                        && backendWorkflowStatus !== USAGE_WORKFLOW_STATUS.REVIEW_COMPLETED) {
                        await submitUsageStatement(project.id, usageStatementId);
                    }
                    if (backendWorkflowStatus !== USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED) {
                        await requestUsageStatementSupplement(project.id, usageStatementId);
                    }
                    setValidationStatusByMonth((prev) => ({ ...prev, [selectedStatement.month]: 'done' }));
                    patchMonthWorkflow(selectedStatement.month, USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED, {
                        title: details.title,
                        reason: details.reason,
                        assignee: details.assignee,
                        dueDate: details.dueDate,
                        requestedAt: details.requestedAt,
                    });
                    setProject((current) => applyWorkflowToProject(current, USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED, {
                        title: details.title,
                        reason: details.reason,
                        assignee: details.assignee,
                        dueDate: details.dueDate,
                        requestedAt: details.requestedAt,
                    }));
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
            <h2 data-ui="project-detail.21" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 23, fontWeight: 800, color: C.g800, lineHeight: 1.25, margin: 0, minWidth: 240, flex: '1 1 360px' }}>
              {selectedMonth && <button type="button" aria-label="월 목록으로 돌아가기" title="월 목록으로 돌아가기" onClick={() => setSelectedMonth('')} style={{ width: 30, height: 30, border: `1px solid ${C.g200}`, borderRadius: 999, padding: 0, background: C.white, color: C.primary, fontFamily: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'none', flex: '0 0 auto' }}>
                <ChevronIcon direction="left" size={15} color={C.primary} />
              </button>}
              {!selectedMonth && <button type="button" aria-label="전체 프로젝트로 이동" title="전체 프로젝트로 이동" onClick={() => router.push('/projects')} style={{ width: 30, height: 30, border: `1px solid ${C.g200}`, borderRadius: 999, padding: 0, background: C.white, color: C.primary, fontFamily: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'none', flex: '0 0 auto' }}>
                <ChevronIcon direction="left" size={15} color={C.primary} />
              </button>}
              <span>{project.constructionName} 계약 정산</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.g400, lineHeight: 1, whiteSpace: 'nowrap' }}>{project.contractNumber}</span>
              {selectedMonthShouldDisplayWorkflowStatus && selectedMonthWorkflowStatus === USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED && (canViewActionGuide ? (
                <button type="button" ref={actionRequestBadgeRef} data-ui="project-detail.27" className={shouldPulseActionBadge ? 'action-request-pulse' : undefined} onClick={() => setActionGuideOpen(true)} style={{ border: `1px solid ${STATUS_META[selectedMonthWorkflowStatus].color}`, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: STATUS_META[selectedMonthWorkflowStatus].color, background: STATUS_META[selectedMonthWorkflowStatus].bg, borderRadius: 999, padding: '4px 10px', cursor: 'pointer', lineHeight: 1, whiteSpace: 'nowrap' }}>
                  {STATUS_META[selectedMonthWorkflowStatus].label}
                </button>
              ) : (
                <span data-ui="project-detail.27" style={{ fontSize: 13, fontWeight: 700, color: STATUS_META[selectedMonthWorkflowStatus].color, background: STATUS_META[selectedMonthWorkflowStatus].bg, border: `1px solid ${STATUS_META[selectedMonthWorkflowStatus].color}`, borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap', lineHeight: 1 }}>
                  {STATUS_META[selectedMonthWorkflowStatus].label}
                </span>
              ))}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flex: '1 1 260px', maxWidth: '100%', minWidth: 0, flexWrap: 'wrap' }}>
              {showUsageStatementHeaderInfo && <button type="button" onClick={() => setProjectHeaderOpen((open) => !open)} style={{ flex: '0 0 auto', border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.g600, height: 34, padding: '0 11px', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', boxShadow: '0 7px 16px rgba(31, 55, 43, .08)' }}>
                <ChevronIcon direction={projectHeaderOpen ? 'up' : 'down'} size={14} />
              </button>}
              {selectedMonth ? usageUploadButton : null}
              {canEditManagers && <button type="button" onClick={openProjectInfoModal} style={{ flex: '0 0 auto', border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.primary, height: 34, padding: '0 13px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', boxShadow: 'none' }}>기본 정보 수정</button>}
            </div>
          </div>
          {projectHeaderOpen && showUsageStatementHeaderInfo && <div data-ui="project-detail.26" style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 2, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {selectedMonth && <span style={{ fontSize: 14, fontWeight: 800, color: C.primary, whiteSpace: 'nowrap' }}>{selectedStatement.label}</span>}
              <span style={{ fontSize: 14, fontWeight: 800, color: C.g400 }}>사용내역서 기본 정보</span>
              {selectedMonthShouldDisplayWorkflowStatus && selectedMonthWorkflowStatus !== USAGE_WORKFLOW_STATUS.SUPPLEMENT_REQUIRED && (canViewActionGuide ? (
                <button type="button" ref={actionRequestBadgeRef} data-ui="project-detail.27" className={shouldPulseActionBadge ? 'action-request-pulse' : undefined} onClick={() => setActionGuideOpen(true)} style={{ border: `1px solid ${STATUS_META[selectedMonthWorkflowStatus].color}`, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: STATUS_META[selectedMonthWorkflowStatus].color, background: STATUS_META[selectedMonthWorkflowStatus].bg, borderRadius: 999, padding: '4px 10px', cursor: 'pointer' }}>
                  {STATUS_META[selectedMonthWorkflowStatus].label}
                </button>
              ) : (
                <span data-ui="project-detail.27" style={{ fontSize: 13, fontWeight: 700, color: STATUS_META[selectedMonthWorkflowStatus].color, background: STATUS_META[selectedMonthWorkflowStatus].bg, border: `1px solid ${STATUS_META[selectedMonthWorkflowStatus].color}`, borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap' }}>
                  {STATUS_META[selectedMonthWorkflowStatus].label}
                </span>
              ))}
            </div>
            <UsageStatementInfoTable rows={usageStatementInfoRows} scrollStyle={usageTableScrollStyle} gridStyle={usageInfoGridStyle} />
          </div>}
        </div>
      </Card>
      {actionGuideModal}
      {projectInfoModal}
      {monthCreateModal}
      {monthDeleteModal}
      <UsageStatementUploadModals
        ocrFailureReason={ocrFailureReason}
        duplicateUsageMonthWarning={duplicateUsageMonthWarning}
        usageUploadFailureMessage={usageUploadFailureMessage}
        usageUploadStage={usageUploadStage}
        classificationMoveNotices={classificationMoveNotices}
        uploadCompleteConfirmOpen={uploadCompleteConfirmOpen}
        activeSupplementTodoCount={activeSupplementTodoCount}
        uploadCompleteSubmitting={uploadCompleteSubmitting}
        onClearOcrFailureReason={() => setOcrFailureReason('')}
        onClearDuplicateUsageMonthWarning={() => setDuplicateUsageMonthWarning('')}
        onClearUsageUploadFailureMessage={() => setUsageUploadFailureMessage('')}
        onClearClassificationMoveNotices={() => setClassificationMoveNotices([])}
        onCloseUploadCompleteConfirm={() => setUploadCompleteConfirmOpen(false)}
        onConfirmUploadComplete={() => void completeReviewRequest(true)}
      />
      <CenterModal open={Boolean(agentFailureTarget)} title="처리 실패" body={agentFailureMessage} actionLabel="확인" onAction={() => { setAgentFailureTarget(null); setAgentFailureMessage(''); }} />

      {selectedMonth && <div data-ui="project-detail.28" style={{ width: detailPanelWidth, maxWidth: '100%', margin: '0 auto 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div role="tablist" aria-label="프로젝트 상세 탭" style={{ display: 'flex', alignItems: 'center', gap: 2, flex: '1 1 360px', minWidth: 0, borderBottom: `1px solid ${C.g200}`, overflowX: 'auto' }}>
          {availableTabs.map((tab) => (<button data-ui="project-detail.29" key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => updateTab(tab.id)} style={{ border: 'none', borderBottom: `2px solid ${activeTab === tab.id ? C.primary : 'transparent'}`, background: 'transparent', color: activeTab === tab.id ? C.primary : C.g600, opacity: activeTab === tab.id ? 1 : 0.58, padding: '8px 12px 9px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: activeTab === tab.id ? 800 : 700, whiteSpace: 'nowrap' }}>
              {tab.label}
            </button>))}
        </div>
      </div>}

      <div
        data-ui="project-detail.31"
        style={{
          minWidth: 0,
          overflowX: 'visible',
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
