import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Card from '../../components/ui/Card';
import CenterModal from '../../components/ui/CenterModal';
import InlineLoader from '../../components/ui/InlineLoader';
import Modal from '../../components/ui/Modal';
import { C } from '../../lib/theme';
import { getAgentFailureMessage, type AgentFailureTarget } from '../../lib/agent-failure';
import { CATS, USAGE_LINE_ITEMS, calculateUsageLineAmount, createDefaultArchiveData, createEntryFromFile, normalizeArchiveData, parseUsageNumber, type UsageLineItem } from '../../lib/evidence-utils';
import UsageDetailFileView, { type HierarchyEvidenceKind } from './UsageDetailFileView';
import { changeUsageStatementItemCategory, createUsageStatementItem, deleteEvidenceFileLink, deleteProjectFile, deleteUsageStatementItem, getProjectFileDownloadUrl, getProjectFilePreviewUrl, linkEvidenceFile, moveEvidenceFileLink, updateUsageStatementItem, uploadEvidenceFileToItem, type SafetyDocAgentRequiredEvidenceMap } from '../../lib/archive-api';
import { getOrchestratorStatus, listSafeLeeEvidenceRequirements, parseAndMatchEvidenceWithOcr, runEvidenceReviewAgent, safeLeeRequirementsToMap, type OrchestratorTodo } from '../../lib/agent-api';
import { ApiClientError } from '../../lib/api-client';
import type { ArchiveSeed, EvidenceCategory, EvidenceFile, FolderEvidenceCategory } from '../../types/domain';
type UsageDetailValidationStatus = 'idle' | 'running' | 'done';
interface UsageStatementDetailScreenProps {
    projectId: string;
    usageStatementId?: number;
    usageDetailSeed: ArchiveSeed | null;
    usageItems?: UsageLineItem[];
    onUsageItemsChange?: (items: UsageLineItem[]) => void;
    onUsageDetailSeedChange?: (seed: ArchiveSeed) => void;
    onFilesUploaded?: (files: EvidenceFile[], context?: { categoryName: string; itemName: string }) => void;
    onUsageDetailContentMutated?: (mutation: 'upload' | 'delete' | 'move' | 'rename' | 'add-item' | 'edit-item' | 'delete-item') => void;
    actionRequest?: { title: string; message: string; dueDate?: string };
    contentVisible?: boolean;
    todoStorageKey?: string;
    clearTodoSignal?: number;
    onTodoCountChange?: (count: number) => void;
    onBackToOverview?: () => void;
    uploadCompleteAction?: ReactNode;
}
type UsageDetailTodoSource = 'matching' | 'vision' | 'law';
type UsageDetailTodoItem = {
    id: string;
    mode: 'add' | 'remove';
    source: UsageDetailTodoSource;
    kind: FolderEvidenceCategory;
    title: string;
    context: string;
    categoryId?: number;
    usageItemId?: string;
    detail?: string;
};

const toOrchestratorTodo = (todo: OrchestratorTodo, usageItems: UsageLineItem[]): UsageDetailTodoItem | null => {
    const usageItem = todo.usageStatementItemId == null
        ? undefined
        : usageItems.find((item) => String(item.id) === String(todo.usageStatementItemId));
    const reason = todo.reason || '보완 사항 확인 필요';
    const kind = todo.agentTypeCode === 'vision' ? 'site_photo' : inferEvidenceKindFromText(reason);
    return {
        id: `orchestrator:${todo.agentTypeCode}:${todo.usageStatementItemId || 'all'}:${todo.fileId || 'none'}:${normalizeTodoIdText(reason)}`,
        mode: 'add',
        source: todo.agentTypeCode === 'legal' ? 'law' : todo.agentTypeCode === 'vision' ? 'vision' : 'matching',
        kind,
        title: EVIDENCE_KIND_LABELS[kind] || '보완 요청',
        context: usageItem?.name || '사용내역서 세부 항목',
        categoryId: usageItem?.categoryId,
        usageItemId: usageItem?.id,
        detail: toNounPhraseDetail(reason),
    };
};
type AddUsageItemDraft = {
    name: string;
    date: string;
    unit: string;
    quantity: string;
    unitPrice: string;
};
type ClassificationMoveNotice = {
    id: string;
    itemName: string;
    fromCategoryName: string;
    toCategoryName: string;
    reason?: string;
};
const EVIDENCE_KIND_LABELS: Record<FolderEvidenceCategory, string> = {
    receipt: '영수증',
    site_photo: '현장사진',
    tax_invoice: '세금계산서',
    other_document: '기타 자료',
};
const EVIDENCE_SECTIONS: Array<{ id: FolderEvidenceCategory; label: string }> = [
    { id: 'receipt', label: '영수증' },
    { id: 'site_photo', label: '사진' },
    { id: 'tax_invoice', label: '세금계산서' },
    { id: 'other_document', label: '기타' },
];

const addUsageItemInputStyle = {
    height: 42,
    minWidth: 0,
    width: '100%',
    boxSizing: 'border-box',
    border: `1px solid ${C.g200}`,
    borderRadius: 6,
    background: C.white,
    color: C.g800,
    fontFamily: 'inherit',
    fontSize: 14,
    fontWeight: 800,
    padding: '0 12px',
    outline: 'none',
} as const;
const cleanEvidenceTodoText = (value: string) => value
    .replace(/^.*?문제가\s*있습니다[.,]?\s*/u, '')
    .replace(/^.*?부족\s*문제가\s*있습니다[.,]?\s*/u, '')
    .replace(/^.*?부족\s*문제.*?[.,]?\s*/u, '')
    .replace(/(?:자료|서류|증빙)?(?:를|을)?\s*(?:추가\s*)?제출(?:해)?\s*주세요\.?$/u, '')
    .replace(/\s*추가$/u, '')
    .replace(/(?:자료|서류|증빙)\s*$/u, '')
    .trim();
const extractActionRequestEvidenceNames = (message?: string) => {
    if (!message)
        return [];
    const sentences = message
        .split(/[.。]\s*/)
        .map((sentence) => sentence.trim())
        .filter(Boolean);
    const requestSentence = [...sentences].reverse().find((sentence) => /제출|추가/.test(sentence)) || sentences.find((sentence) => /자료|서류/.test(sentence)) || message;
    const cleaned = cleanEvidenceTodoText(requestSentence);
    if (!cleaned || cleaned === message.trim())
        return [];
    return Array.from(new Set(cleaned.split(/\s*(?:,|\/|·| 및 |와 |과 )\s*/).map((name) => cleanEvidenceTodoText(name)).filter(Boolean)));
};
const normalizeTodoIdText = (value: string) => value.replace(/\s+/g, '').toLowerCase();
const inferEvidenceKindFromText = (value: string): FolderEvidenceCategory => {
    if (/영수증|결제|거래명세|카드|입금|계좌|송금/.test(value))
        return 'receipt';
    if (/사진|현장|착용|설치\s*전후|설치\s*상세/.test(value))
        return 'site_photo';
    if (/세금|계산서|전자세금/.test(value))
        return 'tax_invoice';
    return 'other_document';
};
const getCategoryDisplayName = (categoryId: number) => CATS.find((cat) => cat.id === categoryId)?.short || `${categoryId}번 항목`;

const classifyUsageLineCategory = (name: string, fallbackCategoryId: number) => {
    const text = name.replace(/\s+/g, '').toLowerCase();
    const rules: Array<[number, RegExp]> = [
        [8, /본사|전담조직/],
        [7, /기술지도|재해예방전문지도|지도기관/],
        [6, /건강|검진|작업환경|측정|방진|질병|장해예방/],
        [5, /교육|강의|이수|훈련|교재/],
        [4, /진단|컨설팅|위험진단|안전보건진단/],
        [3, /보호구|안전모|안전화|안전벨트|장갑|마스크|조끼|개인보호/],
        [2, /안전시설|난간|비계|안전망|표지|방호|펜스|발판|가설/],
        [1, /관리자|임금|급여|인건비|보건관리|안전관리자/],
        [9, /위험성평가|평가|소요비용/],
    ];
    return rules.find(([, pattern]) => pattern.test(text))?.[0] || fallbackCategoryId;
};
const toNounPhraseDetail = (value?: string) => {
    const text = (value || '').trim();
    if (!text)
        return '';
    return text
        .replace(/\s*(?:자료|서류|증빙)?(?:를|을)?\s*(?:추가\s*)?제출(?:해)?\s*주세요\.?$/u, ' 제출 필요')
        .replace(/\s*(?:삭제|제거|교체)(?:해)?\s*주세요\.?$/u, ' 삭제 필요')
        .replace(/\s*부적합합니다\.?$/u, ' 부적합')
        .replace(/\s*적합합니다\.?$/u, ' 적합')
        .replace(/\s*있습니다\.?$/u, ' 있음')
        .replace(/\s*없습니다\.?$/u, ' 없음')
        .replace(/\s*어렵습니다\.?$/u, ' 어려움')
        .replace(/\s*필요합니다\.?$/u, ' 필요')
        .replace(/\s*바랍니다\.?$/u, ' 필요')
        .replace(/[.。]$/u, '')
        .trim();
};
const getUsageDetailTodoStorageKey = (projectId: string, key?: string) => `iveri-mvp-usage-detail-todos:${projectId}:${key || 'default'}`;
const getLegacyArchiveTodoStorageKey = (projectId: string, key?: string) => `iveri-mvp-archive-todos:${projectId}:${key || 'default'}`;
const isApiStatus = (error: unknown, status: number) => error instanceof ApiClientError && error.status === status;
type StoredUsageDetailTodoState = {
    requiredEvidenceByLine: SafetyDocAgentRequiredEvidenceMap;
    completedTodoIds: Record<string, boolean>;
    dismissedTodoIds: Record<string, boolean>;
};

