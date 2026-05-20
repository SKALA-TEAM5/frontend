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
import { changeUsageStatementItemCategory, createUsageStatementItem, deleteEvidenceFileLink, deleteProjectFile, deleteUsageStatementItem, getProjectFileDownloadUrl, getProjectFilePreviewUrl, linkEvidenceFile, moveEvidenceFileLink, updateUsageStatementItem, uploadProjectFile, type SafetyDocAgentRequiredEvidenceMap } from '../../lib/archive-api';
import { listSafeLeeEvidenceRequirements, parseAndMatchEvidenceWithOcr, runAgent, safeLeeRequirementsToMap } from '../../lib/agent-api';
import { ApiClientError } from '../../lib/api-client';
import type { ArchiveSeed, EvidenceCategory, EvidenceFile, FolderEvidenceCategory } from '../../types/domain';
type ArchiveValidationStatus = 'idle' | 'running' | 'done';
interface ArchiveScreenProps {
    projectId: string;
    usageStatementId?: number;
    matchReady: boolean;
    uncheckedMatchedFileCount?: number;
    onDismissMatchReady: () => void | Promise<void>;
    archiveSeed: ArchiveSeed | null;
    usageItems?: UsageLineItem[];
    onUsageItemsChange?: (items: UsageLineItem[]) => void;
    onArchiveSeedChange?: (seed: ArchiveSeed) => void;
    onFilesUploaded?: (files: EvidenceFile[], context?: { categoryName: string; itemName: string }) => void;
    onArchiveContentMutated?: (mutation: 'upload' | 'delete' | 'move' | 'rename' | 'add-item' | 'edit-item' | 'delete-item') => void;
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
    categoryId?: number;
    usageItemId?: string;
    detail?: string;
};
type AddUsageItemDraft = {
    name: string;
    date: string;
    unit: string;
    quantity: string;
    unitPrice: string;
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
const isApiStatus = (error: unknown, status: number) => error instanceof ApiClientError && error.status === status;
const buildExampleRequiredEvidence = (items: UsageLineItem[]): SafetyDocAgentRequiredEvidenceMap => {
    const candidates = items.slice(0, 3);
    if (!candidates.length)
        return {};
    return candidates.reduce<SafetyDocAgentRequiredEvidenceMap>((result, item, index) => {
        result[item.id] = index === 0
            ? { receipt: ['영수증'], other_document: ['이체확인증'] }
            : index === 1
                ? { site_photo: ['현장사진'], other_document: ['지급대장'] }
                : { tax_invoice: ['세금계산서'], other_document: ['계약서'] };
        return result;
    }, {});
};
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
export default function ArchiveScreen({ projectId, usageStatementId, matchReady, uncheckedMatchedFileCount = 0, onDismissMatchReady, archiveSeed, usageItems = USAGE_LINE_ITEMS, onUsageItemsChange, onArchiveSeedChange, onFilesUploaded, onArchiveContentMutated, actionRequest, contentVisible = true, todoStorageKey, clearTodoSignal = 0, onTodoCountChange, onBackToOverview, uploadCompleteAction }: ArchiveScreenProps) {
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
    const [archiveVerificationStep, setArchiveVerificationStep] = useState<'ocr' | 'safety' | 'vision' | null>(null);
    const [photoValidationNotice, setPhotoValidationNotice] = useState<{ type: 'ok' | 'bad'; message: string } | null>(null);
    const [completedTodoIds, setCompletedTodoIds] = useState<Record<string, boolean>>(initialTodoState.completedTodoIds);
    const [agentFailureTarget, setAgentFailureTarget] = useState<AgentFailureTarget | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<{ kind: FolderEvidenceCategory; catId: number; fileId: string; usageItemId?: string } | null>(null);
    const [addUsageItemModalOpen, setAddUsageItemModalOpen] = useState(false);
    const [addUsageItemDraft, setAddUsageItemDraft] = useState<AddUsageItemDraft>({ name: '', date: new Date().toISOString().slice(0, 10), unit: 'EA', quantity: '1', unitPrice: '' });
    const [addUsageItemError, setAddUsageItemError] = useState('');
    const [classiAgentRunning, setClassiAgentRunning] = useState(false);
    const [todoSidebarOpen, setTodoSidebarOpen] = useState(false);
    const [selectedHierarchyCatId, setSelectedHierarchyCatId] = useState(resolvedUsageItems[0]?.categoryId || 1);
    const [selectedUsageItemId, setSelectedUsageItemId] = useState(resolvedUsageItems[0]?.id || '');
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
                            ? `${usageItem.name}은 ${categoryName || '해당 9개 항목'} 기준의 지출로 분류되어 ${evidenceName} 증빙이 필요합니다. 현재 연결된 ${EVIDENCE_KIND_LABELS[kind]} 증빙이 없거나 충족 처리되지 않아 보완 TODO로 표시했습니다.`
                            : `${evidenceName} 증빙이 필요하지만 현재 충족 처리되지 않아 보완 TODO로 표시했습니다.`,
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
            seen.add(todo.id);
            return true;
        });
    }, [actionRequest?.message, actionRequest?.title, fileData.categories, requiredEvidenceByLine, resolvedUsageItems]);
    const activeTodoCount = archiveTodoItems.filter((todo) => !completedTodoIds[todo.id]).length;
    useEffect(() => {
        onTodoCountChange?.(activeTodoCount);
    }, [activeTodoCount, onTodoCountChange]);
    const archiveVerificationRunning = Boolean(archiveVerificationStep) || matchingStatus === 'running' || photoValidationStatus === 'running';
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
    const editUsageItem = async (usageItemId: string, input: { categoryId: number; name: string; date: string; unit: string; quantity: number; unitPrice: number; amount: number }) => {
        const targetItem = resolvedUsageItems.find((item) => item.id === usageItemId);
        if (!targetItem)
            return;
        if (!usageStatementId) {
            const error = new Error('사용내역서 ID가 없어 세부항목을 수정할 수 없습니다.');
            setArchiveActionError(error.message);
            throw error;
        }
        setArchiveActionError('');
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
            setArchiveActionError(message);
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
        onArchiveContentMutated?.('edit-item');
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
            onArchiveContentMutated?.('add-item');
        } catch (error) {
            setAddUsageItemError(error instanceof Error ? error.message : '세부항목 추가에 실패했습니다.');
            setAddUsageItemModalOpen(true);
        } finally {
            setClassiAgentRunning(false);
        }
    };
    const deleteUsageItem = async (targetItem: UsageLineItem) => {
        if (!usageStatementId) {
            setArchiveActionError('사용내역서 ID가 없어 세부항목을 삭제할 수 없습니다.');
            return;
        }
        setArchiveActionError('');
        try {
            await deleteUsageStatementItem(projectId, usageStatementId, targetItem.id);
        } catch (error) {
            setArchiveActionError(error instanceof Error ? error.message : '세부항목 삭제에 실패했습니다.');
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
        onArchiveContentMutated?.('delete-item');
    };
    const isProblemFile = (file: EvidenceFile) => file.kind === 'site_photo' && file.visionValidation?.status === 'unsuitable';
    const hasUncheckedMatchedFiles = uncheckedMatchedFileCount > 0;
    const showMatchReadyNotice = matchReady || hasUncheckedMatchedFiles;
    const archiveLoadingMessage = checkingMatchedFiles
        ? {
            title: '매칭 파일 확인을 반영하고 있어요',
            body: '검토 완료 상태를 저장하고 세부 내역 화면을 갱신하고 있습니다.',
        }
        : archiveVerificationStep === 'ocr'
            ? {
                title: 'OCR 매칭 결과를 확인하고 있어요',
                body: '영수증과 사용내역서의 날짜, 빈값, 연결 가능성을 link agent가 먼저 점검합니다.',
            }
            : archiveVerificationStep === 'safety'
                ? {
                    title: '필수 증빙 규칙을 대조하고 있어요',
                    body: 'safety_doc_agent가 세부 항목별로 필요한 증빙과 보완 대상을 확인합니다.',
                }
                : archiveVerificationStep === 'vision'
                    ? {
                        title: '현장사진을 확인하고 있어요',
                        body: 'vision model이 사진 속 현장 상태와 세부 항목의 적합성을 판단합니다.',
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
            await Promise.all(resolvedUsageItems.map((item) => runAgent(projectId, 'safety_doc', {
                usageStatementId,
                usageStatementItemId: item.id,
            })));
            const agentRequiredEvidence = await loadStoredRequirements();
            setRequiredEvidenceByLine(agentRequiredEvidence);
            setMatchingStatus('done');
            setMatchingNotice(Object.keys(agentRequiredEvidence).length
                ? 'Safety Doc Agent 실행 후 저장된 필수 증빙을 반영했습니다.'
                : 'Safety Doc Agent가 추가로 요구한 증빙이 없습니다.');
        } catch (error) {
            if (isApiStatus(error, 501)) {
                const storedRequiredEvidence = await loadStoredRequirements();
                if (!Object.keys(storedRequiredEvidence).length) {
                    setRequiredEvidenceByLine(buildExampleRequiredEvidence(resolvedUsageItems));
                    setFileData((current) => normalizeArchiveData(current));
                }
                setMatchingStatus('done');
                setMatchingNotice(Object.keys(storedRequiredEvidence).length
                    ? 'Safety Doc Agent 실행 API가 아직 구현되지 않아 저장된 필수 증빙 데이터를 표시합니다.'
                    : 'Safety Doc Agent 실행 API가 아직 구현되지 않아 예시 필수 증빙 결과를 표시합니다.');
                return;
            }
            const storedRequiredEvidence = await loadStoredRequirements();
            if (!Object.keys(storedRequiredEvidence).length) {
                setRequiredEvidenceByLine(buildExampleRequiredEvidence(resolvedUsageItems));
                setFileData((current) => normalizeArchiveData(current));
            }
            setMatchingStatus('done');
            setMatchingNotice('Safety Doc Agent 응답을 받지 못해 예시 필수 증빙 결과를 표시합니다.');
        }
    };
    const runVisionPhotoValidation = async () => {
        if (photoValidationStatus === 'running')
            return;
        if (!usageStatementId) {
            setAgentFailureTarget('photo-validation');
            return;
        }
        const applyExampleVisionValidation = () => {
            const today = new Date().toISOString().slice(0, 10);
            const fallbackItem = resolvedUsageItems[0];
            commitFileData((prev) => {
                const next: ArchiveSeed = { ...prev, categories: { ...(prev.categories || {}) } };
                let applied = false;
                Object.entries(next.categories).forEach(([catId, lineMap]) => {
                    next.categories[catId] = { ...lineMap };
                    Object.entries(lineMap).forEach(([usageItemId, kindMap]) => {
                        const photos = kindMap.site_photo || [];
                        if (!photos.length)
                            return;
                        const usageItem = resolvedUsageItems.find((item) => item.id === usageItemId);
                        next.categories[catId][usageItemId] = {
                            ...kindMap,
                            site_photo: photos.map((file, index) => ({
                                ...file,
                                visionValidation: index === 0 && !applied
                                    ? {
                                        status: 'unsuitable',
                                        checkedAt: today,
                                        itemName: usageItem?.name || '현장사진',
                                        summary: '예시 비전 검증 결과, 작업자 안전벨트 착용 여부가 불명확하고 촬영 각도가 지출 항목 확인에 부족합니다.',
                                        detections: [
                                            { label: 'worker', confidence: 0.91, box: [18, 16, 42, 70], status: 'ok' },
                                            { label: 'safety_belt', confidence: 0.38, box: [25, 44, 38, 58], status: 'bad' },
                                        ],
                                    }
                                    : file.visionValidation || {
                                        status: 'suitable',
                                        checkedAt: today,
                                        itemName: usageItem?.name || '현장사진',
                                        summary: '예시 비전 검증 결과, 현장 상태와 지출 항목이 확인됩니다.',
                                        detections: [{ label: 'site', confidence: 0.87, box: [8, 10, 86, 78], status: 'ok' }],
                                    },
                            })),
                        };
                        applied = true;
                    });
                });
                if (!applied && fallbackItem) {
                    const catId = String(fallbackItem.categoryId);
                    const lineMap = { ...(next.categories[catId] || {}) };
                    const kindMap = { ...(lineMap[fallbackItem.id] || {}) };
                    lineMap[fallbackItem.id] = {
                        ...kindMap,
                        site_photo: [
                            ...(kindMap.site_photo || []),
                            {
                                id: `example-vision-${fallbackItem.id}`,
                                name: '예시_현장사진_비전검증.jpg',
                                kind: 'site_photo',
                                uploadedAt: today,
                                uploadedBy: '예시 데이터',
                                categoryIds: [fallbackItem.categoryId],
                                usageItemIds: [fallbackItem.id],
                                visionValidation: {
                                    status: 'unsuitable',
                                    checkedAt: today,
                                    itemName: fallbackItem.name,
                                    summary: '예시 비전 검증 결과, 사진만으로 실제 설치 상태와 보호구 착용 여부를 충분히 확인하기 어렵습니다.',
                                    detections: [
                                        { label: 'site_photo', confidence: 0.82, box: [10, 12, 88, 76], status: 'ok' },
                                        { label: 'required_object', confidence: 0.31, box: [42, 28, 64, 58], status: 'bad' },
                                    ],
                                },
                            },
                        ],
                    };
                    next.categories[catId] = lineMap;
                }
                return next;
            });
        };
        setPhotoValidationNotice(null);
        setPhotoValidationStatus('running');
        try {
            await runAgent(projectId, 'validator', {
                usageStatementId,
                options: { scope: 'site_photo' },
            });
            setPhotoValidationStatus('done');
            setPhotoValidationNotice({ type: 'ok', message: '사진 검증 Agent 실행 결과가 저장되었습니다.' });
        } catch {
            applyExampleVisionValidation();
            setPhotoValidationStatus('done');
            setPhotoValidationNotice({ type: 'ok', message: '사진 검증 Agent 응답을 받지 못해 예시 검증 결과를 표시합니다.' });
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
            setMatchingNotice('OCR/link agent 응답을 받지 못해 예시 매칭 흐름으로 계속 진행합니다.');
        });
    };
    const runArchiveVerification = async () => {
        if (archiveVerificationRunning)
            return;
        setArchiveVerificationStep('ocr');
        try {
            const ocrTask = runOcrLinkValidation();
            const safetyTask = runSafetyDocMatching();
            const visionTask = runVisionPhotoValidation();
            await waitForVerificationStep(1800);
            await ocrTask;
            setArchiveVerificationStep('safety');
            await waitForVerificationStep(2100);
            await safetyTask;
            setArchiveVerificationStep('vision');
            await waitForVerificationStep(2100);
            await visionTask;
        } finally {
            setArchiveVerificationStep(null);
        }
    };
    const renderTodoList = (items: ArchiveTodoItem[]) => (
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
                padding: '9px 10px',
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
                    left: 10,
                    right: 10,
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
        const items = archiveTodoItems.filter((todo) => todo.kind === kind);
        if (!items.length)
            return null;
        const activeCount = items.filter((todo) => !completedTodoIds[todo.id]).length;
        return (
          <div key={kind} style={{ border: `1px solid ${C.g200}`, borderRadius: 6, background: C.white, padding: 8, display: 'grid', gap: 7, marginBottom: 8, position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: activeCount ? C.g800 : C.g400 }}>{EVIDENCE_KIND_LABELS[kind]}</div>
              <div style={{ minWidth: 20, height: 18, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px', background: C.white, color: activeCount ? C.primary : C.g400, border: `1px solid ${C.g200}`, fontSize: 10, fontWeight: 900 }}>{activeCount}</div>
            </div>
            {renderTodoList(items)}
          </div>
        );
    };
    const renderTodoSidebar = () => {
        if (!archiveTodoItems.length)
            return null;
        return (
          <>
            {todoSidebarOpen && (
              <button type="button" aria-label="보완 TODO 닫기" onClick={() => setTodoSidebarOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 53, border: 'none', background: 'transparent', cursor: 'default' }} />
            )}
            {todoSidebarOpen && (
              <aside data-ui="archive-screen.todo-panel" style={{ position: 'fixed', top: 'calc(var(--app-header-height) + 76px)', right: 48, width: 360, maxWidth: 'calc(100vw - 68px)', height: 'min(620px, calc(100vh - var(--app-header-height) - 104px))', zIndex: 54, border: `1px solid ${C.g200}`, borderRadius: '16px 0 0 16px', background: C.white, boxShadow: '0 22px 48px rgba(31,47,39,.14)', overflow: 'hidden', display: 'grid', gridTemplateRows: 'auto minmax(0,1fr)' }}>
                <div style={{ position: 'sticky', top: 0, zIndex: 2, background: C.white, borderBottom: `1px solid ${C.g200}`, padding: '16px 16px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: C.g800 }}>보완 TODO</div>
                    <div style={{ fontSize: 12, fontWeight: 900, color: C.primary }}>{activeTodoCount}건</div>
                  </div>
                </div>
                <div className="archive-todo-scroll" style={{ overflowY: 'auto', overflowX: 'hidden', padding: 14, scrollbarWidth: 'thin', scrollbarColor: `${C.g200} transparent`, background: C.white }}>
                  {EVIDENCE_SECTIONS.map((section) => renderTodoGroup(section.id))}
                </div>
              </aside>
            )}
            <aside data-ui="archive-screen.todo-rail" style={{ position: 'fixed', top: 'calc(var(--app-header-height) + 76px)', right: 0, width: 45, height: 180, zIndex: 54, border: `1px solid ${C.g200}`, borderRight: 'none', borderRadius: '14px 0 0 14px', background: C.white, boxShadow: '-10px 0 28px rgba(31,47,39,.10)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '10px 6px' }}>
              <button type="button" aria-label={todoSidebarOpen ? '보완 TODO 접기' : '보완 TODO 펼치기'} onClick={() => setTodoSidebarOpen((open) => !open)} style={{ width: 34, height: 34, border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.primary, cursor: 'pointer', fontSize: 20, fontWeight: 900, lineHeight: 1, boxShadow: '0 8px 18px rgba(31,47,39,.10)' }}>
                {todoSidebarOpen ? '»' : '«'}
              </button>
              <div style={{ width: 30, borderTop: `1px solid ${C.g200}` }} />
              <button type="button" onClick={() => setTodoSidebarOpen(true)} style={{ width: 36, minHeight: 92, border: 'none', borderRadius: 10, background: todoSidebarOpen ? C.g100 : 'transparent', color: C.g800, cursor: 'pointer', fontFamily: 'inherit', display: 'grid', placeItems: 'center', gap: 5, padding: '7px 3px' }}>
                <span aria-hidden="true" style={{ width: 23, height: 23, borderRadius: 999, border: `2px solid ${C.primary}`, background: C.white, color: C.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900 }}>{activeTodoCount}</span>
                <span style={{ fontSize: 10, fontWeight: 900, lineHeight: 1.2, writingMode: 'vertical-rl', letterSpacing: 0 }}>보완 TODO</span>
              </button>
            </aside>
          </>
        );
    };
    const archiveVerificationStepIndex = archiveVerificationStep === 'ocr' ? 0 : archiveVerificationStep === 'safety' ? 1 : archiveVerificationStep === 'vision' ? 2 : -1;
    const renderArchiveVerificationLoader = () => {
        if (!archiveVerificationStep || !archiveLoadingMessage)
            return null;
        const steps = [
            { id: 'ocr', label: 'OCR/link agent' },
            { id: 'safety', label: 'safety_doc_agent' },
            { id: 'vision', label: 'vision model' },
        ];
        return (
          <div className="archive-verification-loader">
            <div className="archive-loader-ocean" aria-hidden="true">
              <div className="archive-loader-wave archive-loader-wave-a" />
              <div className="archive-loader-wave archive-loader-wave-b" />
              <div className="archive-loader-turtle" />
              <div className="archive-loader-island">
                <span className="archive-loader-palm" />
              </div>
            </div>
            <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: C.g800 }}>{archiveLoadingMessage.title}</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.g600, lineHeight: 1.55 }}>{archiveLoadingMessage.body}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 4 }}>
                {steps.map((step, index) => {
                    const active = index === archiveVerificationStepIndex;
                    const done = index < archiveVerificationStepIndex;
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
    return (<div data-ui="archive-screen.1" style={{ background: 'transparent', position: 'relative' }}>
      {contentVisible && renderTodoSidebar()}
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

        {checkingMatchedFiles && archiveLoadingMessage && <InlineLoader title={archiveLoadingMessage.title} body={archiveLoadingMessage.body}/>}
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
        <div data-ui="archive-screen.6" className="screen-enter" style={{ paddingTop: 0, position: 'relative', minHeight: 560 }}>
          <UsageDetailFileView cats={CATS} usageItems={resolvedUsageItems} selectedCatId={selectedHierarchyCatId} selectedUsageItemId={selectedUsageItemId} actionRequest={actionRequest} getFiles={getHierarchyFilesForCategory} isProblemFile={isProblemFile} isSupplementTarget={isSupplementTarget} onSelectCat={(catId) => {
                setSelectedHierarchyCatId(catId);
                setSelectedUsageItemId(resolvedUsageItems.find((item) => item.categoryId === catId)?.id || '');
            }} onSelectUsageItem={(item) => {
                setSelectedUsageItemId(item.id);
                setSelectedHierarchyCatId(item.categoryId);
            }} onRemove={removeHierarchyFile} onRename={renameHierarchyFile} onMove={moveHierarchyFile} onEditUsageItem={editUsageItem} onAddUsageItem={openAddUsageItemModal} onDeleteUsageItem={deleteUsageItem} onUpload={uploadFilesToSection} onDownloadFile={openFileDownload} fileHeaderAction={uploadCompleteAction}/>
          {archiveVerificationStep && archiveLoadingMessage && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'grid', placeItems: 'center', padding: 24, background: 'rgba(247, 252, 248, .62)', backdropFilter: 'blur(1px)' }}>
              <div style={{ width: 'min(100%, 540px)', background: C.white, borderRadius: 18, border: `1px solid ${C.g200}`, boxShadow: '0 18px 44px rgba(0,0,0,.18)', padding: 22 }}>
                {renderArchiveVerificationLoader()}
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
