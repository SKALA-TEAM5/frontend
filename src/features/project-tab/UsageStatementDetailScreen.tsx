import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import CenterModal from '../../components/ui/CenterModal';
import { C } from '../../lib/theme';
import { getAgentFailureMessage, type AgentFailureTarget } from '../../lib/agent-failure';
import { CATS, USAGE_LINE_ITEMS, createDefaultArchiveData, createEntryFromFile, normalizeArchiveData, type UsageLineItem } from '../../lib/evidence-utils';
import UsageDetailFileView, { type HierarchyEvidenceKind } from './UsageDetailFileView';
import UsageDetailTodoSidebar from './usage-detail/UsageDetailTodoSidebar';
import { UsageDetailNotices, UsageDetailVerificationOverlay } from './usage-detail/UsageDetailFeedback';
import { UsageStatementAddItemModal, UsageStatementClassiModals, UsageStatementDeleteModals } from './usage-detail/UsageDetailModals';
import type { AddUsageItemDraft, ClassiRejectedNotice, ClassificationMoveNotice, UsageDetailTodoItem } from './usage-detail/usage-statement-detail-types';
import { classifyUsageLineCategory } from './usage-detail/usage-detail-todo-utils';
import { applyVisionValidationToArchive, findUsageDetailFile, getUsageDetailFiles, moveUsageDetailFileInArchive, moveUsageItemFilesToCategory, removeUsageDetailFileFromArchive, removeUsageItemFilesFromArchive, renameUsageDetailFileInArchive } from './usage-detail/usage-detail-file-utils';
import { buildClassiRejectedNotice, buildClassificationMoveNotices, findRejectedClassiResult, validateAddUsageItemDraft } from './usage-detail/usage-detail-item-utils';
import useUsageDetailVerification from './usage-detail/useUsageDetailVerification';
import useUsageDetailTodos from './usage-detail/useUsageDetailTodos';
import { backendEvidenceTypeToCategory, changeUsageStatementItemCategory, createUsageStatementItem, deleteEvidenceFileLink, deleteProjectFile, deleteUsageStatementItem, getProjectFileDownloadUrl, getProjectFilePreviewUrl, getUsageStatementArchiveById, isBackendEvidenceTypeCode, linkEvidenceFile, moveEvidenceFileLink, updateProjectFileName, updateUsageStatementItem, uploadEvidenceFileToItem } from '../../lib/archive-api';
import type { VisionValidationResult } from '../../lib/agent-api';
import type { ArchiveSeed, EvidenceFile, FolderEvidenceCategory } from '../../types/domain';
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
    onVerificationComplete?: () => void | Promise<void>;
    uploadCompleteAction?: ReactNode;
    readOnly?: boolean;
    readOnlyReason?: string;
}
const isWearingPhotoContext = (kind: FolderEvidenceCategory, catId: number, itemName?: string) => (
    kind === 'site_photo'
    && (catId === 3 || /보호구|착용|안전모|안전화|안전벨트|장갑|마스크|조끼|개인보호/.test(itemName || ''))
);
const getDefaultEvidenceTypeCode = (
    kind: FolderEvidenceCategory,
    catId: number,
    itemName?: string,
    preferredEvidenceTypeCode?: string | null,
) => {
    if (isWearingPhotoContext(kind, catId, itemName))
        return 'wearing_photo';
    if (isBackendEvidenceTypeCode(preferredEvidenceTypeCode) && backendEvidenceTypeToCategory(preferredEvidenceTypeCode) === kind)
        return preferredEvidenceTypeCode;
    return undefined;
};
export default function UsageStatementDetailScreen({ projectId, usageStatementId, usageDetailSeed, usageItems = USAGE_LINE_ITEMS, onUsageItemsChange, onUsageDetailSeedChange, onFilesUploaded, onUsageDetailContentMutated, actionRequest, contentVisible = true, todoStorageKey, clearTodoSignal = 0, onTodoCountChange, onVerificationComplete, uploadCompleteAction, readOnly = false, readOnlyReason }: UsageStatementDetailScreenProps) {
    const resolvedUsageItems = usageItems.length ? usageItems : USAGE_LINE_ITEMS;
    const [fileData, setFileData] = useState<ArchiveSeed>(() => normalizeArchiveData(usageDetailSeed || createDefaultArchiveData()));
    const [usageDetailActionError, setUsageDetailActionError] = useState('');
    const [agentFailureTarget, setAgentFailureTarget] = useState<AgentFailureTarget | null>(null);
    const [agentFailureMessage, setAgentFailureMessage] = useState('');
    const [deleteTarget, setDeleteTarget] = useState<{ kind: FolderEvidenceCategory; catId: number; fileId: string; usageItemId?: string } | null>(null);
    const [deleteUsageItemTarget, setDeleteUsageItemTarget] = useState<UsageLineItem | null>(null);
    const [addUsageItemModalOpen, setAddUsageItemModalOpen] = useState(false);
    const [addUsageItemDraft, setAddUsageItemDraft] = useState<AddUsageItemDraft>({ name: '', date: new Date().toISOString().slice(0, 10), unit: 'EA', quantity: '1', unitPrice: '' });
    const [addUsageItemError, setAddUsageItemError] = useState('');
    const [classiAgentRunning, setClassiAgentRunning] = useState(false);
    const showAgentFailure = (target: AgentFailureTarget, error?: unknown) => {
        setAgentFailureTarget(target);
        setAgentFailureMessage(getAgentFailureMessage(target, error));
    };
    const [classificationMoveNotices, setClassificationMoveNotices] = useState<ClassificationMoveNotice[]>([]);
    const [classiRejectedNotice, setClassiRejectedNotice] = useState<ClassiRejectedNotice | null>(null);
    const [todoSidebarOpen, setTodoSidebarOpen] = useState(false);
    const [todoSidebarPinned, setTodoSidebarPinned] = useState(false);
    const [todoHoverBlocked, setTodoHoverBlocked] = useState(false);
    const [collapsedTodoGroupIds, setCollapsedTodoGroupIds] = useState<Record<string, boolean>>({});
    const [selectedHierarchyCatId, setSelectedHierarchyCatId] = useState(1);
    const [selectedUsageItemId, setSelectedUsageItemId] = useState('');
    const pendingUsageDetailSeedRef = useRef<ArchiveSeed | null>(null);
    const syncingUsageDetailSeedRef = useRef(false);
    const usageDetailSeedSnapshotRef = useRef('');
    const clearTodoSignalRef = useRef(clearTodoSignal);
    const selectionInitializedRef = useRef(false);
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
        selectionInitializedRef.current = false;
        setSelectedHierarchyCatId(1);
        setSelectedUsageItemId('');
    }, [usageStatementId]);
    useEffect(() => {
        if (selectionInitializedRef.current || !resolvedUsageItems.length)
            return;
        const firstPopulatedCategory = CATS.find((cat) => resolvedUsageItems.some((item) => item.categoryId === cat.id));
        const firstCategoryId = firstPopulatedCategory?.id || 1;
        const firstUsageItem = resolvedUsageItems.find((item) => item.categoryId === firstCategoryId);
        setSelectedHierarchyCatId(firstCategoryId);
        setSelectedUsageItemId(firstUsageItem?.id || '');
        selectionInitializedRef.current = true;
    }, [resolvedUsageItems, usageStatementId]);
    useEffect(() => {
        if (!resolvedUsageItems.length) {
            setSelectedUsageItemId('');
            return;
        }
        const categoryItems = resolvedUsageItems.filter((item) => item.categoryId === selectedHierarchyCatId);
        if (!categoryItems.length) {
            setSelectedUsageItemId('');
            return;
        }
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
        return getUsageDetailFiles(fileData, kind, catId, usageItemId);
    };
    const getHierarchyFilesForCategory = (kind: HierarchyEvidenceKind, catId: number, usageItemId?: string) => {
        if (kind === 'misc')
            return [];
        const files = getFilesForCategory(kind, catId, usageItemId);
        if (kind !== 'site_photo')
            return files;
        return files;
    };
    const todos = useUsageDetailTodos({
        projectId,
        usageStatementId,
        todoStorageKey,
        actionRequest,
        fileCategories: fileData.categories,
        usageItems: resolvedUsageItems,
        onTodoCountChange,
        onActionError: setUsageDetailActionError,
    });
    const applyVisionValidationResults = (nextTodos: UsageDetailTodoItem[] = todos.orchestratorTodoItems, validationByFileId: Record<string, VisionValidationResult> = todos.visionValidationByFileId) => {
        commitFileData((prev) => applyVisionValidationToArchive(prev, {
            usageItems: resolvedUsageItems,
            todos: nextTodos,
            validationByFileId,
        }));
    };
    const refreshUsageDetailArchive = async () => {
        if (!usageStatementId)
            return;
        const latestArchive = await getUsageStatementArchiveById(projectId, usageStatementId).catch(() => null);
        if (!latestArchive)
            return;
        const normalizedSeed = normalizeArchiveData(latestArchive.archiveSeed);
        commitFileData(() => normalizedSeed);
    };
    const verification = useUsageDetailVerification({
        projectId,
        usageStatementId,
        refreshOrchestratorStatusTodos: todos.refreshOrchestratorStatusTodos,
        refreshVisionValidationResults: todos.refreshVisionValidationResults,
        applyVisionValidationResults,
        onVerificationComplete: async () => {
            await refreshUsageDetailArchive();
            await onVerificationComplete?.();
        },
        onMissingUsageStatement: () => showAgentFailure('evidence-matching'),
    });
    useEffect(() => {
        const hasStoredVisionResults = Object.keys(todos.visionValidationByFileId).length > 0;
        const hasVisionTodos = todos.orchestratorTodoItems.some((todo) => todo.source === 'vision');
        if (!hasStoredVisionResults && !hasVisionTodos)
            return;
        applyVisionValidationResults(todos.orchestratorTodoItems, todos.visionValidationByFileId);
    }, [todos.visionValidationByFileId, todos.orchestratorTodoItems]);
    useEffect(() => {
        if (clearTodoSignalRef.current === clearTodoSignal)
            return;
        clearTodoSignalRef.current = clearTodoSignal;
        todos.dismissCompletedLocalTodos();
        verification.resetVerificationState();
    }, [clearTodoSignal, todos, verification]);
    const uploadFilesToSection = (kind: FolderEvidenceCategory, catId: number, usageItemId: string) => {
        if (!usageItemId)
            return;
        const usageItem = resolvedUsageItems.find((item) => item.id === usageItemId);
        const matchingRequiredEvidenceTypeCodes = (todos.requiredEvidenceByLine[usageItemId]?.[kind] || [])
            .filter((code) => isBackendEvidenceTypeCode(code) && backendEvidenceTypeToCategory(code) === kind);
        const requiredEvidenceTypeCode = matchingRequiredEvidenceTypeCodes.find((code) => code !== kind) || matchingRequiredEvidenceTypeCodes[0];
        const evidenceTypeCode = getDefaultEvidenceTypeCode(kind, catId, usageItem?.name, requiredEvidenceTypeCode);
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        if (kind !== 'other_document') {
            input.accept = kind === 'site_photo' ? 'image/*' : 'image/*,.pdf,.xlsx';
        }
        input.onchange = async (event) => {
            const pickedFiles = Array.from((event.target as HTMLInputElement).files || []);
            if (!pickedFiles.length)
                return;
            setUsageDetailActionError('');
            try {
                const nextEntries = await Promise.all(pickedFiles.map(async (file) => {
                    const uploadedEntry = await uploadEvidenceFileToItem(projectId, usageItemId, file, kind, evidenceTypeCode);
                    if (!uploadedEntry.fileId)
                        return createEntryFromFile(file, kind, { ...uploadedEntry, evidenceTypeCode, categoryIds: [catId], usageItemIds: [usageItemId] });
                    return {
                        ...uploadedEntry,
                        kind,
                        evidenceTypeCode: uploadedEntry.evidenceTypeCode || evidenceTypeCode,
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
    const renameUsageDetailFile = async (kind: FolderEvidenceCategory, catId: number, fileId: string, nextName: string, usageItemId?: string) => {
        const trimmedName = nextName.trim();
        if (!trimmedName)
            return;
        const targetFile = findUsageDetailFile(fileData, kind, catId, fileId, usageItemId);
        setUsageDetailActionError('');
        try {
            if (targetFile?.fileId) {
                await updateProjectFileName(projectId, targetFile.fileId, trimmedName);
            }
        } catch (error) {
            setUsageDetailActionError(error instanceof Error ? error.message : '파일명 수정에 실패했습니다.');
            return;
        }
        commitFileData((prev) => renameUsageDetailFileInArchive(prev, { kind, catId, fileId, nextName: trimmedName, usageItemId }));
        onUsageDetailContentMutated?.('rename');
    };
    const confirmRemoveArchiveFile = async () => {
        if (!deleteTarget)
            return;
        const { kind, catId, fileId, usageItemId } = deleteTarget;
        const targetFile = findUsageDetailFile(fileData, kind, catId, fileId, usageItemId);
        setUsageDetailActionError('');
        try {
            if (targetFile?.linkId) {
                await deleteEvidenceFileLink(projectId, targetFile.linkId);
            }
            if (targetFile?.fileId) {
                await deleteProjectFile(projectId, targetFile.fileId);
            }
        } catch (error) {
            setUsageDetailActionError(error instanceof Error ? error.message : '파일 삭제에 실패했습니다.');
            return;
        }
        commitFileData((prev) => removeUsageDetailFileFromArchive(prev, { kind, catId, fileId, usageItemId }));
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
            void renameUsageDetailFile(kind, catId, file.id, nextName, usageItemId);
    };
    const moveHierarchyFile = async (fromKind: HierarchyEvidenceKind, fromCatId: number, fromUsageItemId: string, toKind: HierarchyEvidenceKind, toCatId: number, fileEntry: EvidenceFile, toUsageItemId?: string) => {
        if (fromKind === toKind && fromCatId === toCatId && fromUsageItemId === toUsageItemId)
            return;
        if (fromKind === 'misc' || toKind === 'misc')
            return;
        const targetUsageItemId = toUsageItemId || resolvedUsageItems.find((item) => item.categoryId === toCatId)?.id || `cat-${toCatId}`;
        const targetUsageItem = resolvedUsageItems.find((item) => item.id === targetUsageItemId);
        const evidenceTypeCode = getDefaultEvidenceTypeCode(toKind, toCatId, targetUsageItem?.name, fileEntry.evidenceTypeCode);
        setUsageDetailActionError('');
        let movedLinkId = fileEntry.linkId;
        try {
            if (fileEntry.linkId) {
                const link = await moveEvidenceFileLink(projectId, fileEntry.linkId, targetUsageItemId, toKind, evidenceTypeCode);
                movedLinkId = link.linkId || fileEntry.linkId;
            } else if (fileEntry.fileId) {
                const link = await linkEvidenceFile(projectId, targetUsageItemId, fileEntry.fileId, toKind, evidenceTypeCode);
                movedLinkId = link.linkId;
            }
        } catch (error) {
            setUsageDetailActionError(error instanceof Error ? error.message : '파일 이동에 실패했습니다.');
            return;
        }
        commitFileData((prev) => moveUsageDetailFileInArchive(prev, { fromKind, fromCatId, fromUsageItemId, toKind, toCatId, targetUsageItemId, fileEntry, movedLinkId, evidenceTypeCode }));
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
            commitFileData((prev) => moveUsageItemFilesToCategory(prev, usageItemId, targetItem.categoryId, nextItem.categoryId));
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
        const validation = validateAddUsageItemDraft(addUsageItemDraft, usageStatementId);
        if ('error' in validation) {
            setAddUsageItemError(validation.error);
            return;
        }
        const { name, quantity, unitPrice, amount, usedOn, unit } = validation.value;
        setAddUsageItemError('');
        setAddUsageItemModalOpen(false);
        setClassiAgentRunning(true);
        try {
            const categoryId = classifyUsageLineCategory(name, selectedHierarchyCatId);
            const classiResult = await createUsageStatementItem(projectId, usageStatementId, {
                categoryId,
                itemName: name,
                usedOn,
                unit,
                quantity,
                unitPrice,
                totalAmount: amount,
                pageNo: 1,
            });
            const rejectedResult = findRejectedClassiResult(classiResult);
            if (rejectedResult) {
                if (rejectedResult.itemId) {
                    await deleteUsageStatementItem(projectId, usageStatementId, rejectedResult.itemId).catch(() => null);
                }
                setClassiRejectedNotice(buildClassiRejectedNotice({
                    result: rejectedResult,
                    fallbackName: name,
                    selectedCategoryId: selectedHierarchyCatId,
                    fallbackCategoryId: categoryId,
                }));
                return;
            }
            const refreshedArchive = await getUsageStatementArchiveById(projectId, usageStatementId);
            const addedItem = refreshedArchive.usageItems
                .filter((item) => item.name === name && item.date === usedOn)
                .at(-1) || refreshedArchive.usageItems.at(-1);
            onUsageItemsChange?.(refreshedArchive.usageItems);
            onUsageDetailSeedChange?.(refreshedArchive.archiveSeed);
            if (addedItem) {
                setSelectedHierarchyCatId(addedItem.categoryId || categoryId);
                setSelectedUsageItemId(addedItem.id);
            }
            setClassificationMoveNotices(buildClassificationMoveNotices({
                result: classiResult,
                itemName: name,
                selectedCategoryId: selectedHierarchyCatId,
                fallbackCategoryId: categoryId,
                addedItem,
            }));
            onUsageDetailContentMutated?.('add-item');
        } catch (error) {
            setAddUsageItemError(error instanceof Error ? error.message : '세부항목 추가에 실패했습니다.');
            setAddUsageItemModalOpen(true);
        } finally {
            setClassiAgentRunning(false);
        }
    };
    const requestDeleteUsageItem = (targetItem: UsageLineItem) => {
        setDeleteUsageItemTarget(targetItem);
    };
    const confirmDeleteUsageItem = async () => {
        const targetItem = deleteUsageItemTarget;
        if (!targetItem)
            return;
        if (!usageStatementId) {
            setUsageDetailActionError('사용내역서 ID가 없어 세부항목을 삭제할 수 없습니다.');
            setDeleteUsageItemTarget(null);
            return;
        }
        setUsageDetailActionError('');
        try {
            await deleteUsageStatementItem(projectId, usageStatementId, targetItem.id);
        } catch (error) {
            setUsageDetailActionError(error instanceof Error ? error.message : '세부항목 삭제에 실패했습니다.');
            setDeleteUsageItemTarget(null);
            return;
        }
        const nextItems = resolvedUsageItems.filter((item) => item.id !== targetItem.id);
        setDeleteUsageItemTarget(null);
        onUsageItemsChange?.(nextItems);
        commitFileData((prev) => removeUsageItemFilesFromArchive(prev, targetItem));
        todos.removeTodoStateForUsageItem(targetItem.id);
        const nextSelected = nextItems.find((item) => item.categoryId === targetItem.categoryId) || nextItems[0];
        setSelectedHierarchyCatId(nextSelected?.categoryId || 1);
        setSelectedUsageItemId(nextSelected?.id || '');
        onUsageDetailContentMutated?.('delete-item');
    };
    const isProblemFile = (file: EvidenceFile) => file.kind === 'site_photo' && file.visionValidation?.status === 'unsuitable';
    return (<div data-ui="usage-detail-screen.1" style={{ background: 'transparent', position: 'relative' }}>
      <UsageDetailTodoSidebar
        visible={contentVisible}
        open={todoSidebarOpen}
        pinned={todoSidebarPinned}
        hoverBlocked={todoHoverBlocked}
        activeTodoCount={todos.activeTodoCount}
        groups={todos.todoGroups}
        collapsedGroupIds={collapsedTodoGroupIds}
        confirmingIds={todos.todoConfirmingIds}
        isTodoDone={todos.isTodoDone}
        getTodoConfirmingKey={todos.getTodoConfirmingKey}
        getTodoDisplayTitle={todos.getTodoDisplayTitle}
        onTodoToggle={(todo) => void todos.handleTodoToggle(todo)}
        onGroupToggle={(groupId) => setCollapsedTodoGroupIds((current) => ({ ...current, [groupId]: !current[groupId] }))}
        onPin={() => setTodoSidebarPinned(true)}
        onCollapse={() => {
          setTodoSidebarPinned(false);
          setTodoSidebarOpen(false);
          setTodoHoverBlocked(true);
        }}
        onRailEnter={() => setTodoSidebarOpen(true)}
        onRailLeave={() => setTodoHoverBlocked(false)}
        onRailOpen={() => {
          setTodoHoverBlocked(false);
          setTodoSidebarPinned(true);
          setTodoSidebarOpen(true);
        }}
      />
      <div data-ui="usage-detail-screen.2" className="screen-enter" style={{ display: contentVisible ? 'grid' : 'none', gap: 12, minWidth: 0 }}>
        <div data-ui="usage-detail-screen.detail-header" style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto', alignItems: 'center', gap: 10, marginBottom: 4, minWidth: 0 }}>
          <div style={{ minWidth: 0, display: 'inline-flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: C.g800, whiteSpace: 'nowrap' }}>세부 내역</div>
            <div style={{ fontSize: 13, color: C.g400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>사용내역서 세부 내역 및 증빙 파일 보기</div>
          </div>
          <div />
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => { if (!readOnly) void verification.run(); }} disabled={readOnly || verification.running} title={readOnly ? readOnlyReason : undefined} style={{ height: 40, border: `1px solid ${readOnly ? C.g200 : verification.done ? C.primary : C.g800}`, borderRadius: 999, background: readOnly ? C.g100 : verification.done ? C.bg : C.white, color: readOnly ? C.g400 : verification.done ? C.primary : C.g800, cursor: readOnly ? 'not-allowed' : verification.running ? 'wait' : 'pointer', fontSize: 14, fontWeight: 800, fontFamily: 'inherit', padding: '0 16px', whiteSpace: 'nowrap', boxShadow: 'none' }}>{verification.label}</button>
            {!readOnly && uploadCompleteAction}
          </div>
        </div>
        {readOnly && readOnlyReason && <div style={{ border: `1px solid ${C.g200}`, borderRadius: 8, background: C.g100, color: C.g600, padding: '10px 12px', fontSize: 13, fontWeight: 800 }}>{readOnlyReason}</div>}
        <CenterModal open={Boolean(agentFailureTarget)} title="처리 실패" body={agentFailureMessage} actionLabel="확인" onAction={() => { setAgentFailureTarget(null); setAgentFailureMessage(''); }} />
        <UsageDetailNotices
          matchingError={verification.matchingError}
          actionError={usageDetailActionError}
          matchingNotice={verification.matchingNotice}
          photoValidationNotice={verification.photoValidationNotice}
          onDismissMatchingError={verification.dismissMatchingError}
          onDismissActionError={() => setUsageDetailActionError('')}
          onDismissNotices={verification.dismissActionNotices}
        />
        <div data-ui="usage-detail-screen.6" className="screen-enter" style={{ paddingTop: 0, position: 'relative', minHeight: 560 }}>
          <UsageDetailFileView projectId={projectId} cats={CATS} usageItems={resolvedUsageItems} selectedCatId={selectedHierarchyCatId} selectedUsageItemId={selectedUsageItemId} actionRequest={actionRequest} getFiles={getHierarchyFilesForCategory} isProblemFile={isProblemFile} isSupplementTarget={todos.isSupplementTarget} readOnly={readOnly} onSelectCat={(catId) => {
                setSelectedHierarchyCatId(catId);
                setSelectedUsageItemId(resolvedUsageItems.find((item) => item.categoryId === catId)?.id || '');
            }} onSelectUsageItem={(item) => {
                setSelectedUsageItemId(item.id);
                setSelectedHierarchyCatId(item.categoryId);
            }} onRemove={removeHierarchyFile} onRename={renameHierarchyFile} onMove={moveHierarchyFile} onEditUsageItem={editUsageItem} onAddUsageItem={openAddUsageItemModal} onDeleteUsageItem={requestDeleteUsageItem} onUpload={uploadFilesToSection} onDownloadFile={openFileDownload}/>
          <UsageDetailVerificationOverlay step={verification.step} message={verification.loadingMessage} />
        </div>
      </div>
      <UsageStatementAddItemModal
        open={addUsageItemModalOpen}
        draft={addUsageItemDraft}
        error={addUsageItemError}
        onChange={(patch) => setAddUsageItemDraft((current) => ({ ...current, ...patch }))}
        onClose={() => setAddUsageItemModalOpen(false)}
        onSubmit={submitAddUsageItem}
      />
      <UsageStatementClassiModals
        running={classiAgentRunning}
        rejectedNotice={classiRejectedNotice}
        classificationMoveNotices={classificationMoveNotices}
        onDismissRejected={() => setClassiRejectedNotice(null)}
        onDismissClassification={() => setClassificationMoveNotices([])}
      />
      <UsageStatementDeleteModals
        fileDeleteOpen={Boolean(deleteTarget)}
        usageItemDeleteTarget={deleteUsageItemTarget}
        onCloseFileDelete={() => setDeleteTarget(null)}
        onConfirmFileDelete={confirmRemoveArchiveFile}
        onCloseUsageItemDelete={() => setDeleteUsageItemTarget(null)}
        onConfirmUsageItemDelete={() => void confirmDeleteUsageItem()}
      />
    </div>);
}