const EMPTY_USAGE_DETAIL_TODO_STATE: StoredUsageDetailTodoState = {
    requiredEvidenceByLine: {},
    completedTodoIds: {},
    dismissedTodoIds: {},
};

const readStoredUsageDetailTodos = (projectId: string, key?: string): StoredUsageDetailTodoState => {
    if (typeof window === 'undefined')
        return EMPTY_USAGE_DETAIL_TODO_STATE;
    try {
        const nextKey = getUsageDetailTodoStorageKey(projectId, key);
        const legacyKey = getLegacyArchiveTodoStorageKey(projectId, key);
        const stored = window.localStorage.getItem(nextKey);
        const legacy = stored ? null : window.localStorage.getItem(legacyKey);
        const raw = stored || legacy;
        if (!raw)
            return EMPTY_USAGE_DETAIL_TODO_STATE;
        if (!stored && legacy) {
            window.localStorage.setItem(nextKey, legacy);
            window.localStorage.removeItem(legacyKey);
        }
        const parsed = JSON.parse(raw) as Partial<StoredUsageDetailTodoState>;
        return {
            requiredEvidenceByLine: parsed.requiredEvidenceByLine || {},
            completedTodoIds: parsed.completedTodoIds || {},
            dismissedTodoIds: parsed.dismissedTodoIds || {},
        };
    } catch {
        return EMPTY_USAGE_DETAIL_TODO_STATE;
    }
};
export default function UsageStatementDetailScreen({ projectId, usageStatementId, usageDetailSeed, usageItems = USAGE_LINE_ITEMS, onUsageItemsChange, onUsageDetailSeedChange, onFilesUploaded, onUsageDetailContentMutated, actionRequest, contentVisible = true, todoStorageKey, clearTodoSignal = 0, onTodoCountChange, onBackToOverview, uploadCompleteAction }: UsageStatementDetailScreenProps) {
    const resolvedUsageItems = usageItems.length ? usageItems : USAGE_LINE_ITEMS;
    const initialTodoState = readStoredUsageDetailTodos(projectId, todoStorageKey);
    const [fileData, setFileData] = useState<ArchiveSeed>(() => normalizeArchiveData(usageDetailSeed || createDefaultArchiveData()));
    const [matchingStatus, setMatchingStatus] = useState<'idle' | 'running' | 'done'>('idle');
    const [requiredEvidenceByLine, setRequiredEvidenceByLine] = useState<SafetyDocAgentRequiredEvidenceMap>(initialTodoState.requiredEvidenceByLine);
    const [matchingError, setMatchingError] = useState('');
    const [matchingNotice, setMatchingNotice] = useState('');
    const [usageDetailActionError, setUsageDetailActionError] = useState('');
    const [photoValidationStatus, setPhotoValidationStatus] = useState<UsageDetailValidationStatus>('idle');
    const [usageDetailVerificationStep, setUsageDetailVerificationStep] = useState<'ocr' | 'safety' | 'vision' | null>(null);
    const [photoValidationNotice, setPhotoValidationNotice] = useState<{ type: 'ok' | 'bad'; message: string } | null>(null);
    const [completedTodoIds, setCompletedTodoIds] = useState<Record<string, boolean>>(initialTodoState.completedTodoIds);
    const [dismissedTodoIds, setDismissedTodoIds] = useState<Record<string, boolean>>(initialTodoState.dismissedTodoIds);
    const [orchestratorTodoItems, setOrchestratorTodoItems] = useState<UsageDetailTodoItem[]>([]);
    const [agentFailureTarget, setAgentFailureTarget] = useState<AgentFailureTarget | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<{ kind: FolderEvidenceCategory; catId: number; fileId: string; usageItemId?: string } | null>(null);
    const [addUsageItemModalOpen, setAddUsageItemModalOpen] = useState(false);
    const [addUsageItemDraft, setAddUsageItemDraft] = useState<AddUsageItemDraft>({ name: '', date: new Date().toISOString().slice(0, 10), unit: 'EA', quantity: '1', unitPrice: '' });
    const [addUsageItemError, setAddUsageItemError] = useState('');
    const [classiAgentRunning, setClassiAgentRunning] = useState(false);
    const [classificationMoveNotices, setClassificationMoveNotices] = useState<ClassificationMoveNotice[]>([]);
    const [todoSidebarOpen, setTodoSidebarOpen] = useState(false);
    const [todoSidebarPinned, setTodoSidebarPinned] = useState(false);
    const [todoHoverBlocked, setTodoHoverBlocked] = useState(false);
    const [selectedHierarchyCatId, setSelectedHierarchyCatId] = useState(resolvedUsageItems[0]?.categoryId || 1);
    const [selectedUsageItemId, setSelectedUsageItemId] = useState(resolvedUsageItems[0]?.id || '');
    const pendingUsageDetailSeedRef = useRef<ArchiveSeed | null>(null);
    const syncingUsageDetailSeedRef = useRef(false);
    const usageDetailSeedSnapshotRef = useRef('');
    const hydratingTodoRef = useRef(false);
    const clearTodoSignalRef = useRef(clearTodoSignal);
    const todoPanelRef = useRef<HTMLElement | null>(null);
    useEffect(() => {
        if (!todoSidebarOpen)
            return;
        const closeOnOutsidePointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Node && todoPanelRef.current?.contains(target))
                return;
            setTodoSidebarPinned(false);
            setTodoSidebarOpen(false);
        };
        document.addEventListener('pointerdown', closeOnOutsidePointerDown);
        return () => document.removeEventListener('pointerdown', closeOnOutsidePointerDown);
    }, [todoSidebarOpen]);
    useEffect(() => {
        if (!usageDetailSeed)
            return;
        const normalizedSeed = normalizeArchiveData(usageDetailSeed);
        const nextSnapshot = JSON.stringify(normalizedSeed);
        if (usageDetailSeedSnapshotRef.current === nextSnapshot)
            return;
        usageDetailSeedSnapshotRef.current = nextSnapshot;
        syncingUsageDetailSeedRef.current = true;
        setFileData(normalizedSeed);
    }, [usageDetailSeed]);
    useEffect(() => {
        const stored = readStoredUsageDetailTodos(projectId, todoStorageKey);
        hydratingTodoRef.current = true;
        setRequiredEvidenceByLine(stored.requiredEvidenceByLine);
        setCompletedTodoIds(stored.completedTodoIds);
        setDismissedTodoIds(stored.dismissedTodoIds);
    }, [projectId, todoStorageKey]);
    useEffect(() => {
        if (hydratingTodoRef.current) {
            hydratingTodoRef.current = false;
            return;
        }
        if (typeof window === 'undefined')
            return;
        window.localStorage.setItem(getUsageDetailTodoStorageKey(projectId, todoStorageKey), JSON.stringify({
            requiredEvidenceByLine,
            completedTodoIds,
            dismissedTodoIds,
        }));
    }, [completedTodoIds, dismissedTodoIds, projectId, requiredEvidenceByLine, todoStorageKey]);
    useEffect(() => {
        if (!resolvedUsageItems.length)
            return;
        const categoryItems = resolvedUsageItems.filter((item) => item.categoryId === selectedHierarchyCatId);
        if (!categoryItems.length)
            return;
        const hasSelectedItem = categoryItems.some((item) => item.id === selectedUsageItemId);
        if (hasSelectedItem)
            return;
        setSelectedUsageItemId(categoryItems[0].id);
    }, [resolvedUsageItems, selectedHierarchyCatId, selectedUsageItemId]);
    useEffect(() => {
        if (syncingUsageDetailSeedRef.current) {
            syncingUsageDetailSeedRef.current = false;
            return;
        }
        if (!pendingUsageDetailSeedRef.current)
            return;
        const nextSeed = pendingUsageDetailSeedRef.current;
        pendingUsageDetailSeedRef.current = null;
        usageDetailSeedSnapshotRef.current = JSON.stringify(nextSeed);
        onUsageDetailSeedChange?.(nextSeed);
    }, [fileData, onUsageDetailSeedChange]);
    const commitFileData = (updater: (prev: ArchiveSeed) => ArchiveSeed) => {
        setFileData((prev) => {
            const next = updater(prev);
            pendingUsageDetailSeedRef.current = next;
            return next;
        });
    };
    const getFilesForCategory = (kind: FolderEvidenceCategory, catId: number, usageItemId?: string) => {
        const lineMap = fileData.categories?.[catId] || {};
        if (usageItemId)
            return lineMap[usageItemId]?.[kind] || [];
        return Object.values(lineMap).flatMap((kindMap) => kindMap[kind] || []);
    };
    const getHierarchyFilesForCategory = (kind: HierarchyEvidenceKind, catId: number, usageItemId?: string) => {
        if (kind === 'misc')
            return [];
        const files = getFilesForCategory(kind, catId, usageItemId);
        if (kind !== 'site_photo')
            return files;
        return files;
    };
    const refreshOrchestratorStatusTodos = async () => {
        if (!usageStatementId)
            return;
        try {
            const status = await getOrchestratorStatus(projectId, usageStatementId);
            setOrchestratorTodoItems((status.todos || []).map((todo) => toOrchestratorTodo(todo, resolvedUsageItems)).filter((todo): todo is UsageDetailTodoItem => Boolean(todo)));
        } catch {
            setOrchestratorTodoItems([]);
        }
    };
    useEffect(() => {
        void refreshOrchestratorStatusTodos();
    }, [projectId, usageStatementId, resolvedUsageItems]);
    const usageDetailTodoItems = useMemo<UsageDetailTodoItem[]>(() => {
        const todos: UsageDetailTodoItem[] = [...orchestratorTodoItems];
        const actionRequestText = normalizeTodoIdText(`${actionRequest?.title || ''} ${actionRequest?.message || ''}`);
        const actionRequestUsageItem = actionRequestText
            ? resolvedUsageItems.find((item) => {
                const itemName = normalizeTodoIdText(item.name);
                return Boolean(itemName && actionRequestText.includes(itemName));
            })
            : undefined;
        const actionRequestCategory = actionRequestUsageItem
            ? CATS.find((cat) => cat.id === actionRequestUsageItem.categoryId)
            : CATS.find((cat) => [cat.label, cat.short].map(normalizeTodoIdText).filter(Boolean).some((label) => actionRequestText.includes(label)));
        Object.entries(requiredEvidenceByLine).forEach(([usageItemId, evidenceMap]) => {
            const usageItem = resolvedUsageItems.find((item) => item.id === usageItemId);
            Object.entries(evidenceMap).forEach(([rawKind, names]) => {
                const kind = rawKind as FolderEvidenceCategory;
                (names || []).forEach((name, index) => {
                    const evidenceName = name || EVIDENCE_KIND_LABELS[kind];
                    const categoryName = usageItem ? CATS.find((cat) => cat.id === usageItem.categoryId)?.short : '';
                    todos.push({
                        id: `matching:add:${usageItemId}:${kind}:${normalizeTodoIdText(evidenceName)}:${index}`,
                        mode: 'add',
                        source: 'matching',
                        kind,
                        title: `${evidenceName}`,
                        context: usageItem?.name || '사용내역서 세부 항목',
                        categoryId: usageItem?.categoryId,
                        usageItemId,
                        detail: usageItem
                            ? `${usageItem.name}은/는 ${categoryName || '해당 9개 항목'} 기준의 지출로 분류되어 ${evidenceName} 증빙이 필요합니다.`
                            : `${evidenceName} 증빙이 필요합니다.`,
                    });
                });
            });
        });
        const legalEvidenceNames = extractActionRequestEvidenceNames(actionRequest?.message);
        if (legalEvidenceNames.length > 0) {
            legalEvidenceNames.forEach((name, index) => {
                const kind = inferEvidenceKindFromText(name);
                todos.push({
                    id: `law:add:${normalizeTodoIdText(actionRequest?.title || '보완요청')}:${normalizeTodoIdText(name)}:${index}`,
                    mode: 'add',
                    source: 'law',
                    kind,
                    title: `${name}`,
                    context: actionRequestUsageItem?.name || actionRequest?.title || '법령 보완 요청',
                    categoryId: actionRequestUsageItem?.categoryId || actionRequestCategory?.id,
                    usageItemId: actionRequestUsageItem?.id,
                    detail: toNounPhraseDetail(actionRequest?.message),
                });
            });
        } else if (actionRequest?.message) {
            todos.push({
                id: `law:add:${normalizeTodoIdText(actionRequest.title || actionRequest.message)}`,
                mode: 'add',
                source: 'law',
                kind: inferEvidenceKindFromText(actionRequest.message),
                title: '보완 요청 내용 확인',
                context: actionRequestUsageItem?.name || actionRequest.title || '법령 보완 요청',
                categoryId: actionRequestUsageItem?.categoryId || actionRequestCategory?.id,
                usageItemId: actionRequestUsageItem?.id,
                detail: toNounPhraseDetail(actionRequest.message),
            });
        }
        Object.entries(fileData.categories || {}).forEach(([catId, lineMap]) => {
            Object.entries(lineMap).forEach(([usageItemId, kindMap]) => {
                const usageItem = resolvedUsageItems.find((item) => item.id === usageItemId);
                const categoryName = CATS.find((cat) => String(cat.id) === catId)?.short;
                (kindMap.site_photo || []).forEach((file) => {
                    if (file.visionValidation?.status !== 'unsuitable')
                        return;
                    todos.push({
                        id: `vision:remove:${usageItemId}:${file.id}`,
                        mode: 'remove',
                        source: 'vision',
                        kind: 'site_photo',
                        title: file.name,
                        context: usageItem?.name || categoryName || '현장사진',
                        categoryId: Number(catId),
                        usageItemId,
                        detail: toNounPhraseDetail(file.visionValidation.summary || '현장사진 검증 결과 부적합'),
                    });
                });
            });
        });
        const seen = new Set<string>();
        return todos.filter((todo) => {
            if (seen.has(todo.id))
                return false;
            if (dismissedTodoIds[todo.id])
                return false;
            seen.add(todo.id);
            return true;
        });
    }, [actionRequest?.message, actionRequest?.title, dismissedTodoIds, fileData.categories, orchestratorTodoItems, requiredEvidenceByLine, resolvedUsageItems]);
    const activeTodoCount = usageDetailTodoItems.filter((todo) => !completedTodoIds[todo.id]).length;
    useEffect(() => {
        if (clearTodoSignalRef.current === clearTodoSignal)
            return;
        clearTodoSignalRef.current = clearTodoSignal;
        setDismissedTodoIds((current) => {
            const next = { ...current };
            usageDetailTodoItems.forEach((todo) => {
                if (completedTodoIds[todo.id])
                    next[todo.id] = true;
            });
            return next;
        });
        setCompletedTodoIds((current) => {
            const next = { ...current };
            usageDetailTodoItems.forEach((todo) => {
                if (current[todo.id])
                    delete next[todo.id];
            });
            return next;
        });
        setMatchingStatus('idle');
        setMatchingNotice('');
        setPhotoValidationNotice(null);
    }, [usageDetailTodoItems, clearTodoSignal, completedTodoIds]);
    useEffect(() => {
        onTodoCountChange?.(activeTodoCount);
    }, [activeTodoCount, onTodoCountChange]);
    const usageDetailVerificationRunning = Boolean(usageDetailVerificationStep) || matchingStatus === 'running' || photoValidationStatus === 'running';
    const usageDetailVerificationDone = matchingStatus === 'done' || photoValidationStatus === 'done';
    const usageDetailVerificationLabel = usageDetailVerificationRunning ? '검증 중...' : '유효성 검증';
    const isSupplementTarget = (catId: number, usageItemId?: string) => {
        if (usageItemId)
            return usageDetailTodoItems.some((todo) => {
                const usageItem = resolvedUsageItems.find((item) => item.id === usageItemId);
                return usageItem?.categoryId === catId && (todo.usageItemId === usageItemId || todo.context === usageItem.name);
            });
        return usageDetailTodoItems.some((todo) => {
            const usageItem = resolvedUsageItems.find((item) => item.name === todo.context);
            if (usageItem)
                return usageItem.categoryId === catId;
            const categoryName = CATS.find((cat) => cat.id === catId)?.short;
            return Boolean(categoryName && todo.context.includes(categoryName));
        });
    };
    const uploadFilesToSection = (kind: FolderEvidenceCategory, catId: number, usageItemId: string) => {
        if (!usageItemId)
            return;
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = kind === 'site_photo' ? 'image/*' : 'image/*,.pdf,.xlsx';
        input.onchange = async (event) => {
            const pickedFiles = Array.from((event.target as HTMLInputElement).files || []);
            if (!pickedFiles.length)
                return;
            setUsageDetailActionError('');
            try {
                const nextEntries = await Promise.all(pickedFiles.map(async (file) => {
                    const uploadedEntry = await uploadEvidenceFileToItem(projectId, usageItemId, file, kind);
                    if (!uploadedEntry.fileId)
                        return createEntryFromFile(file, kind, { ...uploadedEntry, categoryIds: [catId], usageItemIds: [usageItemId] });
                    return {
                        ...uploadedEntry,
                        kind,
                        previewUrl: uploadedEntry.previewUrl || (file.type.startsWith('image/') ? getProjectFilePreviewUrl(projectId, uploadedEntry.fileId) : ''),
                        categoryIds: [catId],
                        usageItemIds: [usageItemId],
                    };
                }));
                commitFileData((prev) => ({
                    ...prev,
                    categories: {
                        ...prev.categories,
                        [catId]: {
                            ...(prev.categories[catId] || {}),
                            [usageItemId]: {
                                ...(prev.categories[catId]?.[usageItemId] || {}),
                                [kind]: [...(prev.categories[catId]?.[usageItemId]?.[kind] || []), ...nextEntries],
                            },
                        },
                    },
                }));
                setSelectedHierarchyCatId(catId);
                setSelectedUsageItemId(usageItemId);
                const categoryName = CATS.find((cat) => cat.id === catId)?.short || '선택 항목';
                const itemName = resolvedUsageItems.find((item) => item.id === usageItemId)?.name || categoryName;
                onFilesUploaded?.(nextEntries, { categoryName, itemName });
                onUsageDetailContentMutated?.('upload');
            } catch (error) {
                setUsageDetailActionError(error instanceof Error ? error.message : '파일 업로드에 실패했습니다.');
            }
        };
        input.click();
    };
    const removeUsageDetailFile = (kind: FolderEvidenceCategory, catId: number, fileId: string, usageItemId?: string) => {
        setDeleteTarget({ kind, catId, fileId, usageItemId });
    };
    const renameUsageDetailFile = (kind: FolderEvidenceCategory, catId: number, fileId: string, nextName: string, usageItemId?: string) => {
        const trimmedName = nextName.trim();
        if (!trimmedName)
            return;
        const sourceFile = usageItemId
            ? fileData.categories?.[catId]?.[usageItemId]?.[kind]?.find((file) => file.id === fileId)
            : Object.values(fileData.categories?.[catId] || {}).flatMap((line) => line[kind] || []).find((file) => file.id === fileId);
        const shouldRename = (file: EvidenceFile) => file.id === fileId || (Boolean(sourceFile?.fileId) && file.fileId === sourceFile?.fileId);
        commitFileData((prev) => ({
            ...prev,
            usage_statement: prev.usage_statement.map((file) => shouldRename(file) ? { ...file, name: trimmedName } : file),
            categories: Object.fromEntries(Object.entries(prev.categories || {}).map(([nextCatId, lineMap]) => [
                nextCatId,
                Object.fromEntries(Object.entries(lineMap).map(([nextUsageItemId, kindMap]) => [
                    nextUsageItemId,
                    Object.fromEntries(Object.entries(kindMap).map(([nextKind, files]) => [
                        nextKind,
                        (files || []).map((file) => shouldRename(file) ? { ...file, name: trimmedName } : file),
                    ])),
                ])),
            ])) as ArchiveSeed['categories'],
        }));
        onUsageDetailContentMutated?.('rename');
    };
    const confirmRemoveArchiveFile = async () => {
        if (!deleteTarget)
            return;
        const { kind, catId, fileId, usageItemId } = deleteTarget;
        const targetFile = usageItemId
            ? fileData.categories?.[catId]?.[usageItemId]?.[kind]?.find((file) => file.id === fileId)
            : Object.values(fileData.categories?.[catId] || {}).flatMap((line) => line[kind] || []).find((file) => file.id === fileId);
        setUsageDetailActionError('');
        try {
            if (targetFile?.linkId) {
                await deleteEvidenceFileLink(projectId, targetFile.linkId);
            } else if (targetFile?.fileId) {
                await deleteProjectFile(projectId, targetFile.fileId);
            }
        } catch (error) {
            setUsageDetailActionError(error instanceof Error ? error.message : '파일 삭제에 실패했습니다.');
            return;
        }
        commitFileData((prev) => {
            const next: ArchiveSeed = { ...prev, categories: { ...prev.categories } };
            const lineMap = { ...(next.categories[catId] || {}) };
            const usageItemIds = usageItemId ? [usageItemId] : Object.keys(lineMap);
            usageItemIds.forEach((lineId) => {
                lineMap[lineId] = {
                    ...(lineMap[lineId] || {}),
                    [kind]: (lineMap[lineId]?.[kind] || []).filter((file) => file.id !== fileId),
                };
            });
            next.categories[catId] = lineMap;
            return next;
        });
        onUsageDetailContentMutated?.('delete');
        setDeleteTarget(null);
    };
    const removeHierarchyFile = (kind: HierarchyEvidenceKind, catId: number, usageItemId: string, fileId: string) => {
        if (kind !== 'misc') {
            removeUsageDetailFile(kind, catId, fileId, usageItemId);
            return;
        }
    };
    const renameHierarchyFile = (kind: HierarchyEvidenceKind, catId: number, usageItemId: string, file: EvidenceFile, nextName: string) => {
        if (kind !== 'misc')
            renameUsageDetailFile(kind, catId, file.id, nextName, usageItemId);
    };
    const moveHierarchyFile = async (fromKind: HierarchyEvidenceKind, fromCatId: number, fromUsageItemId: string, toKind: HierarchyEvidenceKind, toCatId: number, fileEntry: EvidenceFile, toUsageItemId?: string) => {
        if (fromKind === toKind && fromCatId === toCatId && fromUsageItemId === toUsageItemId)
            return;
        if (fromKind === 'misc' || toKind === 'misc')
            return;
        const nextKind: EvidenceCategory = toKind;
        const targetUsageItemId = toUsageItemId || resolvedUsageItems.find((item) => item.categoryId === toCatId)?.id || `cat-${toCatId}`;
        setUsageDetailActionError('');
        let movedLinkId = fileEntry.linkId;
        try {
            if (fileEntry.linkId) {
                const link = await moveEvidenceFileLink(projectId, fileEntry.linkId, targetUsageItemId, toKind);
                movedLinkId = link.linkId || fileEntry.linkId;
            } else if (fileEntry.fileId) {
                const link = await linkEvidenceFile(projectId, targetUsageItemId, fileEntry.fileId, toKind);
                movedLinkId = link.linkId;
            }
        } catch (error) {
            setUsageDetailActionError(error instanceof Error ? error.message : '파일 이동에 실패했습니다.');
            return;
        }
        const movedFile: EvidenceFile = { ...fileEntry, id: movedLinkId ? `evidence-link-${movedLinkId}` : fileEntry.id, linkId: movedLinkId, kind: nextKind, categoryIds: [toCatId] };
        commitFileData((prev) => {
            const next: ArchiveSeed = { ...prev, categories: { ...prev.categories } };
            next.categories[fromCatId] = { ...(next.categories[fromCatId] || {}) };
            next.categories[toCatId] = { ...(next.categories[toCatId] || {}) };
            next.categories[fromCatId][fromUsageItemId] = {
                ...(next.categories[fromCatId][fromUsageItemId] || {}),
                [fromKind]: (next.categories[fromCatId][fromUsageItemId]?.[fromKind] || []).filter((file) => file.id !== fileEntry.id),
            };
            next.categories[toCatId][targetUsageItemId] = {
                ...(next.categories[toCatId][targetUsageItemId] || {}),
                [toKind]: [...(next.categories[toCatId][targetUsageItemId]?.[toKind] || []), { ...movedFile, usageItemIds: [targetUsageItemId] }],
            };
            return next;
        });
        onUsageDetailContentMutated?.('move');
        const nextUsageItem = resolvedUsageItems.find((item) => item.id === toUsageItemId) || resolvedUsageItems.find((item) => item.categoryId === toCatId);
        if (nextUsageItem)
            setSelectedUsageItemId(nextUsageItem.id);
        setSelectedHierarchyCatId(toCatId);
    };
    const editUsageItem = async (usageItemId: string, input: { categoryId: number; name: string; date: string; unit: string; quantity: number; unitPrice: number; amount: number }) => {
        const targetItem = resolvedUsageItems.find((item) => item.id === usageItemId);
        if (!targetItem)
            return;
        if (!usageStatementId) {
            const error = new Error('사용내역서 ID가 없어 세부항목을 수정할 수 없습니다.');
            setUsageDetailActionError(error.message);
            throw error;
        }
        setUsageDetailActionError('');
        let nextItem: UsageLineItem;
        try {
            const updatedItem = await updateUsageStatementItem(projectId, usageStatementId, usageItemId, {
                categoryId: targetItem.categoryId,
                itemName: input.name,
                usedOn: input.date,
                unit: input.unit || undefined,
                quantity: input.quantity,
                unitPrice: input.unitPrice,
                totalAmount: input.amount,
                pageNo: 1,
            });
            nextItem = { ...updatedItem, categoryId: targetItem.categoryId };
            if (targetItem.categoryId !== input.categoryId) {
                const movedItem = await changeUsageStatementItemCategory(projectId, usageStatementId, usageItemId, input.categoryId);
                nextItem = { ...nextItem, categoryId: movedItem.categoryId || input.categoryId };
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : '세부항목 수정에 실패했습니다.';
            setUsageDetailActionError(message);
            throw error;
        }
        onUsageItemsChange?.(resolvedUsageItems.map((item) => item.id === usageItemId ? nextItem : item));
        if (targetItem.categoryId !== nextItem.categoryId) {
            commitFileData((prev) => {
                const next: ArchiveSeed = { ...prev, categories: { ...prev.categories } };
                const sourceLineMap = { ...(next.categories[targetItem.categoryId] || {}) };
                const targetLineMap = { ...(next.categories[nextItem.categoryId] || {}) };
                const lineFiles = sourceLineMap[usageItemId] || {};
                delete sourceLineMap[usageItemId];
                targetLineMap[usageItemId] = Object.fromEntries(Object.entries(lineFiles).map(([kind, files]) => [
                    kind,
                    (files || []).map((file) => ({
                        ...file,
                        categoryIds: [nextItem.categoryId],
                        usageItemIds: [usageItemId],
                    })),
                ])) as typeof targetLineMap[string];
                next.categories[targetItem.categoryId] = sourceLineMap;
                next.categories[nextItem.categoryId] = targetLineMap;
                return next;
            });
        }
        onUsageDetailContentMutated?.('edit-item');
        setSelectedHierarchyCatId(nextItem.categoryId);
        setSelectedUsageItemId(usageItemId);
    };
    const openFileDownload = (file: EvidenceFile) => {
        if (!file.fileId)
            return;
        window.open(getProjectFileDownloadUrl(projectId, file.fileId), '_blank', 'noopener,noreferrer');
    };
    const openAddUsageItemModal = () => {
        setAddUsageItemDraft({ name: '', date: new Date().toISOString().slice(0, 10), unit: 'EA', quantity: '1', unitPrice: '' });
        setAddUsageItemError('');
        setAddUsageItemModalOpen(true);
    };
    const submitAddUsageItem = async () => {
        const name = addUsageItemDraft.name.trim();
        const quantity = parseUsageNumber(addUsageItemDraft.quantity);
        const unitPrice = parseUsageNumber(addUsageItemDraft.unitPrice);
        const amount = calculateUsageLineAmount(quantity, unitPrice);
        if (!name) {
            setAddUsageItemError('사용내역을 입력해 주세요.');
            return;
        }
        if (!Number.isFinite(quantity) || quantity <= 0) {
            setAddUsageItemError('수량을 입력해 주세요.');
            return;
        }
        if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
            setAddUsageItemError('단가를 입력해 주세요.');
            return;
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            setAddUsageItemError('수량과 단가를 확인해 주세요.');
            return;
        }
        if (!addUsageItemDraft.date) {
            setAddUsageItemError('사용일자를 입력해 주세요.');
            return;
        }
        if (!usageStatementId) {
            setAddUsageItemError('사용내역서 ID가 없어 세부항목을 추가할 수 없습니다.');
            return;
        }
        setAddUsageItemError('');
        setAddUsageItemModalOpen(false);
        setClassiAgentRunning(true);
        try {
            const categoryId = classifyUsageLineCategory(name, selectedHierarchyCatId);
            const nextItem = await createUsageStatementItem(projectId, usageStatementId, {
                categoryId,
                itemName: name,
                usedOn: addUsageItemDraft.date,
                unit: addUsageItemDraft.unit.trim() || undefined,
                quantity,
                unitPrice,
                totalAmount: amount,
                pageNo: 1,
            });
            const nextItems = [...resolvedUsageItems, nextItem];
            onUsageItemsChange?.(nextItems);
            setSelectedHierarchyCatId(nextItem.categoryId || categoryId);
            setSelectedUsageItemId(nextItem.id);
            if (selectedHierarchyCatId !== (nextItem.categoryId || categoryId)) {
                setClassificationMoveNotices([{
                    id: nextItem.id,
                    itemName: nextItem.name,
                    fromCategoryName: getCategoryDisplayName(selectedHierarchyCatId),
                    toCategoryName: getCategoryDisplayName(nextItem.categoryId || categoryId),
                    reason: '입력한 항목명을 기준으로 classi 에이전트가 더 적합한 9개 항목 위치를 선택했습니다.',
                }]);
            }
            onUsageDetailContentMutated?.('add-item');
        } catch (error) {
            setAddUsageItemError(error instanceof Error ? error.message : '세부항목 추가에 실패했습니다.');
            setAddUsageItemModalOpen(true);
        } finally {
            setClassiAgentRunning(false);
        }
    };
    const deleteUsageItem = async (targetItem: UsageLineItem) => {
        if (!usageStatementId) {
            setUsageDetailActionError('사용내역서 ID가 없어 세부항목을 삭제할 수 없습니다.');
            return;
        }
        setUsageDetailActionError('');
        try {
            await deleteUsageStatementItem(projectId, usageStatementId, targetItem.id);
        } catch (error) {
            setUsageDetailActionError(error instanceof Error ? error.message : '세부항목 삭제에 실패했습니다.');
            return;
        }
        const nextItems = resolvedUsageItems.filter((item) => item.id !== targetItem.id);
        onUsageItemsChange?.(nextItems);
        commitFileData((prev) => {
            const next: ArchiveSeed = { ...prev, categories: { ...prev.categories } };
            const lineMap = { ...(next.categories[targetItem.categoryId] || {}) };
            delete lineMap[targetItem.id];
            next.categories[targetItem.categoryId] = lineMap;
            return next;
        });
        setRequiredEvidenceByLine((current) => {
            if (!current[targetItem.id])
                return current;
            const next = { ...current };
            delete next[targetItem.id];
            return next;
        });
        setCompletedTodoIds((current) => {
            const next = Object.fromEntries(Object.entries(current).filter(([key]) => !key.includes(`:${targetItem.id}:`) && !key.includes(`-${targetItem.id}-`)));
            return next;
        });
        const nextSelected = nextItems.find((item) => item.categoryId === targetItem.categoryId) || nextItems[0];
        setSelectedHierarchyCatId(nextSelected?.categoryId || 1);
        setSelectedUsageItemId(nextSelected?.id || '');
        onUsageDetailContentMutated?.('delete-item');
    };
    const isProblemFile = (file: EvidenceFile) => file.kind === 'site_photo' && file.visionValidation?.status === 'unsuitable';
    const usageDetailLoadingMessage = usageDetailVerificationStep === 'ocr'
            ? {
                title: 'OCR 매칭 결과를 확인하고 있어요',
                body: '영수증과 사용내역서의 날짜, 빈값, 연결 가능성을 link agent가 먼저 점검합니다.',
            }
            : usageDetailVerificationStep === 'safety'
                ? {
                    title: '필수 증빙 규칙을 대조하고 있어요',
                    body: 'safety-doc agent가 세부 항목별로 필요한 증빙과 보완 대상을 확인합니다.',
                }
                : usageDetailVerificationStep === 'vision'
                    ? {
                        title: '현장사진을 확인하고 있어요',
                        body: 'vision model이 사진 속 현장 상태와 세부 항목의 적합성을 판단합니다.',
                    }
                    : null;
    const runSafetyDocMatching = async () => {
        if (matchingStatus === 'running')
            return;
        if (!usageStatementId) {
            setMatchingError('사용내역서 ID가 없어 Safety Doc Agent를 실행할 수 없습니다.');
            return;
        }
        const loadStoredRequirements = async () => {
            const requirementEntries = await Promise.all(resolvedUsageItems.map(async (item) => {
                const requirements = await listSafeLeeEvidenceRequirements(projectId, usageStatementId, item.id).catch(() => []);
                return safeLeeRequirementsToMap(item.id, requirements);
            }));
            const storedRequiredEvidence = requirementEntries.reduce<SafetyDocAgentRequiredEvidenceMap>((result, entry) => ({ ...result, ...entry }), {});
            setRequiredEvidenceByLine(storedRequiredEvidence);
            setFileData((current) => normalizeArchiveData(current));
            return storedRequiredEvidence;
        };
        setMatchingStatus('running');
        setMatchingError('');
        setMatchingNotice('');
        try {
            await runEvidenceReviewAgent(projectId, usageStatementId);
            const agentRequiredEvidence = await loadStoredRequirements();
            setRequiredEvidenceByLine(agentRequiredEvidence);
            setMatchingStatus('done');
            setMatchingNotice(Object.keys(agentRequiredEvidence).length
                ? 'Safety Doc Agent 실행 후 저장된 필수 증빙을 반영했습니다.'
                : 'Safety Doc Agent가 추가로 요구한 증빙이 없습니다.');
        } catch (error) {
            if (isApiStatus(error, 501)) {
                const storedRequiredEvidence = await loadStoredRequirements();
                setMatchingStatus('done');
                setMatchingNotice(Object.keys(storedRequiredEvidence).length
                    ? 'Safety Doc Agent 실행 API가 아직 구현되지 않아 저장된 필수 증빙 데이터를 표시합니다.'
                    : 'Safety Doc Agent 실행 API가 아직 구현되지 않아 표시할 필수 증빙 결과가 없습니다.');
                return;
            }
            const storedRequiredEvidence = await loadStoredRequirements();
            setMatchingStatus('done');
            setMatchingNotice(Object.keys(storedRequiredEvidence).length
                ? 'Safety Doc Agent 응답을 받지 못해 저장된 필수 증빙 데이터를 표시합니다.'
                : 'Safety Doc Agent 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.');
        }
    };
    const runVisionPhotoValidation = async () => {
        if (photoValidationStatus === 'running')
            return;
        if (!usageStatementId) {
            setAgentFailureTarget('photo-validation');
            return;
        }
        setPhotoValidationNotice(null);
        setPhotoValidationStatus('running');
        try {
            await runEvidenceReviewAgent(projectId, usageStatementId);
            setPhotoValidationStatus('done');
            setPhotoValidationNotice({ type: 'ok', message: 'Vision 실행 결과가 저장되었습니다.' });
        } catch {
            setPhotoValidationStatus('idle');
            setPhotoValidationNotice({ type: 'bad', message: 'Vision 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.' });
        }
    };
    const waitForVerificationStep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const runOcrLinkValidation = async () => {
        if (!usageStatementId) {
            setAgentFailureTarget('evidence-matching');
            return;
        }
        const evidenceFiles = Object.entries(fileData.categories || {}).flatMap(([, lineMap]) =>
            Object.entries(lineMap).flatMap(([usageItemId, kindMap]) =>
                Object.values(kindMap).flatMap((files) =>
                    (files || [])
                        .filter((file) => file.fileId)
                        .map((file) => ({ fileId: file.fileId as number | string, usageItemId }))
                )
            )
        );
        if (!evidenceFiles.length)
            return;
        await Promise.all(evidenceFiles.map((file) => parseAndMatchEvidenceWithOcr(projectId, {
            fileId: file.fileId,
            usageStatementId,
            usageStatementItemId: file.usageItemId,
        }))).catch(() => {
            setMatchingNotice('link agent 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.');
        });
    };
    const runUsageDetailVerification = async () => {
        if (usageDetailVerificationRunning)
            return;
        if (!usageStatementId) {
            setAgentFailureTarget('evidence-matching');
            return;
        }
        setUsageDetailVerificationStep('ocr');
        setMatchingStatus('running');
        setPhotoValidationStatus('running');
        setMatchingNotice('');
        setPhotoValidationNotice(null);
        try {
            const reviewTask = runEvidenceReviewAgent(projectId, usageStatementId);
            await waitForVerificationStep(1800);
            setUsageDetailVerificationStep('safety');
            await waitForVerificationStep(2100);
            setUsageDetailVerificationStep('vision');
            await waitForVerificationStep(2100);
            await reviewTask;
            await refreshOrchestratorStatusTodos();
            setMatchingStatus('done');
            setPhotoValidationStatus('done');
            setMatchingNotice('증빙 유효성 검증 결과를 보완 TODO에 반영했습니다.');
            setPhotoValidationNotice({ type: 'ok', message: '현장사진 검증 결과를 확인했습니다.' });
        } catch {
            await Promise.allSettled([
                runOcrLinkValidation(),
                runSafetyDocMatching(),
                runVisionPhotoValidation(),
            ]);
            await refreshOrchestratorStatusTodos();
        } finally {
            setUsageDetailVerificationStep(null);
        }
    };
    const renderTodoList = (items: UsageDetailTodoItem[]) => (
      <div style={{ display: 'grid', gap: 7 }}>
        {items.map((todo, index) => {
          const done = Boolean(completedTodoIds[todo.id]);
          const tone = todo.mode === 'add' ? C.primary : C.danger;
          const toneSoft = todo.mode === 'add' ? C.bg : C.dangerBg;
          const toneBorder = todo.mode === 'add' ? C.light : '#FFCDD2';
          const cardBorder = done ? C.g200 : toneBorder;
          const cardBg = C.white;
          const textColor = done ? C.g400 : C.g800;
          const mutedTextColor = done ? C.g400 : C.g600;
          const actionText = todo.mode === 'add' ? '업로드 필요' : '삭제 필요';
          const todoUsageItem = resolvedUsageItems.find((item) => item.name === todo.context);
          const categoryName = CATS.find((cat) => cat.id === todoUsageItem?.categoryId)?.short || '9개 항목';
          const reasonText = todo.detail || '';
          const tooltipOpensUp = index >= items.length - 1;
          return (
            <button
              key={todo.id}
              type="button"
              title={reasonText || undefined}
              onClick={() => setCompletedTodoIds((current) => ({ ...current, [todo.id]: !current[todo.id] }))}
              style={{
                width: '100%',
                border: `1px solid ${cardBorder}`,
                borderRadius: 6,
                background: cardBg,
                color: textColor,
                cursor: 'pointer',
                fontFamily: 'inherit',
                padding: '9px 8px',
                textAlign: 'left',
                position: 'relative',
                boxShadow: done ? 'none' : '0 6px 14px rgba(31,47,39,.06)',
              }}
            >
              {reasonText && (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: 8,
                    right: 8,
                    ...(tooltipOpensUp ? { bottom: 'calc(100% + 6px)' } : { top: 'calc(100% + 6px)' }),
                    zIndex: 5,
                    display: 'none',
                    border: `1px solid ${C.g200}`,
                    borderRadius: 6,
                    background: C.white,
                    color: C.g800,
                    boxShadow: '0 10px 24px rgba(31,47,39,.14)',
                    padding: '8px 9px',
                    fontSize: 11,
                    fontWeight: 800,
                    lineHeight: 1.45,
                    whiteSpace: 'normal',
                    wordBreak: 'keep-all',
                  }}
                  className="usage-detail-todo-reason"
                >
                  {reasonText}
                </span>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '18px minmax(0,1fr)', gap: 7, alignItems: 'start' }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 999,
                    border: `1px solid ${done ? C.g200 : toneBorder}`,
                    background: done ? C.g100 : toneSoft,
                    color: done ? C.g400 : tone,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    fontWeight: 900,
                    marginTop: 1,
                  }}
                >
                  {done ? '✓' : ''}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 900, lineHeight: 1.35, color: done ? C.g400 : tone, textDecoration: done ? 'line-through' : 'none' }}>{todo.title} {actionText}</span>
                  <span style={{ display: 'block', marginTop: 3, fontSize: 11, fontWeight: 800, color: mutedTextColor, lineHeight: 1.4, textDecoration: done ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{categoryName} ∙ {todo.context}</span>
                </span>
              </div>
            </button>
          );
        })}
      </div>
    );
    const renderTodoGroup = (kind: FolderEvidenceCategory) => {
        const items = usageDetailTodoItems.filter((todo) => todo.kind === kind);
        if (!items.length)
            return null;
        const activeCount = items.filter((todo) => !completedTodoIds[todo.id]).length;
        return (
          <div key={kind} style={{ border: `1px solid ${C.g200}`, borderRadius: 6, background: C.white, padding: 7, display: 'grid', gap: 7, marginBottom: 8, position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: activeCount ? C.g800 : C.g400 }}>{EVIDENCE_KIND_LABELS[kind]}</div>
              <div style={{ minWidth: 20, height: 18, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px', background: C.white, color: activeCount ? C.primary : C.g400, border: `1px solid ${C.g200}`, fontSize: 10, fontWeight: 900 }}>{activeCount}</div>
            </div>
            {renderTodoList(items)}
          </div>
        );
    };
    const renderTodoSidebar = () => {
        if (!usageDetailTodoItems.length)
            return null;
        return (
          <>
            {todoSidebarOpen && (
              <aside ref={todoPanelRef} data-ui="usage-detail-screen.todo-panel" onClick={() => setTodoSidebarPinned(true)} onMouseLeave={() => { if (!todoSidebarPinned) setTodoSidebarOpen(false); }} style={{ position: 'fixed', top: 'var(--app-header-height)', right: 0, width: 320, maxWidth: 'calc(100vw - 24px)', height: 'calc(100vh - var(--app-header-height))', zIndex: 54, border: `1px solid ${C.g200}`, borderRight: 'none', borderRadius: '10px 0 0 10px', background: C.white, boxShadow: '-18px 0 42px rgba(31,47,39,.14)', overflow: 'hidden', display: 'grid', gridTemplateRows: 'auto minmax(0,1fr)', overscrollBehavior: 'contain', opacity: todoSidebarPinned ? 1 : 0.95, transition: 'opacity .16s ease' }}>
                <div style={{ position: 'sticky', top: 0, zIndex: 2, background: C.white, borderBottom: `1px solid ${C.g200}`, padding: '16px 16px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: C.g800 }}>보완 TODO</div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 900, color: C.primary }}>{activeTodoCount}건</div>
                      <button type="button" aria-label={todoSidebarPinned ? '보완 TODO 접기' : '보완 TODO 고정'} onClick={(event) => { event.stopPropagation(); if (!todoSidebarPinned) { setTodoSidebarPinned(true); setTodoSidebarOpen(true); return; } setTodoSidebarPinned(false); setTodoSidebarOpen(false); setTodoHoverBlocked(true); }} style={{ width: 28, height: 28, border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.primary, cursor: 'pointer', fontSize: 18, fontWeight: 900, lineHeight: 1 }}>
                        »
                      </button>
                    </div>
                  </div>
                </div>
                <div className="usage-detail-todo-scroll" style={{ overflowY: 'auto', overflowX: 'hidden', padding: '12px 8px 12px 12px', scrollbarWidth: 'thin', scrollbarColor: `${C.g200} transparent`, background: C.white, overscrollBehavior: 'contain' }}>
                  {EVIDENCE_SECTIONS.map((section) => renderTodoGroup(section.id))}
                </div>
              </aside>
            )}
            {!todoSidebarOpen && (
              <aside data-ui="usage-detail-screen.todo-rail" onMouseEnter={() => { if (!todoHoverBlocked) setTodoSidebarOpen(true); }} onMouseLeave={() => setTodoHoverBlocked(false)} style={{ position: 'fixed', top: 'var(--app-header-height)', right: 0, width: 45, height: 180, zIndex: 54, border: `1px solid ${C.g200}`, borderRight: 'none', borderRadius: '14px 0 0 14px', background: C.white, boxShadow: '-10px 0 28px rgba(31,47,39,.10)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '10px 6px' }}>
                <button type="button" aria-label="보완 TODO 펼치기" onClick={() => { setTodoHoverBlocked(false); setTodoSidebarPinned(true); setTodoSidebarOpen(true); }} style={{ width: 34, height: 34, border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.primary, cursor: 'pointer', fontSize: 20, fontWeight: 900, lineHeight: 1, boxShadow: '0 8px 18px rgba(31,47,39,.10)' }}>
                  «
                </button>
                <div style={{ width: 30, borderTop: `1px solid ${C.g200}` }} />
                <button type="button" onClick={() => { setTodoHoverBlocked(false); setTodoSidebarPinned(true); setTodoSidebarOpen(true); }} style={{ width: 36, minHeight: 92, border: 'none', borderRadius: 10, background: 'transparent', color: C.g800, cursor: 'pointer', fontFamily: 'inherit', display: 'grid', placeItems: 'center', gap: 5, padding: '7px 3px' }}>
                  <span aria-hidden="true" style={{ width: 23, height: 23, borderRadius: 999, border: `2px solid ${C.primary}`, background: C.white, color: C.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900 }}>{activeTodoCount}</span>
                  <span style={{ fontSize: 10, fontWeight: 900, lineHeight: 1.2, writingMode: 'vertical-rl', letterSpacing: 0 }}>보완 TODO</span>
                </button>
              </aside>
            )}
          </>
        );
    };
    const usageDetailVerificationStepIndex = usageDetailVerificationStep === 'ocr' ? 0 : usageDetailVerificationStep === 'safety' ? 1 : usageDetailVerificationStep === 'vision' ? 2 : -1;
    const renderUsageDetailVerificationLoader = () => {
        if (!usageDetailVerificationStep || !usageDetailLoadingMessage)
            return null;
        const steps = [
            { id: 'ocr', label: 'OCR/link agent' },
            { id: 'safety', label: 'safety_doc_agent' },
            { id: 'vision', label: 'vision model' },
        ];
        return (
          <div className="usage-detail-verification-loader">
            <div className="usage-detail-loader-ocean" aria-hidden="true" />
            <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: C.g800 }}>{usageDetailLoadingMessage.title}</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.g600, lineHeight: 1.55 }}>{usageDetailLoadingMessage.body}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 4 }}>
                {steps.map((step, index) => {
                    const active = index === usageDetailVerificationStepIndex;
                    const done = index < usageDetailVerificationStepIndex;
                    return (
                      <div key={step.id} style={{ border: `1px solid ${active ? C.primary : done ? C.light : C.g200}`, borderRadius: 999, background: active ? C.bg : done ? '#F4FBF6' : C.white, color: active ? C.primary : done ? C.ok : C.g400, padding: '7px 8px', textAlign: 'center', fontSize: 11, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {done ? '완료 · ' : active ? '진행 · ' : ''}{step.label}
                      </div>
                    );
                })}
              </div>
            </div>
          </div>
        );
    };
    return (<div data-ui="usage-detail-screen.1" style={{ background: 'transparent', position: 'relative' }}>
      {contentVisible && renderTodoSidebar()}
      <div data-ui="usage-detail-screen.2" className="screen-enter" style={{ display: contentVisible ? 'grid' : 'none', gap: 12, minWidth: 0 }}>
        <div data-ui="usage-detail-screen.detail-header" style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto', alignItems: 'center', gap: 10, marginBottom: 4, minWidth: 0 }}>
          <div style={{ minWidth: 0, display: 'inline-flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: C.g800, whiteSpace: 'nowrap' }}>세부 내역</div>
            <div style={{ fontSize: 12, color: C.g400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>사용내역서 세부 내역 및 증빙 파일 보기</div>
          </div>
          <div />
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            {onBackToOverview && <button type="button" onClick={onBackToOverview} style={{ height: 40, border: 'none', borderRadius: 999, background: C.primary, color: C.white, cursor: 'pointer', fontSize: 13, fontWeight: 900, fontFamily: 'inherit', padding: '0 16px', whiteSpace: 'nowrap', boxShadow: 'none' }}>사용내역서 보기</button>}
            <button type="button" onClick={() => void runUsageDetailVerification()} disabled={usageDetailVerificationRunning} style={{ height: 40, border: `1px solid ${usageDetailVerificationDone ? C.primary : C.g800}`, borderRadius: 999, background: usageDetailVerificationDone ? C.bg : C.white, color: usageDetailVerificationDone ? C.primary : C.g800, cursor: usageDetailVerificationRunning ? 'wait' : 'pointer', fontSize: 13, fontWeight: 900, fontFamily: 'inherit', padding: '0 16px', whiteSpace: 'nowrap', boxShadow: 'none' }}>{usageDetailVerificationLabel}</button>
          </div>
        </div>
        <CenterModal open={Boolean(agentFailureTarget)} title="처리 실패" body={agentFailureTarget ? getAgentFailureMessage(agentFailureTarget) : ''} actionLabel="확인" onAction={() => setAgentFailureTarget(null)} />
        {matchingError && (
          <Card style={{ marginBottom: 12, padding: '12px 14px', background: C.dangerBg, border: '1px solid #FFCDD2' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: C.danger, lineHeight: 1.5 }}>{matchingError}</div>
              <button type="button" onClick={() => setMatchingError('')} style={{ border: 'none', background: 'transparent', color: C.g400, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
          </Card>
        )}
        {usageDetailActionError && (
          <Card style={{ marginBottom: 12, padding: '12px 14px', background: C.dangerBg, border: '1px solid #FFCDD2' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: C.danger, lineHeight: 1.5 }}>{usageDetailActionError}</div>
              <button type="button" onClick={() => setUsageDetailActionError('')} style={{ border: 'none', background: 'transparent', color: C.g400, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
          </Card>
        )}
        {(matchingNotice || photoValidationNotice) && (
          <Card style={{ marginBottom: 12, padding: '12px 14px', background: photoValidationNotice?.type === 'bad' ? C.dangerBg : C.bg, border: `1px solid ${photoValidationNotice?.type === 'bad' ? '#FFCDD2' : C.light}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'start', gap: 12 }}>
              <div style={{ display: 'grid', gap: 5, minWidth: 0 }}>
                {matchingNotice && <div style={{ fontSize: 13, fontWeight: 900, color: photoValidationNotice?.type === 'bad' ? C.danger : C.primary, lineHeight: 1.5 }}>{matchingNotice}</div>}
                {photoValidationNotice && <div style={{ fontSize: 13, fontWeight: 900, color: photoValidationNotice.type === 'bad' ? C.danger : C.primary, lineHeight: 1.5 }}>{photoValidationNotice.message}</div>}
              </div>
              <button type="button" onClick={() => {
                setMatchingNotice('');
                setPhotoValidationNotice(null);
              }} style={{ border: 'none', background: 'transparent', color: C.g400, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
          </Card>
        )}
        <div data-ui="usage-detail-screen.6" className="screen-enter" style={{ paddingTop: 0, position: 'relative', minHeight: 560 }}>
          <UsageDetailFileView cats={CATS} usageItems={resolvedUsageItems} selectedCatId={selectedHierarchyCatId} selectedUsageItemId={selectedUsageItemId} actionRequest={actionRequest} getFiles={getHierarchyFilesForCategory} isProblemFile={isProblemFile} isSupplementTarget={isSupplementTarget} onSelectCat={(catId) => {
                setSelectedHierarchyCatId(catId);
                setSelectedUsageItemId(resolvedUsageItems.find((item) => item.categoryId === catId)?.id || '');
            }} onSelectUsageItem={(item) => {
                setSelectedUsageItemId(item.id);
                setSelectedHierarchyCatId(item.categoryId);
            }} onRemove={removeHierarchyFile} onRename={renameHierarchyFile} onMove={moveHierarchyFile} onEditUsageItem={editUsageItem} onAddUsageItem={openAddUsageItemModal} onDeleteUsageItem={deleteUsageItem} onUpload={uploadFilesToSection} onDownloadFile={openFileDownload} fileHeaderAction={uploadCompleteAction}/>
          {usageDetailVerificationStep && usageDetailLoadingMessage && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'grid', placeItems: 'center', padding: 24, background: 'rgba(247, 252, 248, .62)', backdropFilter: 'blur(1px)' }}>
              <div style={{ width: 'min(100%, 680px)', background: C.white, borderRadius: 18, border: `1px solid ${C.g200}`, boxShadow: '0 18px 44px rgba(0,0,0,.18)', padding: 22 }}>
                {renderUsageDetailVerificationLoader()}
              </div>
            </div>
          )}
        </div>
      </div>
      <Modal open={addUsageItemModalOpen} onClose={() => setAddUsageItemModalOpen(false)} zIndex={960} maxWidth={520}>
        <div style={{ background: C.white, borderRadius: 18, border: `1px solid ${C.g200}`, boxShadow: '0 18px 44px rgba(0,0,0,.16)', padding: '24px 24px 20px' }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: C.g800, marginBottom: 8 }}>세부 항목 추가</div>
          <div style={{ fontSize: 13, color: C.g600, lineHeight: 1.6, marginBottom: 16 }}>
            입력한 항목은 classi 에이전트가 9개 항목 기준으로 분류합니다.
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <label style={{ display: 'grid', gap: 7, minWidth: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: C.g600 }}>사용내역</span>
              <input value={addUsageItemDraft.name} onChange={(event) => setAddUsageItemDraft((current) => ({ ...current, name: event.target.value }))} autoFocus style={addUsageItemInputStyle} />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <label style={{ display: 'grid', gap: 7, minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 900, color: C.g600 }}>사용일자</span>
                <input type="date" value={addUsageItemDraft.date} onChange={(event) => setAddUsageItemDraft((current) => ({ ...current, date: event.target.value }))} style={addUsageItemInputStyle} />
              </label>
              <label style={{ display: 'grid', gap: 7, minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 900, color: C.g600 }}>단위</span>
                <input value={addUsageItemDraft.unit} onChange={(event) => setAddUsageItemDraft((current) => ({ ...current, unit: event.target.value }))} style={addUsageItemInputStyle} />
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <label style={{ display: 'grid', gap: 7, minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 900, color: C.g600 }}>수량</span>
                <input value={addUsageItemDraft.quantity} onChange={(event) => setAddUsageItemDraft((current) => ({ ...current, quantity: event.target.value }))} inputMode="decimal" style={addUsageItemInputStyle} />
              </label>
              <label style={{ display: 'grid', gap: 7, minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 900, color: C.g600 }}>단가</span>
                <input value={addUsageItemDraft.unitPrice} onChange={(event) => setAddUsageItemDraft((current) => ({ ...current, unitPrice: event.target.value }))} inputMode="numeric" style={addUsageItemInputStyle} />
              </label>
            </div>
          </div>
          {addUsageItemError && <div style={{ marginTop: 12, color: C.danger, fontSize: 12, fontWeight: 900 }}>{addUsageItemError}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <button type="button" onClick={() => setAddUsageItemModalOpen(false)} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '9px 14px', background: C.white, color: C.g600, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer' }}>취소</button>
            <button type="button" onClick={submitAddUsageItem} style={{ border: 'none', borderRadius: 999, padding: '9px 16px', background: C.primary, color: C.white, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer' }}>완료</button>
          </div>
        </div>
      </Modal>

      <Modal open={classiAgentRunning} onClose={() => {}} zIndex={1200} maxWidth={420}>
        <div style={{ background: C.white, borderRadius: 18, border: `1px solid ${C.g200}`, boxShadow: '0 18px 44px rgba(0,0,0,.18)', padding: 24 }}>
          <InlineLoader title="classi 에이전트 실행 중" body="세부 항목이 산업안전보건관리비 9개 항목 중 어디에 해당하는지 확인하고 있습니다. 완료될 때까지 다른 작업을 할 수 없습니다." />
        </div>
      </Modal>
      <CenterModal open={classificationMoveNotices.length > 0} title="세부항목 분류 변경" body={<div>
        <div style={{ marginBottom: 10, fontSize: 13, color: C.g600, lineHeight: 1.6 }}>classi 에이전트가 세부항목의 9개 항목 위치를 변경했습니다.</div>
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

      <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} zIndex={940} maxWidth={420}>
        <div style={{ background: C.white, borderRadius: 18, border: `1px solid ${C.g200}`, boxShadow: '0 18px 44px rgba(0,0,0,.16)', padding: '24px 24px 20px' }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: C.g800, marginBottom: 8 }}>파일 삭제</div>
          <div style={{ fontSize: 13, color: C.g600, lineHeight: 1.6, marginBottom: 18 }}>이 파일을 아카이브에서 삭제하시겠습니까?</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" onClick={() => setDeleteTarget(null)} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '9px 14px', background: C.white, color: C.g600, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer' }}>취소</button>
            <button type="button" onClick={confirmRemoveArchiveFile} style={{ border: 'none', borderRadius: 999, padding: '9px 16px', background: C.primary, color: C.white, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer' }}>삭제</button>
          </div>
        </div>
      </Modal>
    </div>);
}
