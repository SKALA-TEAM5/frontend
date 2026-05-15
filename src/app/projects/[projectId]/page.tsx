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
import { EMPTY_PROJECT, getProjectManagers, normalizeProjectStatus, STATUS_META, type MonthlyUsageStatementSummary, type ProjectStatus, type ProjectSummary } from '../../../lib/project-data';
import { deleteProject, getProject, listProjectManagerCandidates, markArchiveChecked, replaceProjectAssignees, updateProject, type ProjectAssignee, type UpdateProjectInput } from '../../../lib/project-api';
import { getLatestUsageStatementArchive, getProjectArchiveFromCategories, listProjectFiles, listUsageStatementArchives, uploadProjectFile, type UsageStatementArchiveData } from '../../../lib/archive-api';
import type { BackendUserProfile } from '../../../lib/auth-api';
import { getAgentFailureMessage, type AgentFailureTarget } from '../../../lib/agent-failure';
import { can } from '../../../lib/permissions';
import { useCurrentUser } from '../../../lib/dev-user';
import ArchiveScreen from '../../../features/project-tab/ArchiveScreen';
import VerifyScreen from '../../../features/project-tab/VerifyScreen';
import ReportScreen from '../../../features/project-tab/ReportScreen';
import { CATS, VALIDATION_DASHBOARD_RESULT, createEntryFromFile, type UsageLineItem } from '../../../lib/evidence-utils';
import type { ArchiveSeed, EvidenceFile } from '../../../types/domain';
type DetailTab = 'overview' | 'validation' | 'report';
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
    revisionNo: string;
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
type SharedWorkflowStatus = 'draft' | 'upload_completed' | 'supplement_required' | 'review_completed';
const TABS: Array<{
    id: DetailTab;
    label: string;
}> = [
    { id: 'overview', label: '사용내역서' },
    { id: 'validation', label: '유효성 검증' },
    { id: 'report', label: '보고서' },
];
const DETAIL_TABS = new Set<DetailTab>(['overview', 'validation', 'report']);
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
interface MvpUsageStatementArchiveData {
    archiveSeed: ArchiveSeed;
    usageItems: UsageLineItem[];
    overviewRows: Array<[string, string, string, string]>;
    statementSummary: MonthlyUsageStatementSummary;
    workflowStatus?: SharedWorkflowStatus;
    actionRequestDetails?: ProjectSummary['actionRequestDetails'];
}
const parseAmount = (value: string) => {
    const numeric = Number(String(value || '').replace(/[^\d]/g, ''));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 8500000000;
};
const formatMonthLabel = (month: string) => {
    const [year, monthNo] = month.split('-');
    return `${year}년 ${Number(monthNo)}월`;
};
const getNextMonthKey = (month?: string) => {
    const base = month ? new Date(`${month}-01`) : new Date();
    if (Number.isNaN(base.getTime()))
        return new Date().toISOString().slice(0, 7);
    base.setMonth(base.getMonth() + 1);
    return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`;
};
const buildMvpUsageStatementArchiveData = (project: ProjectSummary, fileEntry: EvidenceFile, uploadedBy: string): MvpUsageStatementArchiveData => {
    const now = new Date();
    const month = now.toISOString().slice(0, 7);
    const plannedAmount = parseAmount(project.plannedAmount || project.constructionAmount);
    const categoryAmounts = [0.18, 0.16, 0.13, 0.09, 0.1, 0.08, 0.11, 0.07, 0.08].map((ratio) => Math.round(plannedAmount * ratio));
    const usageItems = CATS.map((cat, index) => ({
        id: `mvp-usage-${project.id}-${cat.id}`,
        categoryId: cat.id,
        name: `${cat.label} (${Number(month.slice(5))}월)`,
        amount: categoryAmounts[index] || 0,
    }));
    const overviewRows = CATS.map((cat, index) => {
        const amount = categoryAmounts[index] || 0;
        return [`${cat.id}. ${cat.label}`, '0', amount.toLocaleString('ko-KR'), amount.toLocaleString('ko-KR')] as [string, string, string, string];
    });
    const total = categoryAmounts.reduce((sum, amount) => sum + amount, 0);
    const uploadedAt = now.toISOString().slice(0, 10);
    return {
        archiveSeed: {
            usage_statement: [{ ...fileEntry, uploadedAt, uploadedBy, categoryIds: [], usageItemIds: [] }],
            categories: {},
        },
        usageItems,
        overviewRows: [...overviewRows, ['계', '0', total.toLocaleString('ko-KR'), total.toLocaleString('ko-KR')]],
        statementSummary: {
            month,
            label: formatMonthLabel(month),
            sourceFileName: fileEntry.name,
            revisionNo: 1,
            documentWrittenDate: uploadedAt,
            uploadedAt,
            uploadedBy,
            parseStatus: 'OCR 완료',
            validationStatus: '미검증',
            currentAmount: total.toLocaleString('ko-KR'),
            cumulativeAmount: total.toLocaleString('ko-KR'),
            evidenceCount: 0,
            issueCount: 0,
        },
    };
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
    return normalizeProjectStatus(value);
};
const applyWorkflowToProject = (project: ProjectSummary, status: SharedWorkflowStatus, actionRequestDetails?: ProjectSummary['actionRequestDetails']): ProjectSummary => ({
    ...project,
    status,
    hasActionRequest: status === 'supplement_required',
    actionRequestDetails: status === 'supplement_required' ? actionRequestDetails : undefined,
    reportReady: status === 'review_completed' || status === 'supplement_required',
});
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
    const [dbUsageStatementsByMonth, setDbUsageStatementsByMonth] = useState<Record<string, UsageStatementArchiveData>>({});
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
    const [actionCompletionSent, setActionCompletionSent] = useState(false);
    const [pendingReviewUploads, setPendingReviewUploads] = useState<PendingReviewUpload[]>([]);
    const [managerModalOpen, setManagerModalOpen] = useState(false);
    const [projectInfoModalOpen, setProjectInfoModalOpen] = useState(false);
    const [monthCreateModalOpen, setMonthCreateModalOpen] = useState(false);
    const [newMonthYear, setNewMonthYear] = useState(String(new Date().getFullYear()));
    const [newMonthNo, setNewMonthNo] = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
    const [newMonthError, setNewMonthError] = useState('');
    const [monthDeleteTarget, setMonthDeleteTarget] = useState<MonthlyUsageStatementSummary | null>(null);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    const [deletingProject, setDeletingProject] = useState(false);
    const [agentFailureTarget, setAgentFailureTarget] = useState<AgentFailureTarget | null>(null);
    const [ocrFailureReason, setOcrFailureReason] = useState('');
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
        revisionNo: '',
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
    const refreshArchiveData = async (targetProjectId: string) => {
        const localData = readLocalUsageStatementData(targetProjectId);
        const [statementArchives, latestData, archiveData] = await Promise.all([
            listUsageStatementArchives(targetProjectId).catch(() => []),
            getLatestUsageStatementArchive(targetProjectId).catch(() => null),
            getProjectArchiveFromCategories(targetProjectId).catch(() => null),
        ]);
        const mergedStatementArchives = [...statementArchives];
        if (localData && !mergedStatementArchives.some((item) => item.statementSummary.month === localData.statementSummary.month)) {
            mergedStatementArchives.push(localData);
        }
        if (mergedStatementArchives.length) {
            setDbUsageStatementsByMonth(Object.fromEntries(mergedStatementArchives.map((item) => [item.statementSummary.month, item])) as Record<string, UsageStatementArchiveData>);
        }
        if (latestData) {
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
            }, normalizeWorkflowStatus(localData?.workflowStatus || current.status), localData?.actionRequestDetails));
            return;
        }
        if (archiveData) {
            setArchiveSeed(archiveData.archiveSeed);
            setArchiveUsageItems(archiveData.usageItems);
            setProject((current) => applyWorkflowToProject({
                ...current,
                hasUploads: Boolean(archiveData.archiveSeed.usage_statement.length || archiveData.usageItems.length || current.hasUploads),
            }, normalizeWorkflowStatus(localData?.workflowStatus || current.status), localData?.actionRequestDetails));
        }
    };
    const selectedStatement = monthlyStatements.find((statement) => statement.month === selectedMonth) || latestStatement;
    const selectedStatementArchive = selectedStatement.month ? dbUsageStatementsByMonth[selectedStatement.month] : undefined;
    const selectedMonthHasUploadedStatement = Boolean(selectedStatement.sourceFileName && selectedStatement.sourceFileName !== '-');
    const hasUsageStatement = monthlyStatements.length > 0 || Boolean(archiveSeed?.usage_statement?.length || archiveUsageItems.length);
    const selectedValidationStatus = validationStatusByMonth[selectedStatement.month] || 'idle';
    const workflowStatus = normalizeWorkflowStatus(project.status);
    const validationSampleReady = VALIDATION_DASHBOARD_RESULT.categories.length > 0;
    const canStartValidationForCurrentView = workflowStatus === 'upload_completed' || workflowStatus === 'review_completed' || validationSampleReady;
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
    const canViewActionGuide = user.role === 'project_manager' && workflowStatus === 'supplement_required' && !actionCompletionSent && Boolean(project.actionRequestDetails);
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
        setActionGuideOpen(user.role === 'project_manager' && workflowStatus === 'supplement_required');
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
                hasUploads: true,
                accumulatedAmount: localData.statementSummary.cumulativeAmount,
            }, normalizeWorkflowStatus(localData.workflowStatus), localData.actionRequestDetails));
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
        setActionGuideOpen(user.role === 'project_manager' && workflowStatus === 'supplement_required');
    }, [user.role, workflowStatus]);
    useEffect(() => () => {
        usageUploadTimersRef.current.forEach((timer) => window.clearTimeout(timer));
        usageUploadTimersRef.current = [];
    }, []);
    useEffect(() => {
        const latestArchiveData = latestStatement.month ? dbUsageStatementsByMonth[latestStatement.month] : undefined;
        if (!project.id || !archiveSeed || !latestArchiveData)
            return;
        writeLocalUsageStatementData(project.id, {
            archiveSeed,
            usageItems: archiveUsageItems,
            overviewRows: latestArchiveData.overviewRows,
            statementSummary: latestArchiveData.statementSummary,
            workflowStatus,
            actionRequestDetails: workflowStatus === 'supplement_required' ? project.actionRequestDetails : undefined,
        });
    }, [archiveSeed, archiveUsageItems, dbUsageStatementsByMonth, latestStatement.month, project.actionRequestDetails, project.id, workflowStatus]);
    useEffect(() => {
        if (!project.id)
            return;
        writeLocalValidationStatusByMonth(project.id, validationStatusByMonth);
    }, [project.id, validationStatusByMonth]);
    useEffect(() => {
        setUsageStatementPage(0);
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
        setActiveTab('overview');
        setUsageStatementPage(1);
        router.replace(`/projects/${project.id}?tab=overview`);
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
        setProject((current) => current.status === 'upload_completed' || current.status === 'review_completed'
            ? applyWorkflowToProject({
                ...current,
                hasUploads: true,
            }, 'draft')
            : current);
        setValidationStatusByMonth((prev) => prev[selectedStatement.month] ? { ...prev, [selectedStatement.month]: 'idle' } : prev);
    };
    const sendReviewRequest = () => {
        if (!canUploadEvidence || !hasUsageStatement)
            return;
        setProject((current) => applyWorkflowToProject({
            ...current,
            hasUploads: true,
        }, 'upload_completed'));
        setValidationStatusByMonth((prev) => ({ ...prev, [selectedStatement.month]: 'idle' }));
        setActionCompletionSent(true);
        setActionGuideOpen(false);
        setActionGuideClosingMotion(null);
        setPendingReviewUploads([]);
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
            revisionNo: String(selectedStatement.revisionNo || ''),
            uploadedAt: selectedStatement.uploadedAt,
            documentWrittenDate: selectedStatement.documentWrittenDate,
        });
        setProjectInfoSaveError('');
        setProjectInfoModalOpen(true);
    };
    const uploadUsageStatementFromOverview = () => {
        if (!canUploadEvidence || usageUploadStage !== 'idle')
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
                            },
                        }));
                        setArchiveSeed((current) => ({
                            usage_statement: [uploadedEntry, ...(current?.usage_statement || []).filter((file) => file.fileId !== uploadedEntry.fileId)],
                            categories: current?.categories || {},
                        }));
                        setProject((current) => current.status === 'upload_completed' || current.status === 'review_completed'
                            ? applyWorkflowToProject({
                                ...current,
                                hasUploads: true,
                            }, 'draft')
                            : { ...current, hasUploads: true });
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
                /*
                const ocrTimer = window.setTimeout(() => {
                    try {
                        setLatestDbStatement(processedData.statementSummary);
                        if (!processedData.statementSummary.currentAmount || !processedData.statementSummary.sourceFileName || processedData.statementSummary.sourceFileName === '-') {
                            setUsageUploadStage('idle');
                            setOcrFailureReason('사용내역서에서 필요한 값을 추출하지 못했습니다.');
                            return;
                        }
                        setDbOverviewUsageRows(processedData.overviewRows);
                        setProject((current) => ({
                            ...current,
                            hasUploads: true,
                            accumulatedAmount: processedData.statementSummary.cumulativeAmount,
                        }));
                        setSelectedMonth(processedData.statementSummary.month);
                        setUsageUploadStage('classifying');
                    } catch {
                        setUsageUploadStage('idle');
                        setAgentFailureTarget('usage-classification');
                    }
                }, 650);
                const classifyTimer = window.setTimeout(() => {
                    try {
                        setArchiveSeed(processedData.archiveSeed);
                        setArchiveUsageItems(processedData.usageItems);
                        writeLocalUsageStatementData(project.id, processedData);
                        setUsageUploadStage('idle');
                        openArchiveView();
                    } catch {
                        setUsageUploadStage('idle');
                        setAgentFailureTarget('usage-classification');
                    }
                }, 1400);
                usageUploadTimersRef.current = [ocrTimer, classifyTimer];
                */
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
            projectInfoDraft.revisionNo,
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
            setStatementOverrides((current) => ({
                ...current,
                [selectedStatement.month]: {
                    revisionNo: Number(projectInfoDraft.revisionNo || '0'),
                },
            }));
            setProjectInfoModalOpen(false);
        } catch (error) {
            setProjectInfoSaveError(error instanceof Error ? error.message : '사용내역서 기본 정보 저장에 실패했습니다.');
        } finally {
            setProjectInfoSaving(false);
        }
    };
    const confirmDeleteProject = async () => {
        if (!canEditManagers || deletingProject)
            return;
        setDeletingProject(true);
        setDeleteError('');
        try {
            await deleteProject(project.id);
            if (typeof window !== 'undefined')
                window.localStorage.removeItem(getLocalUsageStatementKey(project.id));
            setDeleteModalOpen(false);
            router.replace('/projects');
        } catch (error) {
            setDeleteError(error instanceof Error ? error.message : '프로젝트 삭제에 실패했습니다.');
        } finally {
            setDeletingProject(false);
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
    const projectInfoModal = (<ProjectInfoEditorModal open={projectInfoModalOpen} mode="usage" title="사용내역서 기본 정보 수정" subtitle={project.constructionName} draft={projectInfoDraft} error={projectInfoSaveError} saving={projectInfoSaving} onClose={() => setProjectInfoModalOpen(false)} onSave={saveProjectInfo} onChange={(patch) => {
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
    const actionGuideTitle = project.actionRequestDetails?.title || '보완 요청';
    const actionGuideMessage = project.actionRequestDetails?.reason || '';
    const actionGuideRequestedFiles: string[] = [];
    const actionGuideMeta = project.actionRequestDetails
        ? `요청 ${project.actionRequestDetails.requestedAt} · 담당 ${project.actionRequestDetails.assignee}`
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
    const actionGuideModal = canViewActionGuide && project.actionRequestDetails ? (
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
                  {project.actionRequestDetails?.dueDate && <span style={{ fontSize: 11, fontWeight: 900, color: C.g600, background: C.g100, borderRadius: 999, padding: '4px 8px' }}>기한 {project.actionRequestDetails.dueDate}</span>}
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
                <button type="button" onClick={closeActionGuide} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '9px 14px', background: C.white, color: C.g600, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer' }}>닫기</button>
              </div>
            </div>
          </div>
        </Modal>
    ) : null;
    const deleteProjectModal = (
      <Modal open={deleteModalOpen} onClose={deletingProject ? undefined : () => setDeleteModalOpen(false)} zIndex={980} maxWidth={480}>
        <div style={{ background: C.white, borderRadius: 6, border: `1px solid ${C.g200}`, boxShadow: '0 18px 44px rgba(31,55,43,.14)', overflow: 'hidden' }}>
          <div style={{ padding: '20px 22px 12px' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: C.g800, marginBottom: 7 }}>프로젝트 삭제</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.g600, lineHeight: 1.65 }}>
              {project.constructionName || project.name} 프로젝트를 완전히 삭제합니다. 삭제 후에는 프로젝트 목록과 상세 화면에서 더 이상 확인할 수 없습니다.
            </div>
          </div>
          <div style={{ padding: '16px 22px 18px' }}>
            {deleteError && <div style={{ border: `1px solid #FFCDD2`, borderRadius: 6, background: C.dangerBg, color: C.danger, padding: '10px 12px', fontSize: 13, fontWeight: 900, lineHeight: 1.5, marginBottom: 14 }}>{deleteError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setDeleteModalOpen(false)} disabled={deletingProject} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '9px 14px', background: C.white, color: C.g600, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: deletingProject ? 'not-allowed' : 'pointer', opacity: deletingProject ? 0.45 : 1 }}>취소</button>
              <button type="button" onClick={confirmDeleteProject} disabled={deletingProject} style={{ border: 'none', borderRadius: 999, padding: '9px 16px', background: deletingProject ? C.g200 : C.danger, color: deletingProject ? C.g400 : C.white, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: deletingProject ? 'wait' : 'pointer' }}>{deletingProject ? '삭제 중' : '삭제'}</button>
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
            label: workflowStatus === 'review_completed' ? '검토 완료' : workflowStatus === 'supplement_required' ? '보완 요청' : workflowStatus === 'upload_completed' ? '검증 가능' : '대기',
            tone: workflowStatus === 'review_completed' ? 'ok' as const : workflowStatus === 'supplement_required' ? 'danger' as const : workflowStatus === 'upload_completed' ? 'warn' as const : 'idle' as const,
        },
        {
            code: 'RP',
            title: 'Report Agent',
            description: '보고서 초안 생성',
            label: workflowStatus === 'review_completed' || workflowStatus === 'supplement_required' ? '생성 가능' : '대기',
            tone: workflowStatus === 'review_completed' || workflowStatus === 'supplement_required' ? 'ok' as const : 'idle' as const,
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
    const usageStatementInfoRows = [
        ['건설업체명', project.constructionCompany, '공사명', project.constructionName],
        ['소재지', project.location, '대표자', project.representative],
        ['공사금액', `${project.constructionAmount}원`, '공사기간', project.period],
        ['발주자', project.client, '공정률', project.progressRate],
        ['계상된 안전관리비', `${project.plannedAmount}원`, '개정번호', `${selectedStatement.revisionNo}차`],
        ['업로드일', selectedStatement.uploadedAt, '최종수정일', selectedStatement.documentWrittenDate],
    ];
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
    const showUsageStatementHeaderInfo = hasUsageStatement;
    const formatEditableCurrency = (value: string | number) => {
        const numeric = parseCurrencyValue(String(value));
        return numeric > 0 ? numeric.toLocaleString('ko-KR') : '';
    };
    const updateUsageMonthlyAmount = (rowIndex: number, rawValue: string) => {
        const amount = parseCurrencyValue(rawValue);
        const formattedAmount = amount > 0 ? amount.toLocaleString('ko-KR') : '';
        const nextBodyRows = editableUsageRows.map((row, index) => {
            if (index !== rowIndex)
                return row;
            const previousAmount = parseCurrencyValue(row[1]);
            const cumulativeAmount = previousAmount + amount;
            return [row[0], row[1], formattedAmount, cumulativeAmount > 0 ? cumulativeAmount.toLocaleString('ko-KR') : ''] as [string, string, string, string];
        });
        const nextTotal = nextBodyRows.reduce((sum, [, , current]) => sum + parseCurrencyValue(current), 0);
        const previousTotal = nextBodyRows.reduce((sum, [, previous]) => sum + parseCurrencyValue(previous), 0);
        const cumulativeTotal = nextBodyRows.reduce((sum, [, , , cumulative]) => sum + parseCurrencyValue(cumulative), 0);
        setDbUsageStatementsByMonth((current) => {
            const monthKey = selectedStatement.month;
            if (!monthKey)
                return current;
            const currentEntry = current[monthKey];
            return {
                ...current,
                [monthKey]: {
                    archiveSeed: currentEntry?.archiveSeed || archiveSeed || { usage_statement: [], categories: {} },
                    usageItems: currentEntry?.usageItems || archiveUsageItems,
                    overviewRows: [...nextBodyRows, ['계', previousTotal.toLocaleString('ko-KR'), nextTotal.toLocaleString('ko-KR'), cumulativeTotal.toLocaleString('ko-KR')]],
                    statementSummary: currentEntry?.statementSummary || selectedStatement,
                },
            };
        });
        const categoryId = CATS[rowIndex]?.id;
        if (categoryId) {
            setArchiveUsageItems((current) => current.map((item) => item.categoryId === categoryId ? { ...item, amount } : item));
        }
        revertReviewedProjectToDraft();
    };
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
    const usageUploadButton = canUploadEvidence ? (
      <button type="button" onClick={uploadUsageStatementFromOverview} disabled={usageUploadStage !== 'idle'} style={{ height: 40, border: `1px solid ${C.g200}`, borderRadius: 999, padding: '0 18px', background: C.white, color: usageUploadStage === 'idle' ? C.g600 : C.g400, cursor: usageUploadStage === 'idle' ? 'pointer' : 'wait', fontSize: 13, fontWeight: 900, fontFamily: 'inherit', boxShadow: 'none', whiteSpace: 'nowrap' }}>
        {usageUploadStage === 'ocr' ? 'OCR 처리 중' : usageUploadStage === 'classifying' ? '분류 중' : '사용내역서 업로드'}
      </button>
    ) : null;
    const reviewRequestHeaderButton = canUploadEvidence ? (
      <button
        type="button"
        onClick={sendReviewRequest}
        disabled={!selectedMonthHasUploadedStatement}
        style={{
          height: 40,
          border: `1px solid ${!selectedMonthHasUploadedStatement ? C.g200 : C.primary}`,
          borderRadius: 999,
          padding: '0 16px',
          background: !selectedMonthHasUploadedStatement ? C.g100 : C.bg,
          color: !selectedMonthHasUploadedStatement ? C.g400 : C.primary,
          cursor: !selectedMonthHasUploadedStatement ? 'not-allowed' : 'pointer',
          fontSize: 13,
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
      <div style={{ padding: '22px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: C.g800 }}>월별 사용내역서</div>
            <div style={{ marginTop: 5, fontSize: 13, fontWeight: 800, color: C.g400 }}>확인할 월을 선택하거나 새 월을 추가해 주세요.</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
          {monthlyStatements.map((statement) => {
            const uploaded = Boolean(statement.sourceFileName && statement.sourceFileName !== '-');
            const archiveData = dbUsageStatementsByMonth[statement.month];
            const totalAmount = archiveData?.overviewRows?.find(([label]) => label === '계')?.[3] || statement.cumulativeAmount || '0';
            return (
              <button
                key={statement.month}
                type="button"
                onClick={() => selectUsageMonth(statement.month)}
                style={{ position: 'relative', border: `1px solid ${uploaded ? C.light : C.g200}`, borderRadius: 12, background: uploaded ? C.bg : C.white, padding: '16px 16px', minHeight: 128, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 12, boxShadow: '0 8px 18px rgba(31,55,43,.05)' }}
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
                  style={{ position: 'absolute', top: 10, right: 10, width: 22, height: 22, borderRadius: 999, border: `1px solid ${C.g200}`, background: C.white, color: C.g400, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, lineHeight: 1, cursor: 'pointer' }}
                >
                  ×
                </span>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingRight: 24 }}>
                    <div style={{ fontSize: 17, fontWeight: 900, color: C.g800 }}>{statement.label}</div>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: C.g400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {uploaded ? '사용내역서 업로드 완료' : '사용내역서 미업로드'}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'end', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 900, color: C.g400 }}>누계</div>
                    <div style={{ marginTop: 4, fontSize: 15, fontWeight: 900, color: uploaded ? C.primary : C.g600 }}>{totalAmount}원</div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: C.primary }}>보기</div>
                </div>
              </button>
            );
          })}
          <button
            type="button"
            onClick={openMonthCreateModal}
            style={{ border: `1px dashed ${C.light}`, borderRadius: 12, background: 'rgba(255,255,255,.72)', minHeight: 128, cursor: 'pointer', fontFamily: 'inherit', display: 'grid', placeItems: 'center', color: C.primary, boxShadow: '0 8px 18px rgba(31,55,43,.04)' }}
          >
            <span aria-hidden="true" style={{ position: 'relative', width: 38, height: 38, borderRadius: 999, border: `1px solid ${C.primary}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ position: 'absolute', width: 16, height: 2, borderRadius: 999, background: C.primary }} />
              <span style={{ position: 'absolute', width: 2, height: 16, borderRadius: 999, background: C.primary }} />
            </span>
          </button>
        </div>
      </div>
    );
    const tabContent = {
        overview: (<Card style={{ padding: !selectedMonth ? 0 : hasUsageStatement ? '22px 24px' : 0, minWidth: 0, overflow: 'hidden', borderRadius: 6 }}>
        {!selectedMonth ? monthGridContent : !hasUsageStatement ? (
          <div style={{ minHeight: 360, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div style={{ width: 'min(100%, 420px)', border: `1px solid ${C.g200}`, borderRadius: 6, background: C.bg, padding: '34px 28px', textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: C.g800, marginBottom: 9 }}>사용내역서가 없습니다</div>
              {usageUploadButton}
            </div>
          </div>
        ) : <>
        <div data-ui="project-detail.15" style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto auto', alignItems: 'center', gap: 10, marginBottom: 16, minWidth: 0 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <button type="button" onClick={() => setSelectedMonth('')} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '9px 13px', background: C.white, color: C.g600, fontFamily: 'inherit', cursor: 'pointer', fontSize: 13, fontWeight: 900, whiteSpace: 'nowrap', boxShadow: 'none' }}>{selectedStatement.label}</button>
            <div style={{ minWidth: 0, display: 'inline-flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: C.g800, whiteSpace: 'nowrap' }}>사용내역서</div>
              <div style={{ fontSize: 12, color: C.g400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {usageUploadStage === 'ocr' ? 'OCR이 사용내역서 내용을 읽고 있습니다.' : usageUploadStage === 'classifying' ? '세부 항목을 9개 항목으로 분류하고 있습니다.' : usageStatementPage === 0 ? '사용 현황 및 9개 항목 요약' : '세부 내역 및 증빙 파일 보기'}
              </div>
            </div>
          </div>
          <div />
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
            {usageStatementPage === 0 ? (
              <button type="button" onClick={() => setUsageStatementPage(1)} style={{ height: 40, border: 'none', borderRadius: 999, background: C.primary, color: C.white, cursor: 'pointer', fontSize: 13, fontWeight: 900, fontFamily: 'inherit', padding: '0 16px', whiteSpace: 'nowrap', boxShadow: 'none' }}>세부 내역 보기</button>
            ) : (
              <button type="button" onClick={() => setUsageStatementPage(0)} style={{ height: 40, border: 'none', borderRadius: 999, background: C.primary, color: C.white, cursor: 'pointer', fontSize: 13, fontWeight: 900, fontFamily: 'inherit', padding: '0 16px', whiteSpace: 'nowrap', boxShadow: 'none' }}>사용내역서 보기</button>
            )}
          </div>
          <div style={{ display: 'inline-flex', justifyContent: 'flex-end' }}>
            {usageStatementPage === 0 ? usageUploadButton : reviewRequestHeaderButton}
          </div>
        </div>
        {usageStatementPage === 0 ? <>
        <div style={{ border: `1px solid ${C.g200}`, borderRadius: 6, background: '#FCFEFD', padding: '18px 20px', marginBottom: 16 }}>
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
                <div style={{ padding: isTotal ? '10px 12px' : '6px 8px', fontSize: 13, color: C.g800, fontWeight: isTotal ? 900 : 800, textAlign: 'right', borderRight: `1px solid ${C.g200}` }}>
                  {isTotal ? current : (
                    <input
                      aria-label={`${item} 금회 금액`}
                      value={formatEditableCurrency(current)}
                      onChange={(event) => updateUsageMonthlyAmount(index, event.target.value)}
                      inputMode="numeric"
                      style={{ width: '100%', height: 32, border: `1px solid ${C.g200}`, borderRadius: 6, background: C.white, color: C.g800, fontFamily: 'inherit', fontSize: 13, fontWeight: 900, textAlign: 'right', padding: '0 10px', outline: 'none' }}
                    />
                  )}
                </div>
                <div style={{ padding: '10px 12px', fontSize: 13, color: C.g800, fontWeight: isTotal ? 900 : 800, textAlign: 'right' }}>{cumulative}</div>
              </div>);
            })}
        </div>
        </div>
        </> : !selectedMonthHasUploadedStatement ? <>
        <div style={{ minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ width: 'min(100%, 420px)', border: `1px solid ${C.g200}`, borderRadius: 6, background: C.bg, padding: '34px 28px', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: C.g800, marginBottom: 9 }}>{selectedStatement.label} 사용내역서가 아직 업로드되지 않았습니다</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.g400, marginBottom: 16 }}>월은 먼저 표시하고, 사용내역서는 업로드 전 상태로 보여줍니다.</div>
            {usageUploadButton}
          </div>
        </div>
        </> : <>
        <ArchiveScreen projectId={project.id} matchReady={matchReady} uncheckedMatchedFileCount={project.uncheckedMatchedFileCount} onDismissMatchReady={dismissArchiveMatchReady} archiveSeed={archiveSeed} usageItems={archiveUsageItems} actionRequest={canViewActionGuide ? {
                title: actionGuideTitle,
                message: actionGuideMessage,
                dueDate: project.actionRequestDetails?.dueDate,
            } : undefined} onUsageItemsChange={(items) => {
                setArchiveUsageItems(items);
                revertReviewedProjectToDraft();
            }} onFilesUploaded={registerPendingReviewUploads} onArchiveContentMutated={revertReviewedProjectToDraft}/>
        </>}
        </>}
      </Card>),
        validation: (<VerifyScreen key={`validation-${project.id}-${selectedStatement.month}`} projectId={project.id} initialStatus={selectedValidationStatus === 'done' ? 'done' : 'idle'} hideValidationIntro contractName={`${project.name} · ${selectedStatement.label}`} canStartValidation={canStartValidationForCurrentView} onValidationApproved={() => {
                setValidationStatusByMonth((prev) => ({ ...prev, [selectedStatement.month]: 'done' }));
                setProject((current) => applyWorkflowToProject(current, 'review_completed'));
                updateTab('report');
            }} onActionRequested={(details) => {
                setValidationStatusByMonth((prev) => ({ ...prev, [selectedStatement.month]: 'done' }));
                setProject((current) => applyWorkflowToProject(current, 'supplement_required', details));
            }}/>),
        report: (<ReportScreen projectId={project.id} validationComplete={workflowStatus === 'review_completed' || workflowStatus === 'supplement_required' || selectedValidationStatus === 'done'} contractName={`${project.name} · ${selectedStatement.label}`}/>),
    };
    return (<AppFrame title={project.name} mainClassName="project-detail-main">
      <Card style={{ padding: '18px 20px', marginBottom: 14, overflow: 'visible', position: 'relative', zIndex: 20, borderRadius: 6 }}>
        <div data-ui="project-detail.19" style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div data-ui="project-detail.20" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', minWidth: 0 }}>
            <h2 data-ui="project-detail.21" style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', fontSize: 22, fontWeight: 900, color: C.g800, lineHeight: 1.25, margin: 0, minWidth: 240, flex: '1 1 360px' }}>
              <span>{project.constructionName} 계약 정산</span>
              <span style={{ fontSize: 12, fontWeight: 900, color: C.g400, lineHeight: 1, whiteSpace: 'nowrap' }}>{project.contractNumber}</span>
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flex: '1 1 260px', maxWidth: '100%', minWidth: 0, flexWrap: 'wrap' }}>
              {showUsageStatementHeaderInfo && <button type="button" onClick={() => setProjectHeaderOpen((open) => !open)} style={{ flex: '0 0 auto', border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.g600, height: 34, padding: '0 11px', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer', boxShadow: '0 7px 16px rgba(31, 55, 43, .08)' }}>
                <ChevronIcon direction={projectHeaderOpen ? 'up' : 'down'} size={14} />
              </button>}
              {canEditManagers && <button type="button" onClick={openProjectInfoModal} style={{ flex: '0 0 auto', border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.primary, height: 34, padding: '0 13px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer', boxShadow: 'none' }}>기본 정보 수정</button>}
              {canEditManagers && <button type="button" onClick={() => {
                  setDeleteError('');
                  setDeleteModalOpen(true);
              }} style={{ flex: '0 0 auto', border: `1px solid #FFCDD2`, borderRadius: 999, background: C.dangerBg, color: C.danger, height: 34, padding: '0 13px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer', boxShadow: 'none' }}>삭제</button>}
            </div>
          </div>
          {projectHeaderOpen && showUsageStatementHeaderInfo && <div data-ui="project-detail.26" style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 2, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: C.g400 }}>사용내역서 기본 정보</span>
              {canViewActionGuide ? (
                <button type="button" ref={actionRequestBadgeRef} data-ui="project-detail.27" className={shouldPulseActionBadge ? 'action-request-pulse' : undefined} onClick={() => setActionGuideOpen(true)} style={{ border: `1px solid ${STATUS_META[workflowStatus].color}`, fontFamily: 'inherit', fontSize: 12, fontWeight: 800, color: STATUS_META[workflowStatus].color, background: STATUS_META[workflowStatus].bg, borderRadius: 999, padding: '4px 10px', cursor: 'pointer' }}>
                  {STATUS_META[workflowStatus].label}
                </button>
              ) : (
                <span data-ui="project-detail.27" style={{ fontSize: 12, fontWeight: 800, color: STATUS_META[workflowStatus].color, background: STATUS_META[workflowStatus].bg, border: `1px solid ${STATUS_META[workflowStatus].color}`, borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap' }}>
                  {STATUS_META[workflowStatus].label}
                </span>
              )}
              {project.uncheckedMatchedFileCount > 0 && (
                <button type="button" onClick={openArchiveView} style={{ border: `1px solid ${C.light}`, borderRadius: 999, padding: '4px 10px', background: C.bg, color: C.primary, fontSize: 12, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  미확인 매칭 {project.uncheckedMatchedFileCount}건
                </button>
              )}
            </div>
            <div className="thin-x-scroll" style={usageTableScrollStyle}>
              <div data-ui="project-detail.16" style={{ ...usageInfoGridStyle, border: `1px solid ${C.g200}`, borderRadius: 6, overflow: 'hidden', fontSize: 13 }}>
                {usageStatementInfoRows.map(([labelA, valueA, labelB, valueB]) => (<Fragment key={`${labelA}-${labelB}`}>
                  <div data-ui="project-detail.17" style={{ padding: '9px 11px', background: C.g100, color: C.g600, fontWeight: 900, borderRight: `1px solid ${C.g200}`, borderBottom: `1px solid ${C.g200}` }}>{labelA}</div>
                  <div data-ui="project-detail.18" title={valueA} style={{ padding: '9px 11px', color: C.g800, fontWeight: 800, borderRight: `1px solid ${C.g200}`, borderBottom: `1px solid ${C.g200}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{valueA}</div>
                  <div style={{ padding: '9px 11px', background: C.g100, color: C.g600, fontWeight: 900, borderRight: `1px solid ${C.g200}`, borderBottom: `1px solid ${C.g200}` }}>{labelB}</div>
                  <div title={valueB} style={{ padding: '9px 11px', color: C.g800, fontWeight: 800, borderBottom: `1px solid ${C.g200}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{valueB}</div>
                </Fragment>))}
              </div>
            </div>
          </div>}
        </div>
      </Card>
      {actionGuideModal}
      {managerModal}
      {projectInfoModal}
      {monthCreateModal}
      {monthDeleteModal}
      {deleteProjectModal}
      <CenterModal open={Boolean(ocrFailureReason)} title="사용내역서 OCR 실패" body={<div>
        <div style={{ marginBottom: 8 }}>사용내역서를 다시 업로드해주세요.</div>
        <div style={{ border: `1px solid ${C.g200}`, borderRadius: 6, background: C.g100, padding: '10px 12px', color: C.g800 }}>{ocrFailureReason}</div>
      </div>} actionLabel="확인" onAction={() => setOcrFailureReason('')} />
      <CenterModal open={Boolean(agentFailureTarget)} title="처리 실패" body={agentFailureTarget ? getAgentFailureMessage(agentFailureTarget) : ''} actionLabel="확인" onAction={() => setAgentFailureTarget(null)} />

      {selectedMonth && <div data-ui="project-detail.28" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div role="tablist" aria-label="프로젝트 상세 탭" style={{ display: 'flex', alignItems: 'center', gap: 2, flex: '1 1 360px', minWidth: 0, borderBottom: `1px solid ${C.g200}`, overflowX: 'auto' }}>
          {availableTabs.map((tab) => (<button data-ui="project-detail.29" key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => updateTab(tab.id)} style={{ border: 'none', borderBottom: `2px solid ${activeTab === tab.id ? C.primary : 'transparent'}`, background: 'transparent', color: activeTab === tab.id ? C.primary : C.g600, opacity: activeTab === tab.id ? 1 : 0.58, padding: '8px 12px 9px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: activeTab === tab.id ? 900 : 800, whiteSpace: 'nowrap' }}>
              {tab.label}
            </button>))}
        </div>
      </div>}

      <div data-ui="project-detail.31" style={{ minWidth: 0 }}>
        {selectedMonth ? tabContent[activeTab] : tabContent.overview}
      </div>
    </AppFrame>);
}
