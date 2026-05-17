import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Card from '../../components/ui/Card';
import CenterModal from '../../components/ui/CenterModal';
import InlineLoader from '../../components/ui/InlineLoader';
import Modal from '../../components/ui/Modal';
import { C } from '../../lib/theme';
import { getAgentFailureMessage, type AgentFailureTarget } from '../../lib/agent-failure';
import { CATS, USAGE_LINE_ITEMS, calculateUsageLineAmount, createDefaultArchiveData, createEntryFromFile, makeEntry, normalizeArchiveData, parseUsageNumber, type UsageLineItem } from '../../lib/evidence-utils';
import UsageDetailFileView, { type HierarchyEvidenceKind } from './UsageDetailFileView';
import ArchivePreview from './ArchivePreview';
import { deleteEvidenceFileLink, deleteProjectFile, getProjectFileDownloadUrl, getProjectFilePreviewUrl, linkEvidenceFile, moveEvidenceFileLink, uploadProjectFile, type SafetyDocAgentRequiredEvidence, type SafetyDocAgentRequiredEvidenceMap } from '../../lib/archive-api';
import type { ArchiveSeed, EvidenceCategory, EvidenceFile, FolderEvidenceCategory } from '../../types/domain';
type ArchiveValidationStatus = 'idle' | 'running' | 'done';
interface ArchiveScreenProps {
    projectId: string;
    matchReady: boolean;
    uncheckedMatchedFileCount?: number;
    onDismissMatchReady: () => void | Promise<void>;
    archiveSeed: ArchiveSeed | null;
    usageItems?: UsageLineItem[];
    onUsageItemsChange?: (items: UsageLineItem[]) => void;
    onArchiveSeedChange?: (seed: ArchiveSeed) => void;
    onFilesUploaded?: (files: EvidenceFile[], context?: { categoryName: string; itemName: string }) => void;
    onArchiveContentMutated?: (mutation: 'upload' | 'delete' | 'move' | 'rename' | 'add-item' | 'delete-item') => void;
    actionRequest?: { title: string; message: string; dueDate?: string };
    contentVisible?: boolean;
    todoStorageKey?: string;
    clearTodoSignal?: number;
    onTodoCountChange?: (count: number) => void;
    onBackToOverview?: () => void;
    uploadCompleteAction?: ReactNode;
}
type ArchiveTodoSource = 'matching' | 'vision' | 'law';
type ArchiveTodoItem = {
    id: string;
    mode: 'add' | 'remove';
    source: ArchiveTodoSource;
    kind: FolderEvidenceCategory;
    title: string;
    context: string;
    detail?: string;
};
type AddUsageItemDraft = {
    name: string;
    date: string;
    unit: string;
    quantity: string;
    unitPrice: string;
};
const FOLDER_EVIDENCE_KINDS: FolderEvidenceCategory[] = ['receipt', 'site_photo', 'tax_invoice', 'other_document'];
const EVIDENCE_KIND_LABELS: Record<FolderEvidenceCategory, string> = {
    receipt: '영수증',
    site_photo: '현장사진',
    tax_invoice: '세금계산서',
    other_document: '기타 자료',
};
const TODO_SECTION_LABELS: Record<FolderEvidenceCategory, string> = {
    receipt: '영수증',
    site_photo: '사진',
    tax_invoice: '세금계산서',
    other_document: '기타',
};
const TODO_SOURCE_LABELS: Record<ArchiveTodoSource, string> = {
    matching: '매칭',
    vision: '비전',
    law: '법령',
};
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
const getArchiveTodoStorageKey = (projectId: string, key?: string) => `iveri-mvp-archive-todos:${projectId}:${key || 'default'}`;
const readStoredArchiveTodos = (projectId: string, key?: string) => {
    if (typeof window === 'undefined')
        return { requiredEvidenceByLine: {}, completedTodoIds: {} } as { requiredEvidenceByLine: SafetyDocAgentRequiredEvidenceMap; completedTodoIds: Record<string, boolean> };
    try {
        const raw = window.localStorage.getItem(getArchiveTodoStorageKey(projectId, key));
        if (!raw)
            return { requiredEvidenceByLine: {}, completedTodoIds: {} };
        const parsed = JSON.parse(raw) as Partial<{ requiredEvidenceByLine: SafetyDocAgentRequiredEvidenceMap; completedTodoIds: Record<string, boolean> }>;
        return {
            requiredEvidenceByLine: parsed.requiredEvidenceByLine || {},
            completedTodoIds: parsed.completedTodoIds || {},
        };
    } catch {
        return { requiredEvidenceByLine: {}, completedTodoIds: {} };
    }
};
export default function ArchiveScreen({ projectId, matchReady, uncheckedMatchedFileCount = 0, onDismissMatchReady, archiveSeed, usageItems = USAGE_LINE_ITEMS, onUsageItemsChange, onArchiveSeedChange, onFilesUploaded, onArchiveContentMutated, actionRequest, contentVisible = true, todoStorageKey, clearTodoSignal = 0, onTodoCountChange, onBackToOverview, uploadCompleteAction }: ArchiveScreenProps) {
    const resolvedUsageItems = usageItems.length ? usageItems : USAGE_LINE_ITEMS;
    const initialTodoState = readStoredArchiveTodos(projectId, todoStorageKey);
    const [fileData, setFileData] = useState<ArchiveSeed>(() => normalizeArchiveData(archiveSeed || createDefaultArchiveData()));
    const [checkingMatchedFiles, setCheckingMatchedFiles] = useState(false);
    const [matchingStatus, setMatchingStatus] = useState<'idle' | 'running' | 'done'>('idle');
    const [requiredEvidenceByLine, setRequiredEvidenceByLine] = useState<SafetyDocAgentRequiredEvidenceMap>(initialTodoState.requiredEvidenceByLine);
    const [matchingError, setMatchingError] = useState('');
    const [matchingNotice, setMatchingNotice] = useState('');
    const [archiveActionError, setArchiveActionError] = useState('');
    const [photoValidationStatus, setPhotoValidationStatus] = useState<ArchiveValidationStatus>('idle');
    const [photoValidationNotice, setPhotoValidationNotice] = useState<{ type: 'ok' | 'bad'; message: string } | null>(null);
    const [completedTodoIds, setCompletedTodoIds] = useState<Record<string, boolean>>(initialTodoState.completedTodoIds);
    const [agentFailureTarget, setAgentFailureTarget] = useState<AgentFailureTarget | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<{ kind: FolderEvidenceCategory; catId: number; fileId: string; usageItemId?: string } | null>(null);
    const [addUsageItemModalOpen, setAddUsageItemModalOpen] = useState(false);
    const [addUsageItemDraft, setAddUsageItemDraft] = useState<AddUsageItemDraft>({ name: '', date: new Date().toISOString().slice(0, 10), unit: 'EA', quantity: '1', unitPrice: '' });
    const [addUsageItemError, setAddUsageItemError] = useState('');
    const [classiAgentRunning, setClassiAgentRunning] = useState(false);
    const [selectedHierarchyCatId, setSelectedHierarchyCatId] = useState(resolvedUsageItems[0]?.categoryId || 1);
    const [selectedUsageItemId, setSelectedUsageItemId] = useState(resolvedUsageItems[0]?.id || '');
    const [hoverPreview, setHoverPreview] = useState<{
        entry: EvidenceFile;
        x: number;
        y: number;
    } | null>(null);
    const pendingArchiveSeedRef = useRef<ArchiveSeed | null>(null);
    const syncingArchiveSeedRef = useRef(false);
    const archiveSeedSnapshotRef = useRef('');
    const hydratingTodoRef = useRef(false);
    const clearTodoSignalRef = useRef(clearTodoSignal);
    useEffect(() => {
        if (!archiveSeed)
            return;
        const normalizedSeed = normalizeArchiveData(archiveSeed);
        const nextSnapshot = JSON.stringify(normalizedSeed);
        if (archiveSeedSnapshotRef.current === nextSnapshot)
            return;
        archiveSeedSnapshotRef.current = nextSnapshot;
        syncingArchiveSeedRef.current = true;
        setFileData(normalizedSeed);
    }, [archiveSeed]);
    useEffect(() => {
        const stored = readStoredArchiveTodos(projectId, todoStorageKey);
        hydratingTodoRef.current = true;
        setRequiredEvidenceByLine(stored.requiredEvidenceByLine);
        setCompletedTodoIds(stored.completedTodoIds);
        if (Object.keys(stored.requiredEvidenceByLine).length > 0)
            setMatchingStatus('done');
    }, [projectId, todoStorageKey]);
    useEffect(() => {
        if (hydratingTodoRef.current) {
            hydratingTodoRef.current = false;
            return;
        }
        if (typeof window === 'undefined')
            return;
        window.localStorage.setItem(getArchiveTodoStorageKey(projectId, todoStorageKey), JSON.stringify({
            requiredEvidenceByLine,
            completedTodoIds,
        }));
    }, [completedTodoIds, projectId, requiredEvidenceByLine, todoStorageKey]);
    useEffect(() => {
        if (clearTodoSignalRef.current === clearTodoSignal)
            return;
        clearTodoSignalRef.current = clearTodoSignal;
        setRequiredEvidenceByLine({});
        setCompletedTodoIds({});
        setMatchingStatus('idle');
        setMatchingNotice('');
        setPhotoValidationNotice(null);
        if (typeof window !== 'undefined')
            window.localStorage.removeItem(getArchiveTodoStorageKey(projectId, todoStorageKey));
    }, [clearTodoSignal, projectId, todoStorageKey]);
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
        if (syncingArchiveSeedRef.current) {
            syncingArchiveSeedRef.current = false;
            return;
        }
        if (!pendingArchiveSeedRef.current)
            return;
        const nextSeed = pendingArchiveSeedRef.current;
        pendingArchiveSeedRef.current = null;
        archiveSeedSnapshotRef.current = JSON.stringify(nextSeed);
        onArchiveSeedChange?.(nextSeed);
    }, [fileData, onArchiveSeedChange]);
    const commitFileData = (updater: (prev: ArchiveSeed) => ArchiveSeed) => {
        setFileData((prev) => {
            const next = updater(prev);
            pendingArchiveSeedRef.current = next;
            return next;
        });
    };
    const getFilesForCategory = (kind: FolderEvidenceCategory, catId: number, usageItemId?: string) => {
        const lineMap = fileData.categories?.[catId] || {};
        if (usageItemId)
            return lineMap[usageItemId]?.[kind] || [];
        return Object.values(lineMap).flatMap((kindMap) => kindMap[kind] || []);
    };
    const getHierarchyFilesForCategory = (kind: HierarchyEvidenceKind, catId: number, usageItemId?: string) => kind === 'misc' ? [] : getFilesForCategory(kind, catId, usageItemId);
    const archiveTodoItems = useMemo<ArchiveTodoItem[]>(() => {
        const todos: ArchiveTodoItem[] = [];
        Object.entries(requiredEvidenceByLine).forEach(([usageItemId, evidenceMap]) => {
            const usageItem = resolvedUsageItems.find((item) => item.id === usageItemId);
            Object.entries(evidenceMap).forEach(([rawKind, names]) => {
                const kind = rawKind as FolderEvidenceCategory;
                (names || []).forEach((name, index) => {
                    const evidenceName = name || EVIDENCE_KIND_LABELS[kind];
                    todos.push({
                        id: `matching:add:${usageItemId}:${kind}:${normalizeTodoIdText(evidenceName)}:${index}`,
                        mode: 'add',
                        source: 'matching',
                        kind,
                        title: `${evidenceName}`,
                        context: usageItem?.name || '사용내역서 세부 항목',
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
                    context: actionRequest?.title || '법령 보완 요청',
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
                context: actionRequest.title || '법령 보완 요청',
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
                        detail: toNounPhraseDetail(file.visionValidation.summary || '현장사진 검증 결과 부적합'),
                    });
                });
            });
        });
        const seen = new Set<string>();
        return todos.filter((todo) => {
            if (seen.has(todo.id))
                return false;
            seen.add(todo.id);
            return true;
        });
    }, [actionRequest?.message, actionRequest?.title, fileData.categories, requiredEvidenceByLine, resolvedUsageItems]);
    const activeTodoCount = archiveTodoItems.filter((todo) => !completedTodoIds[todo.id]).length;
    useEffect(() => {
        onTodoCountChange?.(activeTodoCount);
    }, [activeTodoCount, onTodoCountChange]);
    const archiveVerificationRunning = matchingStatus === 'running' || photoValidationStatus === 'running';
    const archiveVerificationDone = matchingStatus === 'done' || photoValidationStatus === 'done';
    const archiveVerificationLabel = archiveVerificationRunning ? '검증 중...' : '검증';
    const isSupplementTarget = (catId: number, usageItemId?: string) => {
        if (usageItemId)
            return archiveTodoItems.some((todo) => {
                const usageItem = resolvedUsageItems.find((item) => item.id === usageItemId);
                return usageItem?.categoryId === catId && todo.context === usageItem.name;
            });
        return archiveTodoItems.some((todo) => {
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
            setArchiveActionError('');
            try {
                const nextEntries = await Promise.all(pickedFiles.map(async (file) => {
                    const uploadedEntry = await uploadProjectFile(projectId, file, kind);
                    if (!uploadedEntry.fileId)
                        return createEntryFromFile(file, kind, { ...uploadedEntry, categoryIds: [catId], usageItemIds: [usageItemId] });
                    const link = await linkEvidenceFile(projectId, usageItemId, uploadedEntry.fileId, kind);
                    return {
                        ...uploadedEntry,
                        id: `evidence-link-${link.linkId}`,
                        linkId: link.linkId,
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
                onArchiveContentMutated?.('upload');
            } catch (error) {
                setArchiveActionError(error instanceof Error ? error.message : '파일 업로드에 실패했습니다.');
            }
        };
        input.click();
    };
    const removeArchiveFile = (kind: FolderEvidenceCategory, catId: number, fileId: string, usageItemId?: string) => {
        setDeleteTarget({ kind, catId, fileId, usageItemId });
    };
    const renameArchiveFile = (kind: FolderEvidenceCategory, catId: number, fileId: string, nextName: string, usageItemId?: string) => {
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
        onArchiveContentMutated?.('rename');
    };
    const confirmRemoveArchiveFile = async () => {
        if (!deleteTarget)
            return;
        const { kind, catId, fileId, usageItemId } = deleteTarget;
        const targetFile = usageItemId
            ? fileData.categories?.[catId]?.[usageItemId]?.[kind]?.find((file) => file.id === fileId)
            : Object.values(fileData.categories?.[catId] || {}).flatMap((line) => line[kind] || []).find((file) => file.id === fileId);
        setArchiveActionError('');
        try {
            if (targetFile?.linkId) {
                await deleteEvidenceFileLink(projectId, targetFile.linkId);
            } else if (targetFile?.fileId) {
                await deleteProjectFile(projectId, targetFile.fileId);
            }
        } catch (error) {
            setArchiveActionError(error instanceof Error ? error.message : '파일 삭제에 실패했습니다.');
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
        onArchiveContentMutated?.('delete');
        setDeleteTarget(null);
    };
    const removeHierarchyFile = (kind: HierarchyEvidenceKind, catId: number, usageItemId: string, fileId: string) => {
        if (kind !== 'misc') {
            removeArchiveFile(kind, catId, fileId, usageItemId);
            return;
        }
    };
    const renameHierarchyFile = (kind: HierarchyEvidenceKind, catId: number, usageItemId: string, file: EvidenceFile, nextName: string) => {
        if (kind !== 'misc')
            renameArchiveFile(kind, catId, file.id, nextName, usageItemId);
    };
    const moveHierarchyFile = async (fromKind: HierarchyEvidenceKind, fromCatId: number, fromUsageItemId: string, toKind: HierarchyEvidenceKind, toCatId: number, fileEntry: EvidenceFile, toUsageItemId?: string) => {
        if (fromKind === toKind && fromCatId === toCatId && fromUsageItemId === toUsageItemId)
            return;
        if (fromKind === 'misc' || toKind === 'misc')
            return;
        const nextKind: EvidenceCategory = toKind;
        const targetUsageItemId = toUsageItemId || resolvedUsageItems.find((item) => item.categoryId === toCatId)?.id || `cat-${toCatId}`;
        setArchiveActionError('');
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
            setArchiveActionError(error instanceof Error ? error.message : '파일 이동에 실패했습니다.');
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
        onArchiveContentMutated?.('move');
        const nextUsageItem = resolvedUsageItems.find((item) => item.id === toUsageItemId) || resolvedUsageItems.find((item) => item.categoryId === toCatId);
        if (nextUsageItem)
            setSelectedUsageItemId(nextUsageItem.id);
        setSelectedHierarchyCatId(toCatId);
    };
    const moveUsageItem = (usageItemId: string, toCatId: number) => {
        const targetItem = resolvedUsageItems.find((item) => item.id === usageItemId);
        if (!targetItem || targetItem.categoryId === toCatId)
            return;
        onUsageItemsChange?.(resolvedUsageItems.map((item) => item.id === usageItemId ? { ...item, categoryId: toCatId } : item));
        commitFileData((prev) => {
            const next: ArchiveSeed = { ...prev, categories: { ...prev.categories } };
            const sourceLineMap = { ...(next.categories[targetItem.categoryId] || {}) };
            const targetLineMap = { ...(next.categories[toCatId] || {}) };
            const lineFiles = sourceLineMap[usageItemId] || {};
            delete sourceLineMap[usageItemId];
            targetLineMap[usageItemId] = Object.fromEntries(Object.entries(lineFiles).map(([kind, files]) => [
                kind,
                (files || []).map((file) => ({
                    ...file,
                    categoryIds: [toCatId],
                    usageItemIds: [usageItemId],
                })),
            ])) as typeof targetLineMap[string];
            next.categories[targetItem.categoryId] = sourceLineMap;
            next.categories[toCatId] = targetLineMap;
            return next;
        });
        onArchiveContentMutated?.('move');
        setSelectedHierarchyCatId(toCatId);
        setSelectedUsageItemId(usageItemId);
    };
    const openFilePreview = (file: EvidenceFile) => {
        if (!file.fileId)
            return;
        window.open(getProjectFilePreviewUrl(projectId, file.fileId), '_blank', 'noopener,noreferrer');
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
    const submitAddUsageItem = () => {
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
        setAddUsageItemError('');
        setAddUsageItemModalOpen(false);
        setClassiAgentRunning(true);
        window.setTimeout(() => {
            const categoryId = classifyUsageLineCategory(name, selectedHierarchyCatId);
            const nextItem: UsageLineItem = {
                id: `manual-${Date.now()}`,
                categoryId,
                name,
                amount,
                date: addUsageItemDraft.date,
                unit: addUsageItemDraft.unit.trim() || undefined,
                quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : undefined,
                unitPrice: Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice : undefined,
            };
            const nextItems = [...resolvedUsageItems, nextItem];
            onUsageItemsChange?.(nextItems);
            setSelectedHierarchyCatId(categoryId);
            setSelectedUsageItemId(nextItem.id);
            onArchiveContentMutated?.('add-item');
            setClassiAgentRunning(false);
        }, 900);
    };
    const deleteUsageItem = (targetItem: UsageLineItem) => {
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
        onArchiveContentMutated?.('delete-item');
    };
    const isProblemFile = (file: EvidenceFile) => file.kind === 'site_photo' && file.visionValidation?.status === 'unsuitable';
    const hasUncheckedMatchedFiles = uncheckedMatchedFileCount > 0;
    const showMatchReadyNotice = matchReady || hasUncheckedMatchedFiles;
    const archiveLoadingMessage = checkingMatchedFiles
        ? {
            title: '매칭 파일 확인을 반영하고 있어요',
            body: '검토 완료 상태를 저장하고 아카이브 화면을 갱신하고 있습니다.',
        }
        : matchingStatus === 'running'
            ? {
                title: '증빙 매칭을 진행하고 있어요',
                body: '사용내역서 세부 항목과 영수증, 현장사진, 세금계산서, 기타 자료를 서로 연결하고 있습니다.',
            }
            : photoValidationStatus === 'running'
                ? {
                    title: '현장사진을 검증하고 있어요',
                    body: '업로드된 현장사진을 항목별로 확인하고 부적합 여부를 표시할 준비를 하고 있습니다.',
                }
                : null;
    const dismissMatchReady = async () => {
        setCheckingMatchedFiles(true);
        try {
            await onDismissMatchReady();
        } finally {
            setCheckingMatchedFiles(false);
        }
    };
    const runSafetyDocMatching = async () => {
        if (matchingStatus === 'running')
            return;
        setMatchingStatus('running');
        setMatchingError('');
        setMatchingNotice('');
        await new Promise<void>((resolve) => window.setTimeout(() => {
            const buildExampleRequiredEvidence = () => {
                const targets = resolvedUsageItems.slice(0, 4);
                const examples: SafetyDocAgentRequiredEvidence[] = [
                    { receipt: ['안전교육 결제 영수증'], tax_invoice: ['전자세금계산서'] },
                    { site_photo: ['설치 전후 비교 사진', '착용 확인 사진'] },
                    { other_document: ['지급대장', '수령 확인서'] },
                    { receipt: ['계좌이체 확인증'], other_document: ['참석자 명단'] },
                ];
                return targets.reduce<SafetyDocAgentRequiredEvidenceMap>((result, item, index) => {
                    result[item.id] = examples[index] || { other_document: ['기타 보완 자료'] };
                    return result;
                }, {});
            };
            const agentRequiredEvidence = buildExampleRequiredEvidence();
            setRequiredEvidenceByLine(agentRequiredEvidence);
            setFileData((current) => normalizeArchiveData(current));
            setMatchingStatus('done');
            setMatchingNotice(Object.keys(agentRequiredEvidence).length
                ? '백엔드 매칭 API가 아직 없어 예시 매칭 결과를 표시했습니다.'
                : '백엔드 매칭 API가 아직 없고 표시할 사용내역서 세부 항목도 없습니다.');
            resolve();
        }, 700));

        /*
         * TODO: 백엔드 API가 생기면 임시 예시 결과 대신 아래 호출을 복구합니다.
         * const agentRequiredEvidence = await runSafetyDocAgentMatching(projectId);
         * setRequiredEvidenceByLine(agentRequiredEvidence);
         */
    };
    const shouldMarkPhotoUnsuitable = (file: EvidenceFile, itemName: string) => {
        const text = `${file.name} ${file.description || ''} ${itemName}`.toLowerCase();
        if (/보호구|안전모|안전화|안전벨트|안전조끼|개인보호구/.test(text))
            return true;
        return /미착용|미사용|부적합|위반|불량|no[-_\s]?hardhat|without|bad|fail/.test(text);
    };
    const getPhotoValidationSummary = (itemName: string, unsuitable: boolean) => {
        if (unsuitable && /보호구|안전모|안전화|안전벨트|안전조끼|개인보호구/.test(itemName))
            return '보호구 구입 현장 사진이 부적합합니다.';
        return unsuitable ? `${itemName} 현장 사진이 부적합합니다.` : `${itemName} 현장 사진이 적합합니다.`;
    };
    const runVisionPhotoValidation = () => {
        if (photoValidationStatus === 'running')
            return;
        setPhotoValidationNotice(null);
        setPhotoValidationStatus('running');
        window.setTimeout(() => {
            try {
                const badItemNames: string[] = [];
                setFileData((current) => {
                    const next: ArchiveSeed = { ...current, categories: { ...current.categories } };
                    const hasUnsuitableCandidate = Object.values(next.categories || {}).some((lineMap) => Object.entries(lineMap).some(([usageItemId, kindMap]) => {
                        const usageItem = resolvedUsageItems.find((item) => item.id === usageItemId);
                        const itemName = usageItem?.name || '';
                        return (kindMap.site_photo || []).some((file) => shouldMarkPhotoUnsuitable(file, itemName));
                    }));
                    const hasSamplePhoto = Object.values(next.categories || {}).some((lineMap) => Object.values(lineMap).some((kindMap) => (kindMap.site_photo || []).some((file) => file.name === '보호구_현장사진_안전벨트_미착용.jpg')));
                    if (!hasUnsuitableCandidate && !hasSamplePhoto) {
                        const sampleItem = resolvedUsageItems.find((item) => /보호구|안전모|안전화|안전벨트|안전조끼|개인보호구/.test(item.name))
                            || resolvedUsageItems.find((item) => item.categoryId === 3)
                            || resolvedUsageItems[0];
                        if (sampleItem) {
                            const sampleCategoryId = sampleItem.categoryId || 3;
                            const samplePhoto = makeEntry('보호구_현장사진_안전벨트_미착용.jpg', 'site_photo', {
                                description: '비전 검증 삭제 필요 예시',
                                uploadedAt: new Date().toISOString().slice(0, 10),
                                uploadedBy: '샘플 데이터',
                                categoryIds: [sampleCategoryId],
                                usageItemIds: [sampleItem.id],
                            });
                            next.categories[sampleCategoryId] = {
                                ...(next.categories[sampleCategoryId] || {}),
                                [sampleItem.id]: {
                                    ...(next.categories[sampleCategoryId]?.[sampleItem.id] || {}),
                                    site_photo: [...(next.categories[sampleCategoryId]?.[sampleItem.id]?.site_photo || []), samplePhoto],
                                },
                            };
                        }
                    }
                    Object.entries(next.categories || {}).forEach(([catId, lineMap]) => {
                        const nextLineMap = { ...lineMap };
                        Object.entries(nextLineMap).forEach(([usageItemId, kindMap]) => {
                            const usageItem = resolvedUsageItems.find((item) => item.id === usageItemId);
                            const itemName = usageItem?.name || CATS.find((cat) => String(cat.id) === catId)?.label || '세부항목';
                            const sitePhotos = kindMap.site_photo || [];
                            if (!sitePhotos.length)
                                return;
                            const checkedPhotos = sitePhotos.map((file) => {
                                const unsuitable = shouldMarkPhotoUnsuitable(file, itemName);
                                if (unsuitable)
                                    badItemNames.push(itemName);
                                return {
                                    ...file,
                                    previewUrl: file.previewUrl,
                                    visionValidation: {
                                        status: unsuitable ? 'unsuitable' as const : 'suitable' as const,
                                        checkedAt: new Date().toISOString(),
                                        itemName,
                                        summary: getPhotoValidationSummary(itemName, unsuitable),
                                        detections: [
                                            { label: 'person', confidence: 0.98, box: [24, 22, 154, 190] as [number, number, number, number], status: 'ok' as const },
                                            { label: unsuitable ? 'hardhat missing' : 'hardhat', confidence: unsuitable ? 0.91 : 0.76, box: [74, 42, 86, 58] as [number, number, number, number], status: unsuitable ? 'bad' as const : 'ok' as const },
                                        ],
                                    },
                                };
                            });
                            nextLineMap[usageItemId] = { ...kindMap, site_photo: checkedPhotos };
                        });
                        next.categories[catId] = nextLineMap;
                    });
                    pendingArchiveSeedRef.current = next;
                    return next;
                });
                setPhotoValidationStatus('done');
                const uniqueBadNames = Array.from(new Set(badItemNames));
                setPhotoValidationNotice(uniqueBadNames.length
                    ? { type: 'bad', message: `${uniqueBadNames.join(', ')}의 현장 사진이 부적합합니다.` }
                    : { type: 'ok', message: '모든 현장 사진이 적합합니다.' });
            } catch {
                setPhotoValidationStatus('idle');
                setAgentFailureTarget('photo-validation');
            }
        }, 1200);
    };
    const runArchiveVerification = async () => {
        if (archiveVerificationRunning)
            return;
        await runSafetyDocMatching();
        runVisionPhotoValidation();
    };
    const renderTodoList = (items: ArchiveTodoItem[]) => (
      <div style={{ display: 'grid', gap: 7 }}>
        {items.map((todo) => {
          const done = Boolean(completedTodoIds[todo.id]);
          const tone = todo.mode === 'add' ? C.primary : C.danger;
          const actionText = todo.mode === 'add' ? '업로드 필요' : '삭제 필요';
          const todoUsageItem = resolvedUsageItems.find((item) => item.name === todo.context);
          const categoryName = CATS.find((cat) => cat.id === todoUsageItem?.categoryId)?.short || '9개 항목';
          const reasonText = [TODO_SOURCE_LABELS[todo.source], todo.detail].filter(Boolean).join(' 결과 · ');
          return (
            <button
              key={todo.id}
              type="button"
              title={reasonText || undefined}
              onClick={() => setCompletedTodoIds((current) => ({ ...current, [todo.id]: !current[todo.id] }))}
              style={{
                width: '100%',
                border: `1px solid ${done ? C.g200 : tone}`,
                borderRadius: 6,
                background: done ? '#F8FAF9' : C.white,
                color: done ? C.g400 : C.g800,
                cursor: 'pointer',
                fontFamily: 'inherit',
                padding: '9px 10px',
                textAlign: 'left',
                position: 'relative',
              }}
            >
              {reasonText && (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: 10,
                    right: 10,
                    bottom: 'calc(100% + 6px)',
                    zIndex: 5,
                    display: 'none',
                    border: `1px solid ${C.g200}`,
                    borderRadius: 6,
                    background: C.white,
                    color: C.g600,
                    boxShadow: '0 10px 24px rgba(31,55,43,.14)',
                    padding: '8px 9px',
                    fontSize: 11,
                    fontWeight: 800,
                    lineHeight: 1.45,
                    whiteSpace: 'normal',
                    wordBreak: 'keep-all',
                  }}
                  className="archive-todo-reason"
                >
                  {reasonText}
                </span>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '18px minmax(0,1fr)', gap: 8, alignItems: 'start' }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 999,
                    border: `1px solid ${done ? C.g400 : tone}`,
                    background: done ? C.g200 : C.white,
                    color: done ? C.g600 : tone,
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
                  <span style={{ display: 'block', marginTop: 3, fontSize: 11, fontWeight: 800, color: done ? C.g400 : C.g600, lineHeight: 1.4, textDecoration: done ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{categoryName} ∙ {todo.context}</span>
                </span>
              </div>
            </button>
          );
        })}
      </div>
    );
    const renderTodoSection = (kind: FolderEvidenceCategory) => {
        const items = archiveTodoItems.filter((todo) => todo.kind === kind);
        const activeCount = items.filter((todo) => !completedTodoIds[todo.id]).length;
        return (
          <section key={kind} style={{ border: `1px solid ${C.g200}`, borderRadius: 6, background: C.white, padding: 10, display: 'grid', gap: 8, boxShadow: '0 6px 14px rgba(31,55,43,.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingBottom: 2 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: C.g800 }}>{TODO_SECTION_LABELS[kind]}</div>
              <div style={{ minWidth: 22, height: 20, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 7px', background: activeCount ? C.bg : C.g100, color: activeCount ? C.primary : C.g400, fontSize: 11, fontWeight: 900 }}>{activeCount}</div>
            </div>
            {items.length ? renderTodoList(items) : (
              <div style={{ border: `1px dashed ${C.g200}`, borderRadius: 6, background: C.white, padding: '10px 8px', textAlign: 'center', color: C.g400, fontSize: 11, fontWeight: 800 }}>
                항목 없음
              </div>
            )}
          </section>
        );
    };
    const renderTodoPanel = () => {
        return (
          <Card style={{ padding: 0, overflow: 'hidden', border: `1px solid ${C.g200}`, borderRadius: 6, background: `linear-gradient(135deg, ${C.bg} 0%, ${C.white} 58%, #F8FCFA 100%)`, boxShadow: '0 10px 24px rgba(31,55,43,.06)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,.36fr) minmax(0,1fr)', gap: 0, alignItems: 'stretch' }}>
              <div style={{ padding: '16px 18px', borderRight: `1px solid ${C.g200}`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 12, minWidth: 0 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                    <div style={{ fontSize: 16, fontWeight: 900, color: C.g800, lineHeight: 1.2 }}>보완 TODO</div>
                    <div style={{ minWidth: 34, height: 24, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 9px', border: `1px solid ${activeTodoCount ? C.light : C.g200}`, background: activeTodoCount ? C.white : C.g100, color: activeTodoCount ? C.primary : C.g400, fontSize: 11, fontWeight: 900 }}>{activeTodoCount}건</div>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: C.g400, lineHeight: 1.45 }}>매칭/현장사진 검증 결과에서 담당자가 확인할 보완 항목입니다.</div>
                </div>
              </div>
              <div style={{ padding: 14, minWidth: 0 }}>
                {archiveTodoItems.length === 0 ? (
                  <div style={{ height: '100%', minHeight: 86, border: `1px dashed ${C.g200}`, borderRadius: 6, background: 'rgba(255,255,255,.72)', padding: '18px 12px', display: 'grid', placeItems: 'center', textAlign: 'center', color: C.g400, fontSize: 12, fontWeight: 800, lineHeight: 1.5 }}>현재 추가하거나 제거할 서류가 없습니다.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', gap: 10, overflowX: 'auto', paddingBottom: 2 }}>
                    {FOLDER_EVIDENCE_KINDS.map((kind) => renderTodoSection(kind))}
                  </div>
                )}
              </div>
            </div>
          </Card>
        );
    };
    return (<div data-ui="archive-screen.1" style={{ background: 'transparent', position: 'relative' }}>
      <div data-ui="archive-screen.2" className="screen-enter" style={{ display: contentVisible ? 'grid' : 'none', gap: 12, minWidth: 0 }}>
        <div data-ui="archive-screen.detail-header" style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto', alignItems: 'center', gap: 10, marginBottom: 4, minWidth: 0 }}>
          <div style={{ minWidth: 0, display: 'inline-flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: C.g800, whiteSpace: 'nowrap' }}>세부 내역</div>
            <div style={{ fontSize: 12, color: C.g400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>사용내역서 세부 내역 및 증빙 파일 보기</div>
          </div>
          <div />
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            {onBackToOverview && <button type="button" onClick={onBackToOverview} style={{ height: 40, border: 'none', borderRadius: 999, background: C.primary, color: C.white, cursor: 'pointer', fontSize: 13, fontWeight: 900, fontFamily: 'inherit', padding: '0 16px', whiteSpace: 'nowrap', boxShadow: 'none' }}>사용내역서 보기</button>}
            <button type="button" onClick={() => void runArchiveVerification()} disabled={archiveVerificationRunning} style={{ height: 40, border: `1px solid ${archiveVerificationDone ? C.primary : C.g800}`, borderRadius: 999, background: archiveVerificationDone ? C.bg : C.white, color: archiveVerificationDone ? C.primary : C.g800, cursor: archiveVerificationRunning ? 'wait' : 'pointer', fontSize: 13, fontWeight: 900, fontFamily: 'inherit', padding: '0 16px', whiteSpace: 'nowrap', boxShadow: 'none' }}>{archiveVerificationLabel}</button>
          </div>
        </div>
        {showMatchReadyNotice && (<Card style={{ marginBottom: 16, padding: '14px 18px', background: C.bg, border: `1px solid ${C.light}` }}>
            <div data-ui="archive-screen.3" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div data-ui="archive-screen.4" style={{ fontSize: 15, fontWeight: 700, color: C.primary }}>
                {hasUncheckedMatchedFiles ? `관리자가 아직 확인하지 않은 매칭 파일 ${uncheckedMatchedFileCount}건이 있습니다.` : '매칭 검토가 완료되었습니다. 파일을 드래그해 다른 폴더로 이동할 수 있습니다.'}
              </div>
              <button data-ui="archive-screen.5" onClick={() => void dismissMatchReady()} disabled={checkingMatchedFiles} style={{ border: `1px solid ${C.light}`, borderRadius: 999, padding: '7px 11px', background: C.white, cursor: checkingMatchedFiles ? 'not-allowed' : 'pointer', color: checkingMatchedFiles ? C.g400 : C.primary, fontFamily: 'inherit', fontSize: 12, fontWeight: 900 }}>{checkingMatchedFiles ? '확인 중' : '확인'}</button>
            </div>
          </Card>)}

        {archiveLoadingMessage && <InlineLoader title={archiveLoadingMessage.title} body={archiveLoadingMessage.body}/>}
        <CenterModal open={Boolean(agentFailureTarget)} title="처리 실패" body={agentFailureTarget ? getAgentFailureMessage(agentFailureTarget) : ''} actionLabel="확인" onAction={() => setAgentFailureTarget(null)} />
        {matchingError && (
          <Card style={{ marginBottom: 12, padding: '12px 14px', background: C.dangerBg, border: '1px solid #FFCDD2' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: C.danger, lineHeight: 1.5 }}>{matchingError}</div>
              <button type="button" onClick={() => setMatchingError('')} style={{ border: 'none', background: 'transparent', color: C.g400, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
          </Card>
        )}
        {archiveActionError && (
          <Card style={{ marginBottom: 12, padding: '12px 14px', background: C.dangerBg, border: '1px solid #FFCDD2' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: C.danger, lineHeight: 1.5 }}>{archiveActionError}</div>
              <button type="button" onClick={() => setArchiveActionError('')} style={{ border: 'none', background: 'transparent', color: C.g400, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
          </Card>
        )}
        {matchingNotice && (
          <Card style={{ marginBottom: 12, padding: '12px 14px', background: C.bg, border: `1px solid ${C.light}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: C.primary, lineHeight: 1.5 }}>{matchingNotice}</div>
              <button type="button" onClick={() => setMatchingNotice('')} style={{ border: 'none', background: 'transparent', color: C.g400, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
          </Card>
        )}
        {photoValidationNotice && (
          <Card style={{ marginBottom: 12, padding: '12px 14px', background: photoValidationNotice.type === 'ok' ? '#F4FBF6' : C.dangerBg, border: `1px solid ${photoValidationNotice.type === 'ok' ? '#D6EEDB' : '#FFCDD2'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: photoValidationNotice.type === 'ok' ? C.ok : C.danger, lineHeight: 1.5 }}>{photoValidationNotice.message}</div>
              <button type="button" onClick={() => setPhotoValidationNotice(null)} style={{ border: 'none', background: 'transparent', color: C.g400, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
          </Card>
        )}
        {renderTodoPanel()}

        <div data-ui="archive-screen.6" className="screen-enter" style={{ paddingTop: 0 }}>
          <UsageDetailFileView cats={CATS} usageItems={resolvedUsageItems} selectedCatId={selectedHierarchyCatId} selectedUsageItemId={selectedUsageItemId} actionRequest={actionRequest} getFiles={getHierarchyFilesForCategory} isProblemFile={isProblemFile} isSupplementTarget={isSupplementTarget} onSelectCat={(catId) => {
                setSelectedHierarchyCatId(catId);
                setSelectedUsageItemId(resolvedUsageItems.find((item) => item.categoryId === catId)?.id || '');
            }} onSelectUsageItem={(item) => {
                setSelectedUsageItemId(item.id);
                setSelectedHierarchyCatId(item.categoryId);
            }} onRemove={removeHierarchyFile} onRename={renameHierarchyFile} onMove={moveHierarchyFile} onMoveUsageItem={moveUsageItem} onAddUsageItem={openAddUsageItemModal} onDeleteUsageItem={deleteUsageItem} onUpload={uploadFilesToSection} onPreviewFile={openFilePreview} onDownloadFile={openFileDownload} fileHeaderAction={uploadCompleteAction}/>
        </div>
      </div>

      <ArchivePreview hoverPreview={hoverPreview}/>

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
