'use client';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Card from '../../../components/ui/Card';
import CenterModal from '../../../components/ui/CenterModal';
import Modal from '../../../components/ui/Modal';
import ProjectInfoEditorModal from '../../../components/project/ProjectInfoEditorModal';
import { ChevronIcon } from '../../../components/ui';
import { AppFrame } from '../../../components/common';
import { C } from '../../../lib/theme';
import { EMPTY_PROJECT, getProjectManagers, normalizeUsageWorkflowStatus, STATUS_META, type MonthlyUsageStatementSummary, type ProjectSummary, type UsageWorkflowStatus } from '../../../lib/project-data';
import { createActionRequest, getActionRequest, getProject, listActionRequests, listProjectManagerCandidates, markArchiveChecked, replaceProjectAssignees, updateActionRequestStatus, updateProject, type ProjectActionRequest, type ProjectAssignee, type UpdateProjectInput } from '../../../lib/project-api';
import { completeUsageStatementReview, getLatestUsageStatementArchive, getProjectArchiveFromCategories, listProjectFiles, listUsageStatementArchives, requestUsageStatementSupplement, submitUsageStatement, uploadProjectFile, type UsageStatementArchiveData } from '../../../lib/archive-api';
import type { BackendUserProfile } from '../../../lib/auth-api';
import { getAgentFailureMessage, type AgentFailureTarget } from '../../../lib/agent-failure';
import { parseUsageStatementWithOcr } from '../../../lib/agent-api';
import { can } from '../../../lib/permissions';
import { useCurrentUser } from '../../../lib/dev-user';
import ArchiveScreen from '../../../features/project-tab/ArchiveScreen';
import VerifyScreen from '../../../features/project-tab/VerifyScreen';
import ReportScreen from '../../../features/project-tab/ReportScreen';
import { CATS, VALIDATION_DASHBOARD_RESULT, type UsageLineItem } from '../../../lib/evidence-utils';
import type { ArchiveSeed, EvidenceFile } from '../../../types/domain';
type DetailTab = 'overview' | 'details' | 'validation' | 'report';
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
};
type UsageUploadStage = 'idle' | 'ocr' | 'classifying';
type HistoryEventKind = 'upload' | 'review' | 'action' | 'validation' | 'report' | 'project';
type HeaderHistoryItem = {
    id: string;
    kind: HistoryEventKind;
    date: string;
    dateKey?: string;
    time: number;
    count: number;
    title: string;
    summary: string;
};
type PendingReviewUpload = {
    file: EvidenceFile;
    categoryName: string;
    itemName: string;
};
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
};
const OPEN_ACTION_REQUEST_STATUSES = new Set(['open', 'in_progress']);
const TABS: Array<{
    id: DetailTab;
    label: string;
}> = [
    { id: 'overview', label: '사용내역서' },
    { id: 'details', label: '세부 내역' },
    { id: 'validation', label: '유효성 검증' },
    { id: 'report', label: '보고서' },
];
const DETAIL_TABS = new Set<DetailTab>(['overview', 'details', 'validation', 'report']);
const LOCAL_USAGE_STATEMENT_PREFIX = 'iveri-mvp-usage-statement:';
const LOCAL_VALIDATION_STATUS_PREFIX = 'iveri-mvp-validation-status:';
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
interface MvpUsageStatementArchiveData extends MonthUsageStatementArchiveData {
    workflowStatus?: SharedWorkflowStatus;
    actionRequestDetails?: ProjectSummary['actionRequestDetails'];
}
const formatMonthLabel = (month: string) => {
    const [year, monthNo] = month.split('-');
    return `${year}년 ${Number(monthNo)}월`;
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
    const workflowResult = asRecord(workflow)?.result;
    const classification = asRecord(workflowResult)?.classification || asRecord(workflow)?.classification || workflow;
    const items = asArray(asRecord(classification)?.lineItems);
    return items.flatMap((item, index) => {
        const fromCategory = readStringField(item, ['givenCategoryCode', 'originalCategoryCode', 'previousCategoryCode', 'sourceCategoryCode', 'beforeCategoryCode']);
        const toCategory = readStringField(item, ['recommendedCategoryCode', 'classifiedCategoryCode', 'targetCategoryCode', 'finalCategoryCode', 'decidedCategoryCode', 'newCategoryCode', 'changedCategoryCode']);
        if (!fromCategory || !toCategory || fromCategory === toCategory)
            return [];
        return [{
            id: `${readStringField(item, ['rowId', 'id', 'itemId']) || index}`,
            itemName: readStringField(item, ['itemName', 'name', 'usageItemName']) || '사용내역서 세부항목',
            fromCategoryName: categoryNameFromClassificationValue(fromCategory),
            toCategoryName: categoryNameFromClassificationValue(toCategory),
            reason: readStringField(item, ['reason', 'classificationReason', 'decisionReason', 'rationale']),
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
const getLocalUsageStatementKey = (projectId: string) => `${LOCAL_USAGE_STATEMENT_PREFIX}${projectId}`;
const readLocalUsageStatementData = (projectId: string): MvpUsageStatementArchiveData | null => {
    if (typeof window === 'undefined' || !projectId)
        return null;
    try {
        const raw = window.localStorage.getItem(getLocalUsageStatementKey(projectId));
        return raw ? JSON.parse(raw) as MvpUsageStatementArchiveData : null;
    } catch {
        return null;
    }
};
const writeLocalUsageStatementData = (projectId: string, data: MvpUsageStatementArchiveData) => {
    if (typeof window === 'undefined' || !projectId)
        return;
    window.localStorage.setItem(getLocalUsageStatementKey(projectId), JSON.stringify(data));
};
const getLocalValidationStatusKey = (projectId: string) => `${LOCAL_VALIDATION_STATUS_PREFIX}${projectId}`;
const readLocalValidationStatusByMonth = (projectId: string): Record<string, 'idle' | 'running' | 'done'> => {
    if (typeof window === 'undefined' || !projectId)
        return {};
    try {
        const raw = window.localStorage.getItem(getLocalValidationStatusKey(projectId));
        if (!raw)
            return {};
        const parsed = JSON.parse(raw) as Record<string, string>;
        return Object.fromEntries(Object.entries(parsed).filter(([, value]) => value === 'idle' || value === 'running' || value === 'done')) as Record<string, 'idle' | 'running' | 'done'>;
    } catch {
        return {};
    }
};
const writeLocalValidationStatusByMonth = (projectId: string, data: Record<string, 'idle' | 'running' | 'done'>) => {
    if (typeof window === 'undefined' || !projectId)
        return;
    window.localStorage.setItem(getLocalValidationStatusKey(projectId), JSON.stringify(data));
};
const normalizeWorkflowStatus = (value?: string | null): SharedWorkflowStatus => {
    return normalizeUsageWorkflowStatus(value) || 'draft';
};
const applyWorkflowToProject = (project: ProjectSummary, status: SharedWorkflowStatus, actionRequestDetails?: ProjectSummary['actionRequestDetails']): ProjectSummary => ({
    ...project,
    hasActionRequest: status === 'supplement_required',
    actionRequestDetails: status === 'supplement_required' ? actionRequestDetails : undefined,
    reportReady: status === 'review_completed' || status === 'supplement_required',
});
const withActionRequestMonth = (details: ProjectSummary['actionRequestDetails'] | undefined, month?: string): ProjectSummary['actionRequestDetails'] | undefined => {
    if (!details)
        return details;
    return details.month || !month ? details : { ...details, month };
};
const actionRequestToDetails = (request: ProjectActionRequest | undefined, month?: string, assigneeName?: string): ProjectSummary['actionRequestDetails'] | undefined => {
    if (!request)
        return undefined;
    return {
        title: request.title || '보완 요청',
        reason: request.reason || '',
        assignee: assigneeName || (request.assigneeUserId ? `담당자 #${request.assigneeUserId}` : '-'),
        dueDate: request.dueDate || '',
        requestedAt: request.createdAt?.slice(0, 10) || '-',
        month,
    };
};
const ACTION_REQUEST_STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
    open: { label: '요청됨', color: C.danger, bg: C.dangerBg, border: '#FFCDD2' },
    in_progress: { label: '보완 업로드 완료', color: '#8A5A00', bg: '#FFF4D8', border: '#F2D59B' },
    closed: { label: '승인 완료', color: C.primary, bg: C.bg, border: C.light },
};
const getActionRequestStatusMeta = (statusCode?: string | null) => ACTION_REQUEST_STATUS_META[statusCode || ''] || { label: statusCode || '-', color: C.g600, bg: C.g100, border: C.g200 };
const getUsageStatementOcrFailureReason = (file: File) => {
    const fileName = file.name.toLowerCase();
    const supportedExtension = /\.(pdf|png|jpe?g|webp|xlsx)$/i.test(file.name);
    const supportedMime = !file.type || file.type.startsWith('image/') || file.type === 'application/pdf' || file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (!supportedExtension || !supportedMime)
        return '지원하지 않는 파일 형식입니다. PDF, 이미지, XLSX 파일로 다시 업로드해주세요.';
    if (file.size <= 0 || /empty|blank|null|빈|공백|추출실패/.test(fileName))
        return '사용내역서에서 필요한 값을 추출하지 못했습니다.';
    if (/date|날짜|기간오류|일자오류|날짜오류|이상/.test(fileName))
        return '문서의 작성일 또는 정산 월 정보가 올바르지 않습니다.';
    if (/blur|low|poor|quality|화질|흐림|저화질|흔들림/.test(fileName))
        return '문서 이미지의 화질이 낮아 금액과 날짜를 정확히 읽을 수 없습니다.';
    return null;
};
const formatHistoryDate = (value?: string) => {
    if (!value || value === '-') return new Date().toLocaleString('ko-KR');
    return value;
};
const extractDateFromText = (value?: string) => value?.match(/\d{4}-\d{2}-\d{2}/)?.[0];
const getHistoryDateKey = (value?: string) => {
    const date = formatHistoryDate(value);
    const koreanDate = date.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./);
    if (koreanDate) return `${koreanDate[1]}. ${koreanDate[2]}. ${koreanDate[3]}.`;
    const isoDate = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoDate) return `${isoDate[1]}. ${Number(isoDate[2])}. ${Number(isoDate[3])}.`;
    return date.split(' ')[0] || date;
};
const getHistoryTime = (value?: string, fallback = Date.now()) => {
    if (!value || value === '-') return fallback;
    const parsed = Date.parse(value.replace(/\./g, '-'));
    return Number.isFinite(parsed) ? parsed : fallback;
};
const agentWorkflowBadgeStyle = (tone: 'ok' | 'warn' | 'danger' | 'idle'): CSSProperties => {
    if (tone === 'danger')
        return { color: C.danger, background: C.dangerBg, border: '1px solid #FFCDD2' };
    if (tone === 'warn')
        return { color: '#8A5A00', background: '#FFF4D8', border: '1px solid #F2D59B' };
    if (tone === 'ok')
        return { color: C.primary, background: C.bg, border: `1px solid ${C.g200}` };
    return { color: C.g400, background: C.white, border: `1px solid ${C.g200}` };
};
export default function ProjectDetailPage() {
    const router = useRouter();
    const params = useParams<{
        projectId: string;
    }>();
    const searchParams = useSearchParams();
    const { user } = useCurrentUser();
    const projectId = params?.projectId || '';
    const [projectRevision, setProjectRevision] = useState(0);
    const [project, setProject] = useState<ProjectSummary>(EMPTY_PROJECT);
    const [projectLoading, setProjectLoading] = useState(true);
    const [projectError, setProjectError] = useState('');
    const [managerCandidateProfiles, setManagerCandidateProfiles] = useState<BackendUserProfile[]>([]);
    const [dbUsageStatementsByMonth, setDbUsageStatementsByMonth] = useState<Record<string, MonthUsageStatementArchiveData>>({});
    const [actionRequests, setActionRequests] = useState<ProjectActionRequest[]>([]);
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
    const requestedTab = requestedTabParam && DETAIL_TABS.has(requestedTabParam as DetailTab) && availableTabIds.has(requestedTabParam as DetailTab) ? requestedTabParam as DetailTab : 'overview';
    const [activeTab, setActiveTab] = useState<DetailTab>(requestedTab);
    const [archiveSeed, setArchiveSeed] = useState<ArchiveSeed | null>(null);
    const [archiveUsageItems, setArchiveUsageItems] = useState<UsageLineItem[]>([]);
    const [matchReady, setMatchReady] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState('');
    const [usageStatementPage, setUsageStatementPage] = useState(requestedTabParam === 'archive' ? 1 : 0);
    const [usageUploadStage, setUsageUploadStage] = useState<UsageUploadStage>('idle');
    const [validationStatusByMonth, setValidationStatusByMonth] = useState<Record<string, 'idle' | 'running' | 'done'>>({});
    const [selectedHistoryDate, setSelectedHistoryDate] = useState('all');
    const [historyDateMenuOpen, setHistoryDateMenuOpen] = useState(false);
    const [projectHeaderOpen, setProjectHeaderOpen] = useState(true);
    const [actionGuideOpen, setActionGuideOpen] = useState(false);
    const [actionGuideClosingMotion, setActionGuideClosingMotion] = useState<{ x: number; y: number; scale: number } | null>(null);
    const [actionRequestDetailOpen, setActionRequestDetailOpen] = useState(false);
    const [actionRequestDetail, setActionRequestDetail] = useState<ProjectActionRequest | null>(null);
    const [actionRequestDetailLoading, setActionRequestDetailLoading] = useState(false);
    const [actionRequestDetailError, setActionRequestDetailError] = useState('');
    const [actionCompletionSent, setActionCompletionSent] = useState(false);
    const [pendingReviewUploads, setPendingReviewUploads] = useState<PendingReviewUpload[]>([]);
    const [todoClearSignal, setTodoClearSignal] = useState(0);
    const [activeArchiveTodoCount, setActiveArchiveTodoCount] = useState(0);
    const [uploadCompleteConfirmOpen, setUploadCompleteConfirmOpen] = useState(false);
    const [managerModalOpen, setManagerModalOpen] = useState(false);
    const [projectInfoModalOpen, setProjectInfoModalOpen] = useState(false);
    const [monthCreateModalOpen, setMonthCreateModalOpen] = useState(false);
    const [newMonthYear, setNewMonthYear] = useState(String(new Date().getFullYear()));
    const [newMonthNo, setNewMonthNo] = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
    const [newMonthError, setNewMonthError] = useState('');
    const [monthDeleteTarget, setMonthDeleteTarget] = useState<MonthlyUsageStatementSummary | null>(null);
    const [agentFailureTarget, setAgentFailureTarget] = useState<AgentFailureTarget | null>(null);
    const [ocrFailureReason, setOcrFailureReason] = useState('');
    const [classificationMoveNotices, setClassificationMoveNotices] = useState<ClassificationMoveNotice[]>([]);
    const [draftManagerIds, setDraftManagerIds] = useState<number[]>([]);
    const [managerSaveError, setManagerSaveError] = useState('');
    const [managerSaving, setManagerSaving] = useState(false);
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
        projectStatusCode: 'active',
        progressRate: '',
        usageRate: '',
        uploadedAt: '',
        documentWrittenDate: '',
    });
    const [projectInfoSaveError, setProjectInfoSaveError] = useState('');
    const [projectInfoSaving, setProjectInfoSaving] = useState(false);
    const [statementOverrides, setStatementOverrides] = useState<Record<string, Partial<MonthlyUsageStatementSummary>>>({});
    const historyDateMenuRef = useRef<HTMLDivElement | null>(null);
    const actionGuideCardRef = useRef<HTMLDivElement | null>(null);
    const actionRequestBadgeRef = useRef<HTMLButtonElement | null>(null);
    const monthHistoryPushedRef = useRef(false);
    const usageUploadTimersRef = useRef<number[]>([]);
    const monthlyStatements = useMemo(() => Object.values(dbUsageStatementsByMonth)
        .map((entry) => ({
        ...entry.statementSummary,
        ...(statementOverrides[entry.statementSummary.month] || {}),
    }))
        .toSorted((a, b) => a.month.localeCompare(b.month)), [dbUsageStatementsByMonth, statementOverrides]);
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
                    actionRequestDetails: status === 'supplement_required' ? withActionRequestMonth(actionRequestDetails, month) : undefined,
                },
            };
        });
    };
    const getFallbackActionRequestMonth = () => monthlyStatements.find((statement) => validationStatusByMonth[statement.month] === 'done')?.month
        || monthlyStatements.find((statement) => statement.sourceFileName && statement.sourceFileName !== '-')?.month
        || monthlyStatements.find((statement) => {
            const archiveData = dbUsageStatementsByMonth[statement.month];
            return Boolean(archiveData?.usageItems.length || Object.keys(archiveData?.archiveSeed.categories || {}).length);
        })?.month
        || '';
    const resolveActionRequestMonth = (month?: string) => {
        const fallbackMonth = getFallbackActionRequestMonth();
        if (!month)
            return fallbackMonth;
        const statement = monthlyStatements.find((item) => item.month === month);
        const monthHasStatement = Boolean(statement?.sourceFileName && statement.sourceFileName !== '-');
        const archiveData = dbUsageStatementsByMonth[month];
        const monthHasArchiveData = Boolean(archiveData?.usageItems.length || Object.keys(archiveData?.archiveSeed.categories || {}).length);
        if (fallbackMonth && !monthHasStatement && !monthHasArchiveData)
            return fallbackMonth;
        return month;
    };
    const getActionRequestAssigneeName = (request?: ProjectActionRequest) => {
        if (!request?.assigneeUserId)
            return '';
        const candidateName = managerCandidateProfiles.find((manager) => manager.id === request.assigneeUserId)?.realName;
        if (candidateName)
            return candidateName;
        const projectAssigneeIndex = project.assigneeUserIds?.findIndex((id) => id === request.assigneeUserId) ?? -1;
        return projectAssigneeIndex >= 0 ? project.participants[projectAssigneeIndex] || '' : '';
    };
    const refreshArchiveData = async (targetProjectId: string) => {
        const localData = readLocalUsageStatementData(targetProjectId);
        const [statementArchives, latestData, archiveData, latestActionRequests] = await Promise.all([
            listUsageStatementArchives(targetProjectId).catch(() => []),
            getLatestUsageStatementArchive(targetProjectId).catch(() => null),
            getProjectArchiveFromCategories(targetProjectId).catch(() => null),
            listActionRequests(targetProjectId).catch(() => []),
        ]);
        setActionRequests(latestActionRequests);
        const mergedStatementArchives = [...statementArchives];
        if (localData && !mergedStatementArchives.some((item) => item.statementSummary.month === localData.statementSummary.month)) {
            mergedStatementArchives.push(localData);
        }
        const mergedWithActionRequests = mergedStatementArchives.map((item) => {
            const openRequest = latestActionRequests.find((request) => request.usageStatementId === item.usageStatementId && OPEN_ACTION_REQUEST_STATUSES.has(request.statusCode));
            if (!openRequest)
                return item;
            return {
                ...item,
                workflowStatus: 'supplement_required' as const,
                actionRequestDetails: actionRequestToDetails(openRequest, item.statementSummary.month, getActionRequestAssigneeName(openRequest)),
            };
        });
        if (mergedWithActionRequests.length) {
            setDbUsageStatementsByMonth(Object.fromEntries(mergedWithActionRequests.map((item) => [item.statementSummary.month, item])) as Record<string, MonthUsageStatementArchiveData>);
        }
        if (latestData) {
            const latestOpenRequest = latestActionRequests.find((request) => request.usageStatementId === latestData.usageStatementId && OPEN_ACTION_REQUEST_STATUSES.has(request.statusCode));
            const latestWorkflowStatus = latestOpenRequest ? 'supplement_required' : latestData.workflowStatus || 'draft';
            const latestActionRequestDetails = actionRequestToDetails(latestOpenRequest, latestData.statementSummary.month, getActionRequestAssigneeName(latestOpenRequest));
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
            }, latestWorkflowStatus, latestActionRequestDetails));
            return;
        }
        if (archiveData) {
            setArchiveSeed(archiveData.archiveSeed);
            setArchiveUsageItems(archiveData.usageItems);
            setProject((current) => applyWorkflowToProject({
                ...current,
                hasUploads: Boolean(archiveData.archiveSeed.usage_statement.length || archiveData.usageItems.length || current.hasUploads),
            }, normalizeWorkflowStatus(localData?.workflowStatus || current.status), withActionRequestMonth(localData?.actionRequestDetails, localData?.statementSummary.month)));
        }
    };
    const selectedStatement = monthlyStatements.find((statement) => statement.month === selectedMonth) || latestStatement;
    const selectedStatementArchive = selectedStatement.month ? dbUsageStatementsByMonth[selectedStatement.month] : undefined;
    const selectedActionRequest = selectedStatementArchive?.usageStatementId
        ? actionRequests.find((request) => request.usageStatementId === selectedStatementArchive.usageStatementId && OPEN_ACTION_REQUEST_STATUSES.has(request.statusCode))
        : undefined;
    const selectedMonthHasUploadedStatement = Boolean(selectedStatement.sourceFileName && selectedStatement.sourceFileName !== '-');
    const hasUsageStatement = monthlyStatements.length > 0 || Boolean(archiveSeed?.usage_statement?.length || archiveUsageItems.length);
    const selectedValidationStatus = validationStatusByMonth[selectedStatement.month] || 'idle';
    const selectedMonthHasActionRequest = Boolean(
        selectedStatementArchive?.workflowStatus === 'supplement_required'
        || selectedActionRequest
    );
    const selectedMonthWorkflowStatus: SharedWorkflowStatus = selectedStatementArchive?.workflowStatus
        || (selectedMonthHasActionRequest
            ? 'supplement_required'
            : selectedValidationStatus === 'done'
                ? 'review_completed'
                : selectedMonthHasUploadedStatement
                    ? 'draft'
                    : 'draft');
    const selectedMonthShouldDisplayWorkflowStatus = selectedMonthHasUploadedStatement || Boolean(selectedStatementArchive?.workflowStatus || selectedActionRequest);
    const selectedMonthActionRequestDetails = actionRequestToDetails(selectedActionRequest, selectedStatement.month, getActionRequestAssigneeName(selectedActionRequest))
        || selectedStatementArchive?.actionRequestDetails
        || (selectedMonthHasActionRequest ? withActionRequestMonth(project.actionRequestDetails, selectedStatement.month) : undefined);
    const validationSampleReady = VALIDATION_DASHBOARD_RESULT.categories.length > 0;
    const canStartValidationForCurrentView = Boolean(selectedStatementArchive?.usageStatementId)
        && (selectedMonthWorkflowStatus === 'upload_completed' || selectedMonthWorkflowStatus === 'review_completed' || validationSampleReady);
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
        setUsageStatementPage(0);
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
        setUsageStatementPage(0);
        setMonthCreateModalOpen(false);
    };
    const deleteUsageMonth = () => {
        const targetMonth = monthDeleteTarget?.month;
        if (!targetMonth)
            return;
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
            setUsageStatementPage(0);
            setArchiveSeed(null);
            setArchiveUsageItems([]);
        }
        setMonthDeleteTarget(null);
    };
    const headerHistoryItems = useMemo<HeaderHistoryItem[]>(() => {
        const categoryFiles = archiveSeed
            ? Object.values(archiveSeed.categories).flatMap((lineItems) => Object.values(lineItems).flatMap((byKind) => Object.values(byKind).flat()))
            : [];
        const fileEvents = [...(archiveSeed?.usage_statement || []), ...categoryFiles].map((file) => ({
            id: `file-${file.id}`,
            kind: 'upload' as const,
            date: formatHistoryDate(file.uploadedAt),
            time: getHistoryTime(file.uploadedAt),
            count: 1,
            title: file.kind === 'usage_statement' ? '사용내역서 업로드' : '증빙자료 업로드',
            summary: `${file.uploadedBy || '담당자'}님이 ${file.name} 파일을 업로드했습니다.`,
        }));
        const statementEvent = latestStatement?.sourceFileName && latestStatement.sourceFileName !== '-'
            ? [{
                id: `statement-${latestStatement.month}`,
                kind: 'upload' as const,
                date: formatHistoryDate(latestStatement.uploadedAt),
                time: getHistoryTime(latestStatement.uploadedAt),
                count: latestStatement.evidenceCount || 1,
                title: '사용내역서 처리',
                summary: `${latestStatement.label} 사용내역서 OCR 및 분류 결과가 반영되었습니다.`,
            }]
            : [];
        const validationEvent = selectedValidationStatus === 'done'
            ? [{
                id: `validation-${selectedStatement.month}`,
                kind: 'validation' as const,
                date: new Date().toLocaleString('ko-KR'),
                time: Date.now(),
                count: 1,
                title: '유효성 검증 완료',
                summary: `${selectedStatement.label} 검증 결과가 검토 완료되어 보고서 생성이 가능합니다.`,
            }]
            : [];
        const reportEvent = project.reportReady || selectedValidationStatus === 'done'
            ? [{
                id: `report-${selectedStatement.month}`,
                kind: 'report' as const,
                date: new Date().toLocaleString('ko-KR'),
                time: Date.now() - 1,
                count: 1,
                title: '보고서 생성 가능',
                summary: '유효성 검증 결과를 기반으로 보고서 초안을 생성할 수 있습니다.',
            }]
            : [];
        const projectEvent = project.recentActivity
            ? [{
                id: 'project-recent',
                kind: 'project' as const,
                date: formatHistoryDate(extractDateFromText(project.recentActivity)),
                time: getHistoryTime(extractDateFromText(project.recentActivity), 0),
                count: 1,
                title: '프로젝트 정보 갱신',
                summary: project.recentActivity,
            }]
            : [];
        return [...validationEvent, ...reportEvent, ...statementEvent, ...fileEvents, ...projectEvent]
            .map((item) => ({ ...item, dateKey: getHistoryDateKey(item.date) }))
            .sort((a, b) => b.time - a.time)
            .slice(0, 20);
    }, [archiveSeed, latestStatement, project.id, project.recentActivity, project.reportReady, selectedStatement.label, selectedStatement.month, selectedValidationStatus]);
    const historyDateOptions = Array.from(new Set(headerHistoryItems.map((item) => item.dateKey)));
    const visibleHeaderHistoryItems = selectedHistoryDate === 'all'
        ? headerHistoryItems
        : headerHistoryItems.filter((item) => item.dateKey === selectedHistoryDate);
    const canViewActionGuide = user.role === 'project_manager' && selectedMonthHasActionRequest && !actionCompletionSent && Boolean(selectedMonthActionRequestDetails);
    const canEditManagers = user.role === 'she_manager';
    const projectManagers = getProjectManagers(project);
    const managerCandidates = managerCandidateProfiles.map((manager) => manager.realName);
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
    }, [projectId, projectRevision]);
    useEffect(() => {
        if (!canEditManagers)
            return;
        listProjectManagerCandidates()
            .then(setManagerCandidateProfiles)
            .catch(() => setManagerCandidateProfiles([]));
    }, [canEditManagers]);
    useEffect(() => {
        if (!project.id)
            return;
        let alive = true;
        const localData = readLocalUsageStatementData(project.id);
        setArchiveSeed(null);
        setArchiveUsageItems([]);
        setDbUsageStatementsByMonth({});
        setValidationStatusByMonth(readLocalValidationStatusByMonth(project.id));
        setMatchReady(false);
        setActionGuideOpen(user.role === 'project_manager' && selectedMonthHasActionRequest);
        setActionCompletionSent(false);
        setPendingReviewUploads([]);
        if (localData) {
            setDbUsageStatementsByMonth({
                [localData.statementSummary.month]: localData,
            });
            setArchiveSeed(localData.archiveSeed);
            setArchiveUsageItems(localData.usageItems);
            setProject((current) => applyWorkflowToProject({
                ...current,
                hasUploads: localData.statementSummary.evidenceCount > 0 || Boolean(localData.statementSummary.sourceFileName && localData.statementSummary.sourceFileName !== '-'),
                accumulatedAmount: localData.statementSummary.cumulativeAmount,
            }, localData.workflowStatus ? normalizeWorkflowStatus(localData.workflowStatus) : 'draft', withActionRequestMonth(localData.actionRequestDetails, localData.statementSummary.month)));
        }
        refreshArchiveData(project.id)
            .catch(() => {
                if (!alive)
                    return;
                if (!localData)
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
        const archiveData = selectedStatement.month ? dbUsageStatementsByMonth[selectedStatement.month] : undefined;
        if (!project.id || !archiveSeed || !archiveData)
            return;
        writeLocalUsageStatementData(project.id, {
            archiveSeed,
            usageItems: archiveUsageItems,
            overviewRows: archiveData.overviewRows,
            statementSummary: archiveData.statementSummary,
            workflowStatus: selectedMonthShouldDisplayWorkflowStatus ? selectedMonthWorkflowStatus : undefined,
            actionRequestDetails: selectedMonthWorkflowStatus === 'supplement_required'
                ? withActionRequestMonth(selectedMonthActionRequestDetails, selectedStatement.month)
                : undefined,
        });
    }, [archiveSeed, archiveUsageItems, dbUsageStatementsByMonth, project.id, selectedMonthActionRequestDetails, selectedMonthShouldDisplayWorkflowStatus, selectedMonthWorkflowStatus, selectedStatement.month]);
    useEffect(() => {
        if (!project.id)
            return;
        writeLocalValidationStatusByMonth(project.id, validationStatusByMonth);
    }, [project.id, validationStatusByMonth]);
    useEffect(() => {
        setUsageStatementPage(0);
    }, [selectedMonth]);
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
            setUsageStatementPage(0);
            setArchiveSeed(null);
            setArchiveUsageItems([]);
            monthHistoryPushedRef.current = false;
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [selectedMonth]);
    useEffect(() => {
        setActiveTab(requestedTab);
        if (requestedTabParam === 'archive') {
            setUsageStatementPage(1);
        }
    }, [requestedTab, requestedTabParam]);
    useEffect(() => {
        if (!historyDateMenuOpen)
            return;
        const handlePointerDown = (event: PointerEvent) => {
            if (historyDateMenuRef.current?.contains(event.target as Node))
                return;
            setHistoryDateMenuOpen(false);
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape')
                setHistoryDateMenuOpen(false);
        };
        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [historyDateMenuOpen]);
    const updateTab = (tab: DetailTab) => {
        if (!availableTabIds.has(tab))
            return;
        setActiveTab(tab);
        if (tab !== 'overview')
            setUsageStatementPage(0);
        router.replace(`/projects/${project.id}?tab=${tab}`);
    };
    const openArchiveView = () => {
        setActiveTab('details');
        setUsageStatementPage(0);
        router.replace(`/projects/${project.id}?tab=details`);
    };
    const registerPendingReviewUploads = (uploadedFiles: EvidenceFile[], context?: { categoryName: string; itemName: string }) => {
        if (!canUploadEvidence || !uploadedFiles.length)
            return;
        const categoryName = context?.categoryName || '선택 항목';
        const itemName = context?.itemName || categoryName;
        setPendingReviewUploads((current) => [
            ...current,
            ...uploadedFiles.map((file) => ({ file, categoryName, itemName })),
        ]);
    };
    const revertReviewedProjectToDraft = () => {
        patchMonthWorkflow(selectedStatement.month, 'draft');
        setProject((current) => ({ ...current, hasUploads: true }));
        setValidationStatusByMonth((prev) => prev[selectedStatement.month] ? { ...prev, [selectedStatement.month]: 'idle' } : prev);
    };
    const completeReviewRequest = async () => {
        if (!canUploadEvidence || !hasUsageStatement)
            return;
        const usageStatementId = selectedStatementArchive?.usageStatementId;
        try {
            if (selectedActionRequest) {
                let updatedRequest = selectedActionRequest;
                if (updatedRequest.statusCode === 'open') {
                    updatedRequest = await updateActionRequestStatus(project.id, updatedRequest.id, 'in_progress');
                }
                setActionRequests((current) => current.map((request) => request.id === updatedRequest.id ? updatedRequest : request));
            } else if (usageStatementId && selectedMonthWorkflowStatus === 'draft') {
                await submitUsageStatement(project.id, usageStatementId);
            }
            const nextWorkflowStatus: SharedWorkflowStatus = selectedActionRequest ? 'supplement_required' : 'upload_completed';
            patchMonthWorkflow(selectedStatement.month, nextWorkflowStatus, selectedActionRequest ? selectedMonthActionRequestDetails : undefined);
            setProject((current) => applyWorkflowToProject({
                ...current,
                hasUploads: true,
            }, nextWorkflowStatus, selectedActionRequest ? selectedMonthActionRequestDetails : undefined));
            setValidationStatusByMonth((prev) => ({ ...prev, [selectedStatement.month]: 'idle' }));
            setActionCompletionSent(true);
            setActionGuideOpen(false);
            setActionGuideClosingMotion(null);
            setPendingReviewUploads([]);
            setTodoClearSignal((signal) => signal + 1);
            setUploadCompleteConfirmOpen(false);
        } catch {
            setAgentFailureTarget('server-request');
        }
    };
    const sendReviewRequest = () => {
        if (activeArchiveTodoCount > 0) {
            setUploadCompleteConfirmOpen(true);
            return;
        }
        completeReviewRequest();
    };
    const openManagerModal = () => {
        const idsFromProject = project.assigneeUserIds || [];
        const idsFromNames = projectManagers
            .map((name) => managerCandidateProfiles.find((manager) => manager.realName === name)?.id)
            .filter((id): id is number => typeof id === 'number');
        setDraftManagerIds(idsFromProject.length ? idsFromProject : idsFromNames);
        setManagerSaveError('');
        setManagerModalOpen(true);
    };
    const openProjectInfoModal = () => {
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
        input.accept = 'image/*,.pdf,.xlsx';
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
                setUsageUploadStage('ocr');
                setUsageStatementPage(0);
                uploadProjectFile(project.id, pickedFile, 'usage_statement')
                    .then(async (uploadedEntry) => {
                        if (uploadedEntry.fileId) {
                            const ocrWorkflow = await parseUsageStatementWithOcr(project.id, uploadedEntry.fileId);
                            if (!ocrWorkflow.usageStatementId) {
                                throw new Error('사용내역서 OCR 결과에 사용내역서 ID가 없습니다.');
                            }
                            const moveNotices = extractClassificationMoveNotices(ocrWorkflow);
                            if (moveNotices.length) {
                                setClassificationMoveNotices(moveNotices);
                            }
                        }
                        const uploadedAt = uploadedEntry.uploadedAt || new Date().toISOString().slice(0, 10);
                        const month = selectedMonth || uploadedAt.slice(0, 7);
                        const statementSummary: MonthlyUsageStatementSummary = {
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
                                archiveSeed: current[month]?.archiveSeed || { usage_statement: [], categories: {} },
                                usageItems: current[month]?.usageItems || [],
                                overviewRows: current[month]?.overviewRows || EMPTY_OVERVIEW_ROWS,
                                statementSummary,
                                workflowStatus: 'draft',
                            },
                        }));
                        setArchiveSeed((current) => ({
                            usage_statement: [uploadedEntry, ...(current?.usage_statement || []).filter((file) => file.fileId !== uploadedEntry.fileId)],
                            categories: current?.categories || {},
                        }));
                        setProject((current) => ({ ...current, hasUploads: true }));
                        setSelectedMonth(month);
                        setUsageUploadStage('classifying');
                        await refreshArchiveData(project.id);
                        setUsageUploadStage('idle');
                        openArchiveView();
                    })
                    .catch(() => {
                        setUsageUploadStage('idle');
                        setAgentFailureTarget('usage-classification');
                    });
            } catch {
                usageUploadTimersRef.current.forEach((timer) => window.clearTimeout(timer));
                usageUploadTimersRef.current = [];
                setUsageUploadStage('idle');
                setAgentFailureTarget('usage-classification');
            }
        };
        input.click();
    };
    const toggleDraftManager = (managerId: number) => {
        setDraftManagerIds((current) => current.includes(managerId) ? current.filter((item) => item !== managerId) : [...current, managerId]);
        setManagerSaveError('');
    };
    const selectedManagerNames = draftManagerIds
        .map((id) => managerCandidateProfiles.find((manager) => manager.id === id)?.realName)
        .filter((name): name is string => Boolean(name));
    const assigneesToProjectPatch = (assignees: ProjectAssignee[]) => {
        const names = assignees.map((assignee) => assignee.realName).filter(Boolean);
        return {
            manager: names.join(', '),
            participants: names,
            assigneeUserIds: assignees.map((assignee) => assignee.userId),
        };
    };
    const saveManagers = async () => {
        const userIds = Array.from(new Set(draftManagerIds));
        setManagerSaving(true);
        setManagerSaveError('');
        try {
            const assignees = await replaceProjectAssignees(project.id, userIds);
            setProject((current) => ({ ...current, ...assigneesToProjectPatch(assignees) }));
            setProjectRevision((revision) => revision + 1);
            setManagerModalOpen(false);
        } catch (error) {
            setManagerSaveError(error instanceof Error ? error.message : '관리자 저장에 실패했습니다.');
        } finally {
            setManagerSaving(false);
        }
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
                recentActivity: savedProject.recentActivity,
            }));
            setProjectInfoModalOpen(false);
        } catch (error) {
            setProjectInfoSaveError(error instanceof Error ? error.message : '사용내역서 기본 정보 저장에 실패했습니다.');
        } finally {
            setProjectInfoSaving(false);
        }
    };
    const dismissArchiveMatchReady = async () => {
        setMatchReady(false);
        if (project.uncheckedMatchedFileCount <= 0)
            return;
        await markArchiveChecked(project.id);
        setProject((current) => ({ ...current, uncheckedMatchedFileCount: 0 }));
    };
    const managerModal = (<Modal open={managerModalOpen} onClose={() => setManagerModalOpen(false)} zIndex={960} maxWidth={560}>
      <div style={{ background: C.white, borderRadius: 6, border: `1px solid ${C.g200}`, boxShadow: '0 18px 44px rgba(0,0,0,.16)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px 15px', borderBottom: `1px solid ${C.g100}`, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: C.g800 }}>관리자 수정</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.g400, marginTop: 5 }}>{project.constructionName}</div>
          </div>
          <button type="button" aria-label="관리자 수정 닫기" onClick={() => setManagerModalOpen(false)} style={{ border: 'none', background: 'transparent', color: C.g400, cursor: 'pointer', fontSize: 24, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: C.g400, marginBottom: 8 }}>현재 관리자</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, minHeight: 34, marginBottom: 18 }}>
            {selectedManagerNames.map((manager) => {
              const managerId = managerCandidateProfiles.find((candidate) => candidate.realName === manager)?.id;
              return (
              <span key={manager} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '6px 9px 6px 11px', background: C.bg, color: C.primary, border: `1px solid ${C.light}`, fontSize: 12, fontWeight: 900 }}>
                {manager}
                <button type="button" aria-label={`${manager} 삭제`} onClick={() => {
                    if (managerId)
                        setDraftManagerIds((current) => current.filter((item) => item !== managerId));
                }} style={{ width: 18, height: 18, borderRadius: 999, border: 'none', background: C.white, color: C.g400, fontFamily: 'inherit', fontSize: 14, lineHeight: '18px', cursor: 'pointer', padding: 0 }}>×</button>
              </span>
            );
            })}
            {selectedManagerNames.length === 0 && <span style={{ fontSize: 13, fontWeight: 800, color: C.g400 }}>현재 지정된 관리자가 없습니다.</span>}
          </div>

          <div style={{ fontSize: 12, fontWeight: 900, color: C.g400, marginBottom: 8 }}>관리자 후보</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 18 }}>
            {managerCandidateProfiles.map((manager) => {
                const selected = draftManagerIds.includes(manager.id);
                return (
                  <button key={manager.id} type="button" onClick={() => toggleDraftManager(manager.id)} style={{ border: `1px solid ${selected ? C.primary : C.g200}`, borderRadius: 6, padding: '9px 10px', background: selected ? C.bg : C.white, color: selected ? C.primary : C.g800, fontFamily: 'inherit', fontSize: 13, fontWeight: 900, cursor: 'pointer', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {manager.realName}
                  </button>
                );
            })}
          </div>

          {!managerCandidates.length && <div style={{ border: `1px solid ${C.g200}`, borderRadius: 6, padding: '12px 13px', color: C.g400, fontSize: 13, fontWeight: 800 }}>지정할 수 있는 프로젝트 담당자가 없습니다. system_admin에게 프로젝트 담당자 계정 생성을 요청해 주세요.</div>}
          {managerSaveError && <div style={{ marginTop: 12, fontSize: 13, fontWeight: 900, color: C.danger }}>{managerSaveError}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <button type="button" onClick={() => setManagerModalOpen(false)} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '9px 14px', background: C.white, color: C.g600, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer' }}>취소</button>
            <button type="button" onClick={saveManagers} disabled={managerSaving} style={{ border: 'none', borderRadius: 999, padding: '9px 16px', background: managerSaving ? C.g200 : C.primary, color: managerSaving ? C.g400 : C.white, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: managerSaving ? 'not-allowed' : 'pointer' }}>{managerSaving ? '저장 중' : '저장'}</button>
          </div>
        </div>
      </div>
    </Modal>);
    const projectInfoModal = (<ProjectInfoEditorModal open={projectInfoModalOpen} mode="usage" title="사용내역서 기본 정보 수정" subtitle={project.constructionName} draft={projectInfoDraft} error={projectInfoSaveError} saving={projectInfoSaving} showStatementDates={Boolean(selectedMonth)} onClose={() => setProjectInfoModalOpen(false)} onSave={saveProjectInfo} onChange={(patch) => {
            setProjectInfoDraft((current) => ({ ...current, ...patch }));
            setProjectInfoSaveError('');
        }}/>);
    const monthCreateModal = (
      <Modal open={monthCreateModalOpen} onClose={() => setMonthCreateModalOpen(false)} zIndex={970} maxWidth={420}>
        <div style={{ background: C.white, border: `1px solid ${C.g200}`, borderRadius: 18, boxShadow: '0 18px 44px rgba(0,0,0,.16)', padding: 22 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: C.g800, marginBottom: 6 }}>사용내역서 월 추가</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.g400, lineHeight: 1.55, marginBottom: 16 }}>추가할 사용내역서의 연도와 월을 입력해 주세요.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: C.g600 }}>년도</span>
              <input
                value={newMonthYear}
                onChange={(event) => {
                  setNewMonthYear(event.target.value.replace(/\D/g, '').slice(0, 4));
                  setNewMonthError('');
                }}
                inputMode="numeric"
                placeholder="2026"
                style={{ height: 40, border: `1px solid ${C.g200}`, borderRadius: 8, padding: '0 12px', color: C.g800, fontFamily: 'inherit', fontSize: 14, fontWeight: 900, outline: 'none' }}
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
                style={{ height: 40, border: `1px solid ${C.g200}`, borderRadius: 8, padding: '0 12px', color: C.g800, fontFamily: 'inherit', fontSize: 14, fontWeight: 900, outline: 'none' }}
              />
            </label>
          </div>
          {newMonthError && <div style={{ marginTop: 10, borderRadius: 8, background: C.dangerBg, color: C.danger, padding: '9px 10px', fontSize: 12, fontWeight: 900 }}>{newMonthError}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <button type="button" onClick={() => setMonthCreateModalOpen(false)} style={{ height: 38, border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.g600, padding: '0 15px', fontFamily: 'inherit', fontSize: 13, fontWeight: 900, cursor: 'pointer' }}>취소</button>
            <button type="button" onClick={addUsageMonth} style={{ height: 38, border: 'none', borderRadius: 999, background: C.primary, color: C.white, padding: '0 16px', fontFamily: 'inherit', fontSize: 13, fontWeight: 900, cursor: 'pointer' }}>추가</button>
          </div>
        </div>
      </Modal>
    );
    const monthDeleteModal = (
      <Modal open={Boolean(monthDeleteTarget)} onClose={() => setMonthDeleteTarget(null)} zIndex={980} maxWidth={440}>
        <div style={{ background: C.white, border: `1px solid ${C.g200}`, borderRadius: 18, boxShadow: '0 18px 44px rgba(0,0,0,.16)', padding: 22 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: C.g800, marginBottom: 8 }}>사용내역서 월 삭제</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.g600, lineHeight: 1.6 }}>
            {monthDeleteTarget?.label} 사용내역서를 삭제하시겠습니까? 해당 월의 사용내역서와 증빙 서류가 제거됩니다.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <button type="button" onClick={() => setMonthDeleteTarget(null)} style={{ height: 38, border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.g600, padding: '0 15px', fontFamily: 'inherit', fontSize: 13, fontWeight: 900, cursor: 'pointer' }}>취소</button>
            <button type="button" onClick={deleteUsageMonth} style={{ height: 38, border: 'none', borderRadius: 999, background: C.danger, color: C.white, padding: '0 16px', fontFamily: 'inherit', fontSize: 13, fontWeight: 900, cursor: 'pointer' }}>삭제</button>
          </div>
        </div>
      </Modal>
    );
    const uploadCompleteConfirmModal = (
      <Modal open={uploadCompleteConfirmOpen} onClose={() => setUploadCompleteConfirmOpen(false)} zIndex={990} maxWidth={460}>
        <div style={{ background: C.white, border: `1px solid ${C.g200}`, borderRadius: 18, boxShadow: '0 18px 44px rgba(0,0,0,.16)', padding: 22 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: C.g800, marginBottom: 8 }}>업로드 완료 확인</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.g600, lineHeight: 1.65 }}>
            아직 완료되지 않은 보완 TODO가 {activeArchiveTodoCount}건 있습니다. <br />모든 보완을 완료했는지 확인해 주세요.
            <br /><br />
            <span style={{ color: C.danger, fontWeight: 900 }}>업로드 완료를 진행하면 현재 월의 보완 TODO 리스트가 모두 삭제됩니다.</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <button type="button" onClick={() => setUploadCompleteConfirmOpen(false)} style={{ height: 38, border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.g600, padding: '0 15px', fontFamily: 'inherit', fontSize: 13, fontWeight: 900, cursor: 'pointer' }}>취소</button>
            <button type="button" onClick={completeReviewRequest} style={{ height: 38, border: 'none', borderRadius: 999, background: C.primary, color: C.white, padding: '0 16px', fontFamily: 'inherit', fontSize: 13, fontWeight: 900, cursor: 'pointer' }}>업로드 완료</button>
          </div>
        </div>
      </Modal>
    );
    const actionGuideTitle = selectedMonthActionRequestDetails?.title || '보완 요청';
    const actionGuideMessage = selectedMonthActionRequestDetails?.reason || '';
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
    const openActionRequestDetail = async () => {
        if (!selectedActionRequest)
            return;
        setActionRequestDetailOpen(true);
        setActionRequestDetail(selectedActionRequest);
        setActionRequestDetailLoading(true);
        setActionRequestDetailError('');
        try {
            const detail = await getActionRequest(project.id, selectedActionRequest.id);
            setActionRequestDetail(detail);
            setActionRequests((current) => current.map((request) => request.id === detail.id ? detail : request));
        } catch (error) {
            setActionRequestDetailError(error instanceof Error ? error.message : '조치 요청 상세 정보를 불러오지 못했습니다.');
        } finally {
            setActionRequestDetailLoading(false);
        }
    };
    const closeActionRequestDetail = () => {
        setActionRequestDetailOpen(false);
        setActionRequestDetailError('');
    };
    const actionRequestDetailStatusMeta = getActionRequestStatusMeta(actionRequestDetail?.statusCode);
    const actionRequestDetailRows: Array<[string, string]> = actionRequestDetail ? [
        ['요청 제목', actionRequestDetail.title || '-'],
        ['요청 사유', actionRequestDetail.reason || '-'],
        ['상태', actionRequestDetailStatusMeta.label],
        ['처리 기한', actionRequestDetail.dueDate || '-'],
        ['요청일', actionRequestDetail.createdAt?.slice(0, 10) || '-'],
        ['요청자 ID', String(actionRequestDetail.requestedByUserId ?? '-')],
        ['담당자 ID', String(actionRequestDetail.assigneeUserId ?? '-')],
        ['사용내역서 ID', String(actionRequestDetail.usageStatementId ?? '-')],
        ['세부항목 ID', String(actionRequestDetail.usageStatementItemId ?? '-')],
    ] : [];
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
                <div style={{ fontSize: 20, fontWeight: 900, color: C.g800, lineHeight: 1.35 }}>{actionGuideTitle}</div>
                {actionGuideMeta && <div style={{ fontSize: 12, color: C.g400, fontWeight: 900, marginTop: 6 }}>{actionGuideMeta}</div>}
              </div>
              <button type="button" aria-label="부족한 서류 안내 닫기" onClick={closeActionGuide} style={{ border: 'none', background: 'transparent', color: C.g400, cursor: 'pointer', fontSize: 24, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: '18px 22px 20px' }}>
              <div style={{ fontSize: 13, color: C.g600, lineHeight: 1.7, marginBottom: 14 }}>{actionGuideMessage}</div>
              {actionGuideRequestedFiles.length > 0 && <div style={{ border: `1px solid ${C.g100}`, borderRadius: 6, background: '#FCFEFD', padding: '12px 14px', display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: C.g800 }}>요청 자료</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {actionGuideRequestedFiles.map((fileName) => <span key={fileName} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.g600, padding: '4px 8px', fontSize: 12, fontWeight: 900 }}>{fileName}</span>)}
                </div>
              </div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                <button type="button" onClick={openActionRequestDetail} disabled={!selectedActionRequest || actionRequestDetailLoading} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '9px 14px', background: C.bg, color: C.primary, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: !selectedActionRequest || actionRequestDetailLoading ? 'not-allowed' : 'pointer', opacity: !selectedActionRequest || actionRequestDetailLoading ? 0.45 : 1 }}>상세 보기</button>
                <button type="button" onClick={closeActionGuide} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '9px 14px', background: C.white, color: C.g600, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer' }}>닫기</button>
              </div>
            </div>
          </div>
        </Modal>
    ) : null;
    const actionRequestDetailModal = (
        <Modal open={actionRequestDetailOpen} onClose={closeActionRequestDetail} zIndex={970} maxWidth={620}>
          <div style={{ background: C.white, borderRadius: 6, border: `1px solid ${C.g200}`, boxShadow: '0 18px 44px rgba(0,0,0,.16)', overflow: 'hidden' }}>
            <div style={{ padding: '18px 20px 14px', borderBottom: `1px solid ${C.g100}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 7 }}>
                  <span style={{ fontSize: 18, fontWeight: 900, color: C.g800 }}>조치 요청 상세</span>
                  {actionRequestDetail && <span style={{ border: `1px solid ${actionRequestDetailStatusMeta.border}`, borderRadius: 999, background: actionRequestDetailStatusMeta.bg, color: actionRequestDetailStatusMeta.color, padding: '4px 9px', fontSize: 11, fontWeight: 900 }}>{actionRequestDetailStatusMeta.label}</span>}
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, color: C.g400 }}>{selectedStatement.label}</div>
              </div>
              <button type="button" aria-label="조치 요청 상세 닫기" onClick={closeActionRequestDetail} style={{ border: 'none', background: 'transparent', color: C.g400, cursor: 'pointer', fontSize: 24, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: 20 }}>
              {actionRequestDetailLoading && <div style={{ border: `1px solid ${C.g200}`, borderRadius: 6, background: C.g100, padding: '12px 14px', color: C.g600, fontSize: 13, fontWeight: 900, marginBottom: 12 }}>최신 상세 정보를 불러오는 중입니다.</div>}
              {actionRequestDetailError && <div style={{ border: '1px solid #FFCDD2', borderRadius: 6, background: C.dangerBg, padding: '12px 14px', color: C.danger, fontSize: 13, fontWeight: 900, marginBottom: 12 }}>{actionRequestDetailError}</div>}
              {actionRequestDetail ? (
                <div style={{ border: `1px solid ${C.g200}`, borderRadius: 6, overflow: 'hidden' }}>
                  {actionRequestDetailRows.map(([label, value], index) => (
                    <div key={label} style={{ display: 'grid', gridTemplateColumns: '130px minmax(0, 1fr)', borderTop: index === 0 ? 'none' : `1px solid ${C.g100}` }}>
                      <div style={{ background: C.g100, padding: '10px 12px', color: C.g600, fontSize: 12, fontWeight: 900 }}>{label}</div>
                      <div style={{ padding: '10px 12px', color: C.g800, fontSize: 13, fontWeight: 800, lineHeight: 1.55, wordBreak: 'break-word' }}>{value}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: C.g400, fontSize: 13, fontWeight: 900 }}>표시할 조치 요청 정보가 없습니다.</div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
                <button type="button" onClick={() => {
                    closeActionRequestDetail();
                    updateTab('details');
                }} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '9px 14px', background: C.bg, color: C.primary, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer' }}>세부 내역으로 이동</button>
                <button type="button" onClick={closeActionRequestDetail} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '9px 14px', background: C.white, color: C.g600, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer' }}>닫기</button>
              </div>
            </div>
          </div>
        </Modal>
    );
    const agentWorkflowItems = [
        {
            code: 'OCR',
            title: '사용내역서 OCR',
            description: '금액, 날짜, 세부 항목 추출',
            label: hasUsageStatement ? '완료' : '대기',
            tone: hasUsageStatement ? 'ok' as const : 'idle' as const,
        },
        {
            code: 'CL',
            title: '분류 Agent',
            description: '세부 항목을 9개 항목으로 분류',
            label: archiveUsageItems.length ? '완료' : hasUsageStatement ? '실행 가능' : '대기',
            tone: archiveUsageItems.length ? 'ok' as const : hasUsageStatement ? 'warn' as const : 'idle' as const,
        },
        {
            code: 'SD',
            title: 'Safety Doc Agent',
            description: '사용내역서와 증빙자료 매칭',
            label: matchReady || project.uncheckedMatchedFileCount > 0 ? '매칭 완료' : hasUsageStatement ? '실행 가능' : '대기',
            tone: matchReady || project.uncheckedMatchedFileCount > 0 ? 'ok' as const : hasUsageStatement ? 'warn' as const : 'idle' as const,
        },
        {
            code: 'VI',
            title: 'Vision Model',
            description: '현장사진 적합성 판단',
            label: archiveUsageItems.length ? '검증 가능' : '대기',
            tone: archiveUsageItems.length ? 'warn' as const : 'idle' as const,
        },
        {
            code: 'LG',
            title: 'Legal Agent',
            description: '법령 기준 유효성 검증',
            label: selectedMonthWorkflowStatus === 'review_completed' ? '검토 완료' : selectedMonthWorkflowStatus === 'supplement_required' ? '보완 요청' : selectedMonthWorkflowStatus === 'upload_completed' ? '검증 가능' : '대기',
            tone: selectedMonthWorkflowStatus === 'review_completed' ? 'ok' as const : selectedMonthWorkflowStatus === 'supplement_required' ? 'danger' as const : selectedMonthWorkflowStatus === 'upload_completed' ? 'warn' as const : 'idle' as const,
        },
        {
            code: 'RP',
            title: 'Report Agent',
            description: '보고서 초안 생성',
            label: selectedMonthWorkflowStatus === 'review_completed' || selectedMonthWorkflowStatus === 'supplement_required' ? '생성 가능' : '대기',
            tone: selectedMonthWorkflowStatus === 'review_completed' || selectedMonthWorkflowStatus === 'supplement_required' ? 'ok' as const : 'idle' as const,
        },
    ];
    const agentWorkflowCard = (<section data-ui="project-detail.agent-workflow" style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 14, color: C.g800, fontWeight: 900 }}>에이전트 워크플로우</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {agentWorkflowItems.map((agent) => {
            const badgeStyle = agentWorkflowBadgeStyle(agent.tone);
            return <div key={agent.code} style={{ border: `1px solid ${C.g200}`, borderRadius: 6, background: C.white, padding: '9px 10px' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 7 }}>
                  <span style={{ fontSize: 12, fontWeight: 900, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{agent.title}</span>
                  <span style={{ ...badgeStyle, borderRadius: 999, padding: '3px 7px', fontSize: 10, fontWeight: 900, lineHeight: 1.1, whiteSpace: 'nowrap' }}>{agent.label}</span>
                </div>
                <div style={{ marginTop: 4, fontSize: 10, fontWeight: 800, color: C.g400, lineHeight: 1.35 }}>{agent.description}</div>
              </div>
            </div>;
        })}
      </div>
    </section>);
    const historyCard = (<section data-ui="project-detail.40" style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ width: '100%', color: C.g800, fontFamily: 'inherit', padding: '8px 4px', display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-start', gap: 4 }}>
        <span data-ui="project-detail.1" style={{ fontSize: 14, color: C.g800, fontWeight: 900 }}>최근 이력</span>
      </div>
      <div data-ui="project-detail.41" style={{ marginTop: 6, minHeight: 0, display: 'flex', flexDirection: 'column', flex: '1 1 auto' }}>
      <div data-ui="project-detail.2" style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 6, alignItems: 'center', marginBottom: 8 }}>
        <button data-ui="project-detail.history-all-date" type="button" onClick={() => {
            setSelectedHistoryDate('all');
            setHistoryDateMenuOpen(false);
        }} style={{ border: selectedHistoryDate === 'all' ? 'none' : `1px solid ${C.g200}`, borderRadius: 999, padding: '6px 10px', fontSize: 11, fontWeight: 900, color: selectedHistoryDate === 'all' ? C.white : C.g600, background: selectedHistoryDate === 'all' ? C.primary : C.white, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>전체 날짜</button>
        <div ref={historyDateMenuRef} style={{ position: 'relative', minWidth: 0 }}>
          <button data-ui="project-detail.history-date-menu" type="button" onClick={() => setHistoryDateMenuOpen((open) => !open)} style={{ width: '100%', border: `1px solid ${C.g200}`, borderRadius: 999, padding: '6px 9px', fontSize: 11, fontWeight: 900, color: selectedHistoryDate === 'all' ? C.g400 : C.primary, background: C.white, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {selectedHistoryDate === 'all' ? '날짜 선택' : selectedHistoryDate}
          </button>
          {historyDateMenuOpen && <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 30, background: C.white, border: `1px solid ${C.g200}`, borderRadius: 6, boxShadow: '0 8px 20px rgba(27,94,59,.14)', padding: 4, maxHeight: 190, overflowY: 'auto' }}>
            {historyDateOptions.length === 0 ? <div style={{ padding: '8px 9px', fontSize: 12, fontWeight: 900, color: C.g400, textAlign: 'center' }}>날짜 없음</div> : historyDateOptions.map((date) => (
              <button key={date} type="button" onClick={() => {
                  setSelectedHistoryDate(date);
                  setHistoryDateMenuOpen(false);
              }} style={{ width: '100%', border: 'none', background: selectedHistoryDate === date ? C.bg : 'transparent', color: selectedHistoryDate === date ? C.primary : C.g600, borderRadius: 6, padding: '7px 8px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 900, textAlign: 'center' }}>
                {date}
              </button>
            ))}
          </div>}
        </div>
      </div>
      <div data-ui="project-detail.8" style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '1 1 auto', minHeight: 0, overflowY: 'auto' }}>
        {visibleHeaderHistoryItems.length === 0 ? <div style={{ padding: '14px 12px', borderRadius: 6, background: C.g100, border: `1px solid ${C.g200}`, color: C.g400, fontSize: 12, fontWeight: 900, lineHeight: 1.5 }}>
          표시할 이력이 없습니다.
        </div> : visibleHeaderHistoryItems.map((item) => (<div data-ui="project-detail.9" key={item.id} style={{ padding: '11px 12px', borderRadius: 6, background: C.g100, border: `1px solid ${C.g200}` }}>
            <div data-ui="project-detail.10" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
              <span data-ui="project-detail.11" style={{ fontSize: 12, color: C.g400, fontWeight: 900 }}>{item.date}</span>
              <span data-ui="project-detail.12" style={{ fontSize: 12, color: item.count > 0 ? C.primary : C.g400, fontWeight: 900 }}>{item.count}건</span>
            </div>
            <div data-ui="project-detail.13" style={{ fontSize: 14, color: C.g800, fontWeight: 900, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
            <div data-ui="project-detail.14" style={{ fontSize: 13, color: C.g600, lineHeight: 1.45 }}>
              {item.summary}
            </div>
          </div>))}
      </div>
      </div>
    </section>);
    
    const projectInfoCardStyle: CSSProperties = { minWidth: 0, height: 60, boxSizing: 'border-box', padding: '11px 12px', borderRadius: 6, background: C.g100, border: `1px solid ${C.g200}` };
    const projectInfoGrid = (<div data-ui="project-detail.info-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, minWidth: 0 }}>
      <div style={{ ...projectInfoCardStyle, position: 'relative', paddingRight: canEditManagers ? 58 : 12 }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: C.g400, marginBottom: 4 }}>관리자</div>
        {canEditManagers && <button type="button" onClick={openManagerModal} style={{ position: 'absolute', top: 11, right: 12, border: `1px solid ${C.g200}`, borderRadius: 999, padding: '3px 8px', background: C.white, color: C.primary, fontSize: 11, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer' }}>수정</button>}
        <div title={project.manager} style={{ fontSize: 13, fontWeight: 900, color: C.g800, lineHeight: 1.45, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{project.manager}</div>
      </div>
      {[
              ['건설업체', project.constructionCompany],
              ['공사기간', project.period],
              ['소재지', project.location],
              ['공사금액', `${project.constructionAmount}원`],
              ['계상된 안전관리비', `${project.plannedAmount}원`],
              ['대표자', project.representative],
              ['발주자', project.client],
          ].map(([label, value]) => (
            <div key={label} style={projectInfoCardStyle}>
              <div style={{ fontSize: 12, fontWeight: 900, color: C.g400, marginBottom: 4 }}>{label}</div>
              <div title={value} style={{ fontSize: 13, fontWeight: 900, color: C.g800, lineHeight: 1.45, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
            </div>
          ))}
    </div>);
    const overviewUsageRows = selectedStatementArchive?.overviewRows || EMPTY_OVERVIEW_ROWS;
    const usageInfoGridStyle = { display: 'grid', gridTemplateColumns: '120px minmax(170px, 1fr) 120px minmax(170px, 1fr)', minWidth: 620 } as const;
    const usageSummaryGridStyle = { display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) 130px 150px 130px', minWidth: 670 } as const;
    const usageTableScrollStyle = { width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'auto', overflowY: 'hidden' } as const;
    const tabPanelStyle: CSSProperties = selectedMonth && activeTab === 'report'
        ? { padding: 0, border: 'none', boxShadow: 'none', background: 'transparent', minWidth: 0, overflow: 'visible' }
        : { padding: 24, borderRadius: 6, background: C.white, minWidth: 0, overflow: 'visible' };
    const parseProjectPeriod = (period: string) => {
        const [startDate = '', endDate = ''] = period.split('~').map((value) => value.trim().replace(/\//g, '-'));
        return { startDate, endDate };
    };
    const parseCurrencyValue = (value: string) => {
        const numeric = Number(String(value || '').replace(/[^\d]/g, ''));
        return Number.isFinite(numeric) ? numeric : 0;
    };
    const editableUsageRows = overviewUsageRows.filter(([item]) => item !== '계');
    const monthlyUsageTotal = editableUsageRows.reduce((sum, [, , current]) => sum + parseCurrencyValue(current), 0);
    const usedSafetyCost = monthlyUsageTotal || parseCurrencyValue(selectedStatement.cumulativeAmount);
    const totalSafetyCost = parseCurrencyValue(project.plannedAmount);
    const safetyUsagePercent = totalSafetyCost > 0 ? Math.min(100, Math.round((usedSafetyCost / totalSafetyCost) * 1000) / 10) : 0;
    const remainingSafetyCost = Math.max(0, totalSafetyCost - usedSafetyCost);
    const usageStatementInfoRows = [
        ['건설업체명', project.constructionCompany, '공사명', project.constructionName],
        ['소재지', project.location, '대표자', project.representative],
        ['공사금액', `${project.constructionAmount}원`, '공사기간', project.period],
        ['발주자', project.client, '공정률', project.progressRate],
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
    const reviewRequestHeaderButton = canUploadEvidence ? (
      <button
        type="button"
        onClick={sendReviewRequest}
        disabled={!selectedMonthHasUploadedStatement}
        style={{
          height: 32,
          border: `1px solid ${!selectedMonthHasUploadedStatement ? C.g200 : C.primary}`,
          borderRadius: 999,
          padding: '0 12px',
          background: !selectedMonthHasUploadedStatement ? C.g100 : C.bg,
          color: !selectedMonthHasUploadedStatement ? C.g400 : C.primary,
          cursor: !selectedMonthHasUploadedStatement ? 'not-allowed' : 'pointer',
          fontSize: 12,
          fontWeight: 900,
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
          boxShadow: 'none',
        }}
      >
        업로드 완료
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
        <div style={{ border: `1px solid ${C.g200}`, borderRadius: 14, background: 'linear-gradient(135deg, rgba(255,255,255,.96) 0%, rgba(247,252,248,.98) 58%, rgba(238,248,242,.9) 100%)', padding: 18, boxShadow: '0 14px 30px rgba(31,55,43,.06)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {monthlyStatements.map((statement) => {
            const uploaded = Boolean(statement.sourceFileName && statement.sourceFileName !== '-');
            const archiveData = dbUsageStatementsByMonth[statement.month];
            const hasSupplementRequest = archiveData?.workflowStatus === 'supplement_required';
            const totalAmount = archiveData?.overviewRows?.find(([label]) => label === '계')?.[3] || statement.cumulativeAmount || '0';
            return (
              <button
                key={statement.month}
                type="button"
                onClick={() => selectUsageMonth(statement.month)}
                style={{ position: 'relative', border: `1px solid ${hasSupplementRequest ? '#FFB7BC' : uploaded ? C.light : C.g200}`, borderRadius: 12, background: hasSupplementRequest ? 'linear-gradient(135deg, #FFF6F7 0%, #FFFFFF 100%)' : uploaded ? 'linear-gradient(135deg, #F2FAF5 0%, #FFFFFF 100%)' : 'rgba(255,255,255,.88)', padding: '17px 16px', minHeight: 142, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 14, boxShadow: hasSupplementRequest ? '0 12px 24px rgba(229, 57, 53, .12)' : '0 10px 22px rgba(31,55,43,.07)' }}
              >
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`${statement.label} 삭제`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setMonthDeleteTarget(statement);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ')
                      return;
                    event.preventDefault();
                    event.stopPropagation();
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
                  <div style={{ marginTop: 9, fontSize: 12, fontWeight: 900, color: hasSupplementRequest ? C.danger : uploaded ? C.primary : C.g400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {hasSupplementRequest ? '보완 요청 있음' : uploaded ? '사용내역서 있음' : '사용내역서 없음'}
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
            style={{ border: `1px dashed ${C.light}`, borderRadius: 12, background: 'rgba(255,255,255,.72)', minHeight: 142, cursor: 'pointer', fontFamily: 'inherit', display: 'grid', placeItems: 'center', color: C.primary, boxShadow: '0 10px 22px rgba(31,55,43,.05)' }}
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
            <div style={{ width: 'min(100%, 420px)', border: `1px solid ${C.g200}`, borderRadius: 6, background: C.bg, padding: '34px 28px', textAlign: 'center' }}>
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
        <div style={{ border: `1px solid ${C.g200}`, borderRadius: 6, background: '#F7FCF8', padding: '18px 20px', marginBottom: 16 }}>
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
            <div style={{ width: `${safetyUsagePercent}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${C.primary}, ${C.light})` }} />
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
                <div style={{ borderRadius: 6, background: C.white, border: `1px solid ${C.g200}`, padding: '11px 12px', minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: C.g400, fontWeight: 900, marginBottom: 5 }}>{label}</div>
                  <div title={value} style={{ fontSize: 14, color, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
                </div>
              </Fragment>
            ))}
          </div>
        </div>
        <div className="thin-x-scroll" style={usageTableScrollStyle}>
        <div style={{ border: `1px solid ${C.g200}`, borderRadius: 6, overflow: 'hidden', minWidth: usageSummaryGridStyle.minWidth }}>
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
            <div style={{ width: 'min(100%, 420px)', border: `1px solid ${C.g200}`, borderRadius: 6, background: C.bg, padding: '34px 28px', textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: C.g800, marginBottom: 9 }}>사용내역서가 없습니다</div>
            </div>
          </div>
        ) : <>
        {!selectedMonthHasUploadedStatement && <div data-ui="project-detail.details-header" style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto', alignItems: 'center', gap: 10, marginBottom: 16, minWidth: 0 }}>
          <div style={{ minWidth: 0, display: 'inline-flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: C.g800, whiteSpace: 'nowrap' }}>세부 내역</div>
            <div style={{ fontSize: 12, color: C.g400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>사용내역서 세부 내역 및 증빙 파일 보기</div>
          </div>
          <div />
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => updateTab('overview')} style={{ height: 40, border: 'none', borderRadius: 999, background: C.primary, color: C.white, cursor: 'pointer', fontSize: 13, fontWeight: 900, fontFamily: 'inherit', padding: '0 16px', whiteSpace: 'nowrap', boxShadow: 'none' }}>사용내역서 보기</button>
          </div>
        </div>}
        {!selectedMonthHasUploadedStatement ? <>
        <div style={{ minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ width: 'min(100%, 420px)', border: `1px solid ${C.g200}`, borderRadius: 6, background: C.bg, padding: '34px 28px', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: C.g800, marginBottom: 9 }}>{selectedStatement.label} 사용내역서가 아직 업로드되지 않았습니다</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.g400, marginBottom: 16 }}>월은 먼저 표시하고, 사용내역서는 업로드 전 상태로 보여줍니다.</div>
            {usageUploadButton}
          </div>
        </div>
        </> : null}
        {selectedMonthHasUploadedStatement && <ArchiveScreen projectId={project.id} usageStatementId={selectedStatementArchive?.usageStatementId} matchReady={matchReady} uncheckedMatchedFileCount={project.uncheckedMatchedFileCount} onDismissMatchReady={dismissArchiveMatchReady} archiveSeed={archiveSeed} usageItems={archiveUsageItems} actionRequest={canViewActionGuide ? {
                title: actionGuideTitle,
                message: actionGuideMessage,
                dueDate: selectedMonthActionRequestDetails?.dueDate,
            } : undefined} onUsageItemsChange={(items) => {
                setArchiveUsageItems(items);
                revertReviewedProjectToDraft();
            }} onFilesUploaded={registerPendingReviewUploads} onArchiveContentMutated={revertReviewedProjectToDraft} contentVisible todoStorageKey={selectedStatement.month} clearTodoSignal={todoClearSignal} onTodoCountChange={setActiveArchiveTodoCount} onBackToOverview={() => updateTab('overview')} uploadCompleteAction={reviewRequestHeaderButton}/>}
        </>}
      </div>),
        validation: (<VerifyScreen key={`validation-${project.id}-${selectedStatement.month}`} projectId={project.id} usageStatementId={selectedStatementArchive?.usageStatementId} initialStatus={selectedValidationStatus === 'done' ? 'done' : 'idle'} hideValidationIntro contractName={`${project.name} · ${selectedStatement.label}`} canStartValidation={canStartValidationForCurrentView} onValidationComplete={() => {
                setValidationStatusByMonth((prev) => ({ ...prev, [selectedStatement.month]: 'done' }));
            }} onValidationApproved={async () => {
                const usageStatementId = selectedStatementArchive?.usageStatementId;
                if (!usageStatementId) {
                    setAgentFailureTarget('server-request');
                    return;
                }
                try {
                    if (selectedMonthWorkflowStatus === 'draft') {
                        await submitUsageStatement(project.id, usageStatementId);
                    }
                    await completeUsageStatementReview(project.id, usageStatementId);
                    if (selectedActionRequest?.statusCode === 'in_progress') {
                        const closedRequest = await updateActionRequestStatus(project.id, selectedActionRequest.id, 'closed');
                        setActionRequests((current) => current.map((request) => request.id === closedRequest.id ? closedRequest : request));
                    }
                    setValidationStatusByMonth((prev) => ({ ...prev, [selectedStatement.month]: 'done' }));
                    patchMonthWorkflow(selectedStatement.month, 'review_completed');
                    setProject((current) => applyWorkflowToProject(current, 'review_completed'));
                    updateTab('report');
                    await refreshArchiveData(project.id);
                } catch {
                    setAgentFailureTarget('server-request');
                }
            }} onActionRequested={async (details) => {
                const usageStatementId = selectedStatementArchive?.usageStatementId;
                const assigneeUserId = project.assigneeUserIds?.[0];
                if (!usageStatementId || !assigneeUserId) {
                    setAgentFailureTarget('server-request');
                    return;
                }
                try {
                    if (selectedMonthWorkflowStatus === 'draft') {
                        await submitUsageStatement(project.id, usageStatementId);
                    }
                    if (selectedMonthWorkflowStatus !== 'supplement_required') {
                        await requestUsageStatementSupplement(project.id, usageStatementId);
                    }
                    const dueDate = details.dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
                    const actionRequest = await createActionRequest(project.id, {
                        title: details.title || '보완 요청',
                        reason: details.reason,
                        assigneeUserId,
                        usageStatementId,
                        dueDate,
                    });
                    const backendDetails = actionRequestToDetails(actionRequest, selectedStatement.month, getActionRequestAssigneeName(actionRequest)) || { ...details, month: selectedStatement.month };
                    setActionRequests((current) => [actionRequest, ...current.filter((request) => request.id !== actionRequest.id)]);
                    setValidationStatusByMonth((prev) => ({ ...prev, [selectedStatement.month]: 'done' }));
                    patchMonthWorkflow(selectedStatement.month, 'supplement_required', backendDetails);
                    setProject((current) => applyWorkflowToProject(current, 'supplement_required', backendDetails));
                    await refreshArchiveData(project.id);
                } catch {
                    setAgentFailureTarget('server-request');
                }
            }}/>),
        report: (<ReportScreen projectId={project.id} usageStatementId={selectedStatementArchive?.usageStatementId} validationComplete={selectedMonthWorkflowStatus === 'review_completed' || selectedMonthWorkflowStatus === 'supplement_required' || selectedValidationStatus === 'done'} contractName={`${project.name} · ${selectedStatement.label}`}/>),
    };
    return (<AppFrame title={project.name} mainClassName="project-detail-main">
      <Card style={{ padding: '18px 20px', marginBottom: 14, overflow: 'visible', position: 'relative', zIndex: 20, borderRadius: 6 }}>
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
              {selectedMonthShouldDisplayWorkflowStatus && (canViewActionGuide ? (
                <button type="button" ref={actionRequestBadgeRef} data-ui="project-detail.27" className={shouldPulseActionBadge ? 'action-request-pulse' : undefined} onClick={() => setActionGuideOpen(true)} style={{ border: `1px solid ${STATUS_META[selectedMonthWorkflowStatus].color}`, fontFamily: 'inherit', fontSize: 12, fontWeight: 800, color: STATUS_META[selectedMonthWorkflowStatus].color, background: STATUS_META[selectedMonthWorkflowStatus].bg, borderRadius: 999, padding: '4px 10px', cursor: 'pointer' }}>
                  {STATUS_META[selectedMonthWorkflowStatus].label}
                </button>
              ) : (
                <span data-ui="project-detail.27" style={{ fontSize: 12, fontWeight: 800, color: STATUS_META[selectedMonthWorkflowStatus].color, background: STATUS_META[selectedMonthWorkflowStatus].bg, border: `1px solid ${STATUS_META[selectedMonthWorkflowStatus].color}`, borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap' }}>
                  {STATUS_META[selectedMonthWorkflowStatus].label}
                </span>
              ))}
              {project.uncheckedMatchedFileCount > 0 && (
                <button type="button" onClick={openArchiveView} style={{ border: `1px solid ${C.light}`, borderRadius: 999, padding: '4px 10px', background: C.bg, color: C.primary, fontSize: 12, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  미확인 매칭 {project.uncheckedMatchedFileCount}건
                </button>
              )}
            </div>
            <div className="thin-x-scroll" style={usageTableScrollStyle}>
              <div data-ui="project-detail.16" style={{ ...usageInfoGridStyle, border: `1px solid ${C.g200}`, borderRadius: 6, overflow: 'hidden', fontSize: 13 }}>
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
      {actionRequestDetailModal}
      {managerModal}
      {projectInfoModal}
      {monthCreateModal}
      {monthDeleteModal}
      {uploadCompleteConfirmModal}
      <CenterModal open={Boolean(ocrFailureReason)} title="사용내역서 OCR 실패" body={<div>
        <div style={{ marginBottom: 8 }}>사용내역서를 다시 업로드해주세요.</div>
        <div style={{ border: `1px solid ${C.g200}`, borderRadius: 6, background: C.g100, padding: '10px 12px', color: C.g800 }}>{ocrFailureReason}</div>
      </div>} actionLabel="확인" onAction={() => setOcrFailureReason('')} />
      <CenterModal open={classificationMoveNotices.length > 0} title="세부항목 분류 변경" body={<div>
        <div style={{ marginBottom: 10, fontSize: 13, color: C.g600, lineHeight: 1.6 }}>classi 에이전트가 일부 세부항목의 9개 항목 위치를 변경했습니다.</div>
        <div style={{ display: 'grid', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
          {classificationMoveNotices.map((notice) => (
            <div key={notice.id} style={{ border: `1px solid ${C.g200}`, borderRadius: 6, background: C.white, padding: '10px 12px' }}>
              <div title={notice.itemName} style={{ fontSize: 13, fontWeight: 900, color: C.g800, marginBottom: 7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{notice.itemName}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', alignItems: 'center', gap: 8 }}>
                <span title={notice.fromCategoryName} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '6px 9px', background: C.g100, color: C.g600, fontSize: 11, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{notice.fromCategoryName}</span>
                <span style={{ color: C.primary, fontWeight: 900 }}>→</span>
                <span title={notice.toCategoryName} style={{ border: `1px solid ${C.light}`, borderRadius: 999, padding: '6px 9px', background: C.bg, color: C.primary, fontSize: 11, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{notice.toCategoryName}</span>
              </div>
              {notice.reason && <div style={{ marginTop: 7, fontSize: 11, color: C.g600, lineHeight: 1.5 }}>{notice.reason}</div>}
            </div>
          ))}
        </div>
      </div>} actionLabel="확인" onAction={() => setClassificationMoveNotices([])} />
      <CenterModal open={Boolean(agentFailureTarget)} title="처리 실패" body={agentFailureTarget ? getAgentFailureMessage(agentFailureTarget) : ''} actionLabel="확인" onAction={() => setAgentFailureTarget(null)} />

      {selectedMonth && <div data-ui="project-detail.28" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div role="tablist" aria-label="프로젝트 상세 탭" style={{ display: 'flex', alignItems: 'center', gap: 2, flex: '1 1 360px', minWidth: 0, borderBottom: `1px solid ${C.g200}`, overflowX: 'auto' }}>
          {availableTabs.map((tab) => (<button data-ui="project-detail.29" key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => updateTab(tab.id)} style={{ border: 'none', borderBottom: `2px solid ${activeTab === tab.id ? C.primary : 'transparent'}`, background: 'transparent', color: activeTab === tab.id ? C.primary : C.g600, opacity: activeTab === tab.id ? 1 : 0.58, padding: '8px 12px 9px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: activeTab === tab.id ? 900 : 800, whiteSpace: 'nowrap' }}>
              {tab.label}
            </button>))}
        </div>
      </div>}

      <div
        data-ui="project-detail.31"
        style={{
          minWidth: 0,
        }}
      >
        <Card style={tabPanelStyle}>
          {selectedMonth ? tabContent[activeTab] : tabContent.overview}
        </Card>
      </div>
    </AppFrame>);
}
