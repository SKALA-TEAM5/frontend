'use client';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Card from '../../../components/ui/Card';
import CenterModal from '../../../components/ui/CenterModal';
import Modal from '../../../components/ui/Modal';
import { ChevronIcon } from '../../../components/ui';
import { AppFrame } from '../../../components/common';
import { C } from '../../../lib/theme';
import { EMPTY_PROJECT, getMonthlyUsageStatements, getProjectManagers, STATUS_META, type MonthlyUsageStatementSummary, type ProjectSummary } from '../../../lib/project-data';
import { deleteProject, getProject, listProjectManagerCandidates, markArchiveChecked, replaceProjectAssignees, type ProjectAssignee } from '../../../lib/project-api';
import { getLatestUsageStatementArchive, listProjectFiles } from '../../../lib/archive-api';
import type { BackendUserProfile } from '../../../lib/auth-api';
import { addActionNotification, closeResolvedActionNotificationsForProject, resolveActionRequestNotificationsForProject } from '../../../lib/action-notifications';
import { getAgentFailureMessage, type AgentFailureTarget } from '../../../lib/agent-failure';
import { can } from '../../../lib/permissions';
import { useCurrentUser } from '../../../lib/dev-user';
import ArchiveScreen from '../../../features/project-tab/ArchiveScreen';
import VerifyScreen from '../../../features/project-tab/VerifyScreen';
import { CATS, createEntryFromFile, fmt, type UsageLineItem } from '../../../lib/evidence-utils';
import type { ArchiveSeed, EvidenceFile } from '../../../types/domain';
type DetailTab = 'overview' | 'validation' | 'report' | 'archive';
type UsageUploadStage = 'idle' | 'ocr' | 'classifying';
const TABS: Array<{
    id: DetailTab;
    label: string;
}> = [
    { id: 'overview', label: '사용내역서' },
    { id: 'archive', label: '아카이브' },
    { id: 'validation', label: '유효성 검증' },
    { id: 'report', label: '보고서' },
];
const DETAIL_TABS = new Set<DetailTab>(['overview', 'validation', 'report', 'archive']);
const LOCAL_USAGE_STATEMENT_PREFIX = 'iveri-mvp-usage-statement:';
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
interface MvpUsageStatementArchiveData {
    archiveSeed: ArchiveSeed;
    usageItems: UsageLineItem[];
    overviewRows: Array<[string, string, string, string]>;
    statementSummary: MonthlyUsageStatementSummary;
}
const parseAmount = (value: string) => {
    const numeric = Number(String(value || '').replace(/[^\d]/g, ''));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 8500000000;
};
const formatMonthLabel = (month: string) => {
    const [year, monthNo] = month.split('-');
    return `${year}년 ${Number(monthNo)}월`;
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
    const fallbackMonthlyStatements = useMemo(() => getMonthlyUsageStatements(project.id), [project.id]);
    const latestFallbackStatement = fallbackMonthlyStatements[fallbackMonthlyStatements.length - 1] || EMPTY_USAGE_STATEMENT;
    const headerHistoryItems = [
        project.recentActivity ? {
            date: '-',
            count: 1,
            title: '최근 현황',
            summary: project.recentActivity,
        } : null,
        project.hasUploads ? {
            date: '-',
            count: 1,
            title: '증빙 제출',
            summary: '증빙자료가 등록되어 있습니다.',
        } : null,
        project.hasActionRequest ? {
            date: '-',
            count: 1,
            title: '조치 요청',
            summary: '미처리 조치 요청이 있습니다.',
        } : null,
    ].filter((item): item is { date: string; count: number; title: string; summary: string } => Boolean(item));
    const canUploadEvidence = can(user, 'uploadEvidence');
    const canRunValidation = can(user, 'runValidation');
    const canReviewReport = can(user, 'reviewReport');
    const canRunArchiveTools = canUploadEvidence || canRunValidation;
    const availableTabs = TABS.filter((tab) => {
        if (tab.id === 'validation')
            return canRunValidation;
        if (tab.id === 'report')
            return canReviewReport;
        return true;
    });
    const availableTabIds = new Set(availableTabs.map((tab) => tab.id));
    const requestedTabParam = searchParams.get('tab') as DetailTab | null;
    const requestedTab = requestedTabParam && DETAIL_TABS.has(requestedTabParam) && availableTabIds.has(requestedTabParam) ? requestedTabParam : 'overview';
    const [activeTab, setActiveTab] = useState<DetailTab>(requestedTab);
    const [archiveSeed, setArchiveSeed] = useState<ArchiveSeed | null>(null);
    const [archiveUsageItems, setArchiveUsageItems] = useState<UsageLineItem[]>([]);
    const [dbOverviewUsageRows, setDbOverviewUsageRows] = useState<Array<[string, string, string, string]> | null>(null);
    const [latestDbStatement, setLatestDbStatement] = useState<MonthlyUsageStatementSummary | null>(null);
    const [matchReady, setMatchReady] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(latestFallbackStatement.month);
    const [usageStatementPage, setUsageStatementPage] = useState(0);
    const [usageUploadStage, setUsageUploadStage] = useState<UsageUploadStage>('idle');
    const [validationStatusByMonth, setValidationStatusByMonth] = useState<Record<string, 'idle' | 'running' | 'done'>>({});
    const [selectedHeaderHistoryDate, setSelectedHeaderHistoryDate] = useState('all');
    const [historyDateMenuOpen, setHistoryDateMenuOpen] = useState(false);
    const [monthMenuOpen, setMonthMenuOpen] = useState(false);
    const [projectHeaderOpen, setProjectHeaderOpen] = useState(true);
    const [actionGuideOpen, setActionGuideOpen] = useState(false);
    const [actionCompletionSent, setActionCompletionSent] = useState(false);
    const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
    const [managerModalOpen, setManagerModalOpen] = useState(false);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    const [deletingProject, setDeletingProject] = useState(false);
    const [agentFailureTarget, setAgentFailureTarget] = useState<AgentFailureTarget | null>(null);
    const [ocrFailureReason, setOcrFailureReason] = useState('');
    const [draftManagerIds, setDraftManagerIds] = useState<number[]>([]);
    const [managerSaveError, setManagerSaveError] = useState('');
    const [managerSaving, setManagerSaving] = useState(false);
    const historyDateMenuRef = useRef<HTMLDivElement | null>(null);
    const monthMenuRef = useRef<HTMLDivElement | null>(null);
    const usageUploadTimersRef = useRef<number[]>([]);
    const monthlyStatements = useMemo(() => {
        if (!latestDbStatement)
            return fallbackMonthlyStatements;
        const withoutSameMonth = fallbackMonthlyStatements.filter((statement) => statement.month !== latestDbStatement.month);
        return [...withoutSameMonth, latestDbStatement].toSorted((a, b) => a.month.localeCompare(b.month));
    }, [fallbackMonthlyStatements, latestDbStatement]);
    const latestStatement = monthlyStatements[monthlyStatements.length - 1] || latestFallbackStatement;
    const visibleHeaderHistoryItems = selectedHeaderHistoryDate === 'all'
        ? headerHistoryItems
        : headerHistoryItems.filter((item) => item.date === selectedHeaderHistoryDate);
    const selectedStatement = monthlyStatements.find((statement) => statement.month === selectedMonth) || latestStatement;
    const hasUsageStatement = Boolean(latestDbStatement || archiveSeed?.usage_statement?.length || archiveUsageItems.length || dbOverviewUsageRows);
    const selectedValidationStatus = validationStatusByMonth[selectedStatement.month] || 'idle';
    const canViewActionGuide = user.role === 'project_manager' && project.hasActionRequest;
    const canEditManagers = user.role === 'she_manager';
    const projectManagers = getProjectManagers(project);
    const managerCandidates = managerCandidateProfiles.map((manager) => manager.realName);
    const shouldShowActionBadge = project.hasActionRequest;
    const shouldPulseActionBadge = canViewActionGuide && !actionCompletionSent;
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
        setArchiveSeed(null);
        setArchiveUsageItems([]);
        setDbOverviewUsageRows(null);
        setLatestDbStatement(null);
        setMatchReady(false);
        setActionGuideOpen(user.role === 'project_manager' && project.hasActionRequest);
        setActionCompletionSent(false);
        const localUsageStatementData = readLocalUsageStatementData(project.id);
        if (localUsageStatementData) {
            setArchiveSeed(localUsageStatementData.archiveSeed);
            setArchiveUsageItems(localUsageStatementData.usageItems);
            setDbOverviewUsageRows(localUsageStatementData.overviewRows);
            setLatestDbStatement(localUsageStatementData.statementSummary);
            setProject((current) => ({
                ...current,
                hasUploads: true,
                accumulatedAmount: localUsageStatementData.statementSummary.cumulativeAmount,
            }));
        }
        getLatestUsageStatementArchive(project.id)
            .then((data) => {
                if (!alive || !data)
                    return;
                setArchiveSeed(data.archiveSeed);
                setArchiveUsageItems(data.usageItems);
                setDbOverviewUsageRows(data.overviewRows);
                setLatestDbStatement(data.statementSummary);
                setProject((current) => ({
                    ...current,
                    hasUploads: data.statementSummary.evidenceCount > 0 || Boolean(data.statementSummary.sourceFileName && data.statementSummary.sourceFileName !== '-'),
                    accumulatedAmount: data.statementSummary.cumulativeAmount,
                }));
            })
            .catch(() => {
                if (!alive)
                    return;
                if (!localUsageStatementData)
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
    }, [project.id, project.hasActionRequest, user.role]);
    useEffect(() => () => {
        usageUploadTimersRef.current.forEach((timer) => window.clearTimeout(timer));
        usageUploadTimersRef.current = [];
    }, []);
    useEffect(() => {
        setSelectedMonth(latestStatement.month);
    }, [latestStatement.month]);
    useEffect(() => {
        setUsageStatementPage(0);
    }, [selectedMonth]);
    useEffect(() => {
        setActiveTab(requestedTab);
    }, [requestedTab]);
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
    useEffect(() => {
        if (!monthMenuOpen)
            return;
        const handlePointerDown = (event: PointerEvent) => {
            if (monthMenuRef.current?.contains(event.target as Node))
                return;
            setMonthMenuOpen(false);
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape')
                setMonthMenuOpen(false);
        };
        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [monthMenuOpen]);
    const updateTab = (tab: DetailTab) => {
        if (!availableTabIds.has(tab))
            return;
        setActiveTab(tab);
        router.replace(`/projects/${project.id}?tab=${tab}`);
    };
    const completeActionRequestFromUpload = (uploadedFiles: EvidenceFile[], context?: { categoryName: string; itemName: string }) => {
        if (!canViewActionGuide || actionCompletionSent || !uploadedFiles.length)
            return;
        const fileNames = uploadedFiles.map((file) => file.name);
        const uploadTargetName = context?.itemName || context?.categoryName || '보완 자료';
        addActionNotification({
            projectId: project.id,
            projectName: project.name,
            categoryName: uploadTargetName,
            title: `새로운 파일 ${uploadedFiles.length}건 업로드`,
            message: `${user.name} 담당자가 ${project.name}의 ${uploadTargetName} 항목에 새 파일 ${uploadedFiles.length}건을 업로드했습니다.`,
            requestedFiles: fileNames,
            senderName: user.name,
            recipientRole: 'she_manager',
            type: 'new_upload',
        });
        resolveActionRequestNotificationsForProject(project.id);
        setProject((current) => ({
            ...current,
            hasUploads: true,
            hasActionRequest: false,
            actionRequestDetails: current.actionRequestDetails ? { ...current.actionRequestDetails, statusCode: 'resolved' } : current.actionRequestDetails,
        }));
        setActionCompletionSent(true);
    };
    const sendNewUploadNotification = (uploadedFiles: EvidenceFile[], context?: { categoryName: string; itemName: string }) => {
        if (user.role !== 'project_manager' || !uploadedFiles.length)
            return;
        if (canViewActionGuide && !actionCompletionSent) {
            completeActionRequestFromUpload(uploadedFiles, context);
            return;
        }
        const fileNames = uploadedFiles.map((file) => file.name);
        const uploadTargetName = context?.itemName || context?.categoryName || '새 업로드';
        addActionNotification({
            projectId: project.id,
            projectName: project.name,
            categoryName: uploadTargetName,
            title: `새로운 파일 ${uploadedFiles.length}건 업로드`,
            message: `${user.name} 담당자가 ${project.name}의 ${uploadTargetName} 항목에 새 파일 ${uploadedFiles.length}건을 업로드했습니다.`,
            requestedFiles: fileNames,
            senderName: user.name,
            recipientRole: 'she_manager',
            type: 'new_upload',
        });
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
                const usageStatementEntry = createEntryFromFile(pickedFile, 'usage_statement', { categoryIds: [], usageItemIds: [] });
                const processedData = buildMvpUsageStatementArchiveData(project, usageStatementEntry, user.name);
                setUsageUploadStage('ocr');
                setUsageStatementPage(0);
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
                        updateTab('archive');
                    } catch {
                        setUsageUploadStage('idle');
                        setAgentFailureTarget('usage-classification');
                    }
                }, 1400);
                usageUploadTimersRef.current = [ocrTimer, classifyTimer];
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
    const actionGuideModal = canViewActionGuide && project.actionRequestDetails ? (
        <Modal open={actionGuideOpen} onClose={() => setActionGuideOpen(false)} zIndex={960} maxWidth={680}>
          <div style={{ background: C.white, borderRadius: 6, border: `1px solid ${C.g200}`, boxShadow: '0 18px 44px rgba(0,0,0,.16)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 22px 16px', borderBottom: `1px solid ${C.g100}`, display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 900, color: C.danger }}>부족한 서류 안내</span>
                  <span style={{ fontSize: 11, fontWeight: 900, color: C.g600, background: C.g100, borderRadius: 999, padding: '4px 8px' }}>기한 {project.actionRequestDetails.dueDate}</span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, color: C.g800, lineHeight: 1.35 }}>{project.actionRequestDetails.title}</div>
                <div style={{ fontSize: 12, color: C.g400, fontWeight: 900, marginTop: 6 }}>요청 {project.actionRequestDetails.requestedAt} · 담당 {project.actionRequestDetails.assignee}</div>
              </div>
              <button type="button" aria-label="부족한 서류 안내 닫기" onClick={() => setActionGuideOpen(false)} style={{ border: 'none', background: 'transparent', color: C.g400, cursor: 'pointer', fontSize: 24, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: '18px 22px 20px' }}>
              <div style={{ fontSize: 13, color: C.g600, lineHeight: 1.7, marginBottom: 14 }}>{project.actionRequestDetails.reason}</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                <button type="button" onClick={() => setActionGuideOpen(false)} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '9px 14px', background: C.white, color: C.g600, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer' }}>닫기</button>
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
    const historyCard = (<section data-ui="project-detail.40" style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ width: '100%', color: C.g800, fontFamily: 'inherit', padding: '8px 4px', display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-start', gap: 4 }}>
        <span data-ui="project-detail.1" style={{ fontSize: 14, color: C.g800, fontWeight: 900 }}>최근 이력</span>
      </div>
      <div data-ui="project-detail.41" style={{ marginTop: 6, minHeight: 0, display: 'flex', flexDirection: 'column', flex: '1 1 auto' }}>
      <div data-ui="project-detail.2" style={{ display: 'grid', gridTemplateColumns: 'auto 92px', gap: 6, alignItems: 'center', marginBottom: 8 }}>
        <button data-ui="project-detail.3" onClick={() => {
            setSelectedHeaderHistoryDate('all');
            setHistoryDateMenuOpen(false);
        }} style={{ border: 'none', borderRadius: 999, padding: '6px 10px', fontSize: 12, fontWeight: 900, color: selectedHeaderHistoryDate === 'all' ? C.white : C.g600, background: selectedHeaderHistoryDate === 'all' ? C.primary : C.g100, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>전체 날짜</button>
        
        <div data-ui="project-detail.4" ref={historyDateMenuRef} style={{ position: 'relative', minWidth: 0 }}>
          <button data-ui="project-detail.5" type="button" onClick={() => setHistoryDateMenuOpen((open) => !open)} style={{ width: '100%', border: `1px solid ${C.g200}`, borderRadius: 999, padding: '6px 9px', fontSize: 12, fontWeight: 900, color: selectedHeaderHistoryDate === 'all' ? C.g400 : C.primary, background: C.white, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {selectedHeaderHistoryDate === 'all' ? '날짜 선택' : selectedHeaderHistoryDate}
          </button>
          {historyDateMenuOpen && (<div data-ui="project-detail.6" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 30, background: C.white, border: `1px solid ${C.g200}`, borderRadius: 6, boxShadow: '0 8px 20px rgba(27,94,59,.14)', padding: 4 }}>
              {headerHistoryItems.map((item) => (<button data-ui="project-detail.7" key={item.date} type="button" onClick={() => {
                    setSelectedHeaderHistoryDate(item.date);
                    setHistoryDateMenuOpen(false);
                }} style={{ width: '100%', border: 'none', background: selectedHeaderHistoryDate === item.date ? C.bg : 'transparent', color: selectedHeaderHistoryDate === item.date ? C.primary : C.g600, borderRadius: 6, padding: '7px 8px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 900, textAlign: 'center' }}>
                  {item.date}
                </button>))}
            </div>)}
        </div>
      </div>
      <div data-ui="project-detail.8" style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '1 1 auto', minHeight: 0, overflowY: 'auto' }}>
        {visibleHeaderHistoryItems.map((item) => (<div data-ui="project-detail.9" key={`${item.date}-${item.title}`} style={{ padding: '11px 12px', borderRadius: 6, background: C.g100, border: `1px solid ${C.g200}` }}>
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
    const overviewUsageRows = dbOverviewUsageRows || [...CATS.map((cat) => [`${cat.id}. ${cat.label}`, '-', '-', '-'] as [string, string, string, string]), ['계', '-', '-', '-'] as [string, string, string, string]];
    const usageDetailPageSize = 5;
    const usageDetailPages = Array.from({ length: Math.ceil(archiveUsageItems.length / usageDetailPageSize) }, (_, index) => archiveUsageItems.slice(index * usageDetailPageSize, (index + 1) * usageDetailPageSize));
    const usageStatementPageCount = 1 + usageDetailPages.length;
    const selectedUsageDetailPage = usageDetailPages[usageStatementPage - 1] || [];
    const usageInfoGridStyle = { display: 'grid', gridTemplateColumns: '120px minmax(170px, 1fr) 120px minmax(170px, 1fr)', minWidth: 620 } as const;
    const usageSummaryGridStyle = { display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) 130px 130px 130px', minWidth: 650 } as const;
    const usageDetailGridStyle = { display: 'grid', gridTemplateColumns: '64px minmax(220px, 1fr) minmax(180px, .75fr) 130px', minWidth: 594 } as const;
    const usageTableScrollStyle = { width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'auto', overflowY: 'hidden' } as const;
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
      <button type="button" onClick={uploadUsageStatementFromOverview} disabled={usageUploadStage !== 'idle'} style={{ height: 40, border: 'none', borderRadius: 999, padding: '0 18px', background: usageUploadStage === 'idle' ? C.primary : C.g200, color: usageUploadStage === 'idle' ? C.white : C.g400, cursor: usageUploadStage === 'idle' ? 'pointer' : 'wait', fontSize: 13, fontWeight: 900, fontFamily: 'inherit', boxShadow: 'none', whiteSpace: 'nowrap' }}>
        {usageUploadStage === 'ocr' ? 'OCR 처리 중' : usageUploadStage === 'classifying' ? '분류 중' : '사용내역서 업로드'}
      </button>
    ) : null;
    const tabContent = {
        overview: (<Card style={{ padding: hasUsageStatement ? '22px 24px' : 0, minWidth: 0, overflow: 'hidden', borderRadius: 6 }}>
        {!hasUsageStatement ? (
          <div style={{ minHeight: 360, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div style={{ width: 'min(100%, 420px)', border: `1px solid ${C.g200}`, borderRadius: 6, background: C.bg, padding: '34px 28px', textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: C.g800, marginBottom: 9 }}>사용내역서가 없습니다</div>
              {usageUploadButton}
            </div>
          </div>
        ) : <>
        <div data-ui="project-detail.15" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap', minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: C.g800 }}>{selectedStatement.label} 사용내역서</div>
            <div style={{ fontSize: 12, color: C.g400, marginTop: 4 }}>
              {usageUploadStage === 'ocr' ? 'OCR이 사용내역서 내용을 읽고 있습니다.' : usageUploadStage === 'classifying' ? '세부 항목을 9개 항목으로 분류하고 있습니다.' : usageStatementPage === 0 ? '1페이지 · 기본 정보 및 9개 항목 요약' : `${usageStatementPage + 1}페이지 · 세부 사용내역 항목`}
            </div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 'auto' }}>
            {!hasUsageStatement && usageUploadButton}
            <button type="button" onClick={() => setUsageStatementPage((page) => Math.max(0, page - 1))} disabled={usageStatementPage === 0} style={{ width: 34, height: 34, border: `1px solid ${C.g200}`, borderRadius: 6, background: C.white, color: usageStatementPage === 0 ? C.g400 : C.g800, cursor: usageStatementPage === 0 ? 'not-allowed' : 'pointer', fontSize: 18, fontWeight: 900, fontFamily: 'inherit' }}>{'<'}</button>
            <span style={{ minWidth: 58, textAlign: 'center', fontSize: 12, fontWeight: 900, color: C.g600 }}>{usageStatementPage + 1} / {usageStatementPageCount}</span>
            <button type="button" onClick={() => setUsageStatementPage((page) => Math.min(usageStatementPageCount - 1, page + 1))} disabled={usageStatementPage >= usageStatementPageCount - 1} style={{ width: 34, height: 34, border: `1px solid ${C.g200}`, borderRadius: 6, background: C.white, color: usageStatementPage >= usageStatementPageCount - 1 ? C.g400 : C.g800, cursor: usageStatementPage >= usageStatementPageCount - 1 ? 'not-allowed' : 'pointer', fontSize: 18, fontWeight: 900, fontFamily: 'inherit' }}>{'>'}</button>
          </div>
        </div>
        {usageStatementPage === 0 ? <>
        <div className="thin-x-scroll" style={{ ...usageTableScrollStyle, marginBottom: 16 }}>
        <div data-ui="project-detail.16" style={{ ...usageInfoGridStyle, border: `1px solid ${C.g200}`, borderRadius: 6, overflow: 'hidden', fontSize: 13 }}>
          {[
                ['건설업체명', project.constructionCompany, '공사명', project.constructionName],
                ['소재지', project.location, '대표자', project.representative],
                ['공사금액', `${project.constructionAmount}원`, '공사기간', project.period],
                ['발주자', project.client, '공정률', project.progressRate],
                ['계상된 안전관리비', `${project.plannedAmount}원`, '사용률', project.usageRate],
                ['원본파일', selectedStatement.sourceFileName, '개정번호', `${selectedStatement.revisionNo}차`],
                ['업로드일', selectedStatement.uploadedAt, '업로드 담당자', selectedStatement.uploadedBy],
                ['문서작성일', selectedStatement.documentWrittenDate, '검증상태', selectedStatement.validationStatus],
                ['증빙 파일', `${selectedStatement.evidenceCount}개`, '이슈 항목', `${selectedStatement.issueCount}건`],
            ].map(([labelA, valueA, labelB, valueB]) => (<Fragment key={`${labelA}-${labelB}`}>
              <div data-ui="project-detail.17" style={{ padding: '9px 11px', background: C.g100, color: C.g600, fontWeight: 900, borderRight: `1px solid ${C.g200}`, borderBottom: `1px solid ${C.g200}` }}>{labelA}</div>
              <div data-ui="project-detail.18" title={valueA} style={{ padding: '9px 11px', color: C.g800, fontWeight: 800, borderRight: `1px solid ${C.g200}`, borderBottom: `1px solid ${C.g200}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{valueA}</div>
              <div style={{ padding: '9px 11px', background: C.g100, color: C.g600, fontWeight: 900, borderRight: `1px solid ${C.g200}`, borderBottom: `1px solid ${C.g200}` }}>{labelB}</div>
              <div title={valueB} style={{ padding: '9px 11px', color: C.g800, fontWeight: 800, borderBottom: `1px solid ${C.g200}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{valueB}</div>
            </Fragment>))}
        </div>
        </div>
        <div className="thin-x-scroll" style={usageTableScrollStyle}>
        <div style={{ border: `1px solid ${C.g200}`, borderRadius: 6, overflow: 'hidden', minWidth: usageSummaryGridStyle.minWidth }}>
          <div style={{ ...usageSummaryGridStyle, background: C.g100, borderBottom: `1px solid ${C.g200}` }}>
            {['항목', '전회', '금회', '누계'].map((head) => <div key={head} style={{ padding: '10px 12px', fontSize: 13, color: C.g600, fontWeight: 900, textAlign: head === '항목' ? 'left' : 'right', borderRight: head === '누계' ? 'none' : `1px solid ${C.g200}` }}>{head}</div>)}
          </div>
          {overviewUsageRows.map(([item, previous, current, cumulative], index) => {
                const isTotal = item === '계';
                return (<div key={item} style={{ ...usageSummaryGridStyle, background: isTotal ? C.g100 : C.white, borderBottom: index === overviewUsageRows.length - 1 ? 'none' : `1px solid ${C.g200}` }}>
                <div style={{ padding: '10px 12px', fontSize: 13, color: C.g800, fontWeight: isTotal ? 900 : 800, borderRight: `1px solid ${C.g200}` }}>{item}</div>
                {[previous, current, cumulative].map((amount, amountIndex) => <div key={`${item}-${amountIndex}`} style={{ padding: '10px 12px', fontSize: 13, color: C.g800, fontWeight: isTotal ? 900 : 800, textAlign: 'right', borderRight: amountIndex === 2 ? 'none' : `1px solid ${C.g200}` }}>{amount}</div>)}
              </div>);
            })}
        </div>
        </div>
        </> : <>
        <div className="thin-x-scroll" style={usageTableScrollStyle}>
        <div style={{ border: `1px solid ${C.g200}`, borderRadius: 6, overflow: 'hidden', minWidth: usageDetailGridStyle.minWidth }}>
          <div style={{ ...usageDetailGridStyle, background: C.g100, borderBottom: `1px solid ${C.g200}` }}>
            {['번호', '세부 항목', '9개 항목', '금액'].map((head) => <div key={head} style={{ padding: '10px 12px', fontSize: 13, color: C.g600, fontWeight: 900, textAlign: head === '금액' ? 'right' : 'left', borderRight: head === '금액' ? 'none' : `1px solid ${C.g200}` }}>{head}</div>)}
          </div>
          {selectedUsageDetailPage.map((line, index) => {
            const absoluteIndex = (usageStatementPage - 1) * usageDetailPageSize + index + 1;
            const category = CATS.find((cat) => cat.id === line.categoryId);
            return <div key={line.id} style={{ ...usageDetailGridStyle, borderBottom: index === selectedUsageDetailPage.length - 1 ? 'none' : `1px solid ${C.g200}` }}>
              <div style={{ padding: '10px 12px', fontSize: 13, color: C.g600, fontWeight: 800, borderRight: `1px solid ${C.g200}` }}>{absoluteIndex}</div>
              <div title={line.name} style={{ padding: '10px 12px', fontSize: 13, color: C.g800, fontWeight: 900, borderRight: `1px solid ${C.g200}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{line.name}</div>
              <div title={category?.label || ''} style={{ padding: '10px 12px', fontSize: 13, color: C.g600, fontWeight: 800, borderRight: `1px solid ${C.g200}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{category?.label || '-'}</div>
              <div style={{ padding: '10px 12px', fontSize: 13, color: C.g800, fontWeight: 900, textAlign: 'right' }}>{fmt(line.amount)}</div>
            </div>;
          })}
        </div>
        </div>
        </>}
        </>}
      </Card>),
        validation: (<VerifyScreen projectId={project.id} initialTab="dashboard" initialStatus={selectedValidationStatus === 'done' ? 'done' : 'idle'} hideValidationIntro contractName={`${project.name} · ${selectedStatement.label}`} onValidationApproved={() => {
                setValidationStatusByMonth((prev) => ({ ...prev, [selectedStatement.month]: 'done' }));
                closeResolvedActionNotificationsForProject(project.id);
                updateTab('report');
            }}/>),
        report: (<VerifyScreen projectId={project.id} initialTab="report" initialStatus="done" contractName={`${project.name} · ${selectedStatement.label}`}/>),
        archive: (<ArchiveScreen projectId={project.id} matchReady={matchReady} uncheckedMatchedFileCount={project.uncheckedMatchedFileCount} onDismissMatchReady={dismissArchiveMatchReady} archiveSeed={archiveSeed} usageItems={archiveUsageItems} canRunArchiveTools={canRunArchiveTools} onFilesUploaded={sendNewUploadNotification}/>),
    };
    return (<AppFrame title={project.name} mainClassName={`project-detail-main-with-history${rightSidebarOpen ? '' : ' project-detail-main-right-closed'}`}>
      <Card style={{ padding: '18px 20px', marginBottom: 14, overflow: 'visible', position: 'relative', zIndex: 20, borderRadius: 6 }}>
        <div data-ui="project-detail.19" style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div data-ui="project-detail.20" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', minWidth: 0 }}>
            <h2 data-ui="project-detail.21" style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', fontSize: 22, fontWeight: 900, color: C.g800, lineHeight: 1.25, margin: 0, minWidth: 240, flex: '1 1 360px' }}>
              <span>{project.constructionName} 계약 정산</span>
              <span style={{ fontSize: 12, fontWeight: 900, color: C.g400, lineHeight: 1, whiteSpace: 'nowrap' }}>{project.contractNumber}</span>
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flex: '1 1 260px', maxWidth: '100%', minWidth: 0, flexWrap: 'wrap' }}>
              <div data-ui="project-detail.22" ref={monthMenuRef} style={{ position: 'relative', flex: '0 0 142px', maxWidth: '100%', minWidth: 0 }}>
                <button data-ui="project-detail.23" type="button" onClick={() => setMonthMenuOpen((open) => !open)} style={{ width: '100%', border: `1px solid ${C.g200}`, borderRadius: 999, padding: '9px 13px', background: C.white, color: C.g600, fontFamily: 'inherit', cursor: 'pointer', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 16px', alignItems: 'center', gap: 8, textAlign: 'left', boxShadow: '0 7px 16px rgba(31, 55, 43, .08)' }}>
                  <span style={{ minWidth: 0, fontSize: 13, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedStatement.label}</span>
                  <span aria-hidden="true" style={{ color: C.g400, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ChevronIcon direction={monthMenuOpen ? 'up' : 'down'} size={16} />
                  </span>
                </button>
                {monthMenuOpen && (<div data-ui="project-detail.24" style={{ position: 'absolute', top: 'calc(100% + 7px)', right: 0, zIndex: 80, width: 142, maxWidth: 'calc(100vw - 40px)', maxHeight: 260, overflowY: 'auto', background: C.white, border: `1px solid ${C.g200}`, borderRadius: 6, padding: 6, boxShadow: '0 10px 22px rgba(31,55,43,.10)', scrollbarWidth: 'thin' }}>
                  {monthlyStatements.map((statement) => {
                      const active = selectedStatement.month === statement.month;
                      return (<button data-ui="project-detail.25" key={statement.month} type="button" onClick={() => {
                              setSelectedMonth(statement.month);
                              setMonthMenuOpen(false);
                          }} style={{ width: '100%', border: 'none', borderRadius: 6, padding: '9px 10px', background: active ? C.bg : 'transparent', color: active ? C.primary : C.g600, cursor: 'pointer', fontFamily: 'inherit', display: 'block', textAlign: 'left' }}>
                        <span style={{ fontSize: 13, fontWeight: 900, whiteSpace: 'nowrap' }}>{statement.label}</span>
                      </button>);
                  })}
                </div>)}
              </div>
              <button type="button" onClick={() => setProjectHeaderOpen((open) => !open)} style={{ flex: '0 0 auto', border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.g600, height: 34, padding: '0 11px', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer', boxShadow: '0 7px 16px rgba(31, 55, 43, .08)' }}>
                <ChevronIcon direction={projectHeaderOpen ? 'up' : 'down'} size={14} />
              </button>
              {canEditManagers && <button type="button" onClick={() => {
                  setDeleteError('');
                  setDeleteModalOpen(true);
              }} style={{ flex: '0 0 auto', border: `1px solid #FFCDD2`, borderRadius: 999, background: C.dangerBg, color: C.danger, height: 34, padding: '0 13px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer', boxShadow: 'none' }}>삭제</button>}
            </div>
          </div>
          {projectHeaderOpen && <div data-ui="project-detail.26" style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 2, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: C.g400 }}>프로젝트 기본 정보</span>
              {shouldShowActionBadge && (canViewActionGuide ? (
                <button type="button" data-ui="project-detail.27" className={shouldPulseActionBadge ? 'action-request-pulse' : undefined} onClick={() => setActionGuideOpen(true)} style={{ border: 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, color: STATUS_META.action_required.color, background: STATUS_META.action_required.bg, borderRadius: 999, padding: '4px 10px', cursor: 'pointer' }}>
                  조치 요청
                </button>
              ) : (
                <span data-ui="project-detail.27" style={{ fontSize: 12, fontWeight: 800, color: STATUS_META.action_required.color, background: STATUS_META.action_required.bg, borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap' }}>
                  조치 요청
                </span>
              ))}
              {project.uncheckedMatchedFileCount > 0 && (
                <button type="button" onClick={() => updateTab('archive')} style={{ border: `1px solid ${C.light}`, borderRadius: 999, padding: '4px 10px', background: C.bg, color: C.primary, fontSize: 12, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  미확인 매칭 {project.uncheckedMatchedFileCount}건
                </button>
              )}
            </div>
            {projectInfoGrid}
          </div>}
        </div>
      </Card>
      {actionGuideModal}
      {managerModal}
      {deleteProjectModal}
      <CenterModal open={Boolean(ocrFailureReason)} title="사용내역서 OCR 실패" body={<div>
        <div style={{ marginBottom: 8 }}>사용내역서를 다시 업로드해주세요.</div>
        <div style={{ border: `1px solid ${C.g200}`, borderRadius: 6, background: C.g100, padding: '10px 12px', color: C.g800 }}>{ocrFailureReason}</div>
      </div>} actionLabel="확인" onAction={() => setOcrFailureReason('')} />
      <CenterModal open={Boolean(agentFailureTarget)} title="처리 실패" body={agentFailureTarget ? getAgentFailureMessage(agentFailureTarget) : ''} actionLabel="확인" onAction={() => setAgentFailureTarget(null)} />

      <div data-ui="project-detail.28" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div role="tablist" aria-label="프로젝트 상세 탭" style={{ display: 'flex', alignItems: 'center', gap: 2, flex: '1 1 360px', minWidth: 0, borderBottom: `1px solid ${C.g200}`, overflowX: 'auto' }}>
          {availableTabs.map((tab) => (<button data-ui="project-detail.29" key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => updateTab(tab.id)} style={{ border: 'none', borderBottom: `2px solid ${activeTab === tab.id ? C.primary : 'transparent'}`, background: 'transparent', color: activeTab === tab.id ? C.primary : C.g600, opacity: activeTab === tab.id ? 1 : 0.58, padding: '8px 12px 9px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: activeTab === tab.id ? 900 : 800, whiteSpace: 'nowrap' }}>
              {tab.label}
            </button>))}
        </div>
      </div>

      <div data-ui="project-detail.31" style={{ minWidth: 0 }}>
        {tabContent[activeTab]}
      </div>
      <button type="button" aria-label={rightSidebarOpen ? '우측 사이드바 닫기' : '우측 사이드바 열기'} onClick={() => setRightSidebarOpen((open) => !open)} className="project-detail-right-toggle" style={{ right: rightSidebarOpen ? 205 : 10 }}>
        <ChevronIcon direction={rightSidebarOpen ? 'right' : 'left'} size={17} color={C.primary}/>
      </button>
      <aside data-ui="project-detail.32" className={rightSidebarOpen ? 'project-detail-sidebar' : 'project-detail-sidebar project-detail-sidebar-closed'}>
        <div data-ui="project-detail.38" className="project-detail-side-stack">
          {historyCard}
        </div>
      </aside>
    </AppFrame>);
}
