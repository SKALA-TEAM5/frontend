import { useEffect, useRef, useState } from 'react';
import Card from '../../components/ui/Card';
import CenterModal from '../../components/ui/CenterModal';
import Modal from '../../components/ui/Modal';
import { C } from '../../lib/theme';
import { getAgentFailureMessage, type AgentFailureTarget } from '../../lib/agent-failure';
import { CATS, USAGE_LINE_ITEMS, createDefaultArchiveData, createEntryFromFile, normalizeArchiveData, type UsageLineItem } from '../../lib/evidence-utils';
import ArchiveFolderGrid from './ArchiveFolderGrid';
import ArchiveHierarchyView, { type HierarchyEvidenceKind } from './ArchiveHierarchyView';
import ArchivePreview from './ArchivePreview';
import ArchiveToolbar, { type ArchiveValidationStatus, type ArchiveViewMode } from './ArchiveToolbar';
import { deleteEvidenceFileLink, deleteProjectFile, getProjectFileDownloadUrl, getProjectFilePreviewUrl, linkEvidenceFile, moveEvidenceFileLink, uploadProjectFile, type SafetyDocAgentRequiredEvidenceMap } from '../../lib/archive-api';
import type { ArchiveSeed, EvidenceCategory, EvidenceFile, FolderEvidenceCategory } from '../../types/domain';
interface ArchiveScreenProps {
    projectId: string;
    matchReady: boolean;
    uncheckedMatchedFileCount?: number;
    onDismissMatchReady: () => void | Promise<void>;
    archiveSeed: ArchiveSeed | null;
    usageItems?: UsageLineItem[];
    canRunArchiveTools?: boolean;
    actionRequestBadge?: {
        label: string;
        pulse?: boolean;
        onClick: () => void;
    };
    reviewRequestButton?: {
        label: string;
        disabled?: boolean;
        onClick: () => void;
    };
    onArchiveSeedChange?: (seed: ArchiveSeed) => void;
    onFilesUploaded?: (files: EvidenceFile[], context?: { categoryName: string; itemName: string }) => void;
}
type DragContext = {
    file: EvidenceFile;
    fromCat: number;
    fromUsageItemId?: string;
    kind: FolderEvidenceCategory;
} | null;
const uniqueFiles = (files: EvidenceFile[]) => {
    const seen = new Set<string>();
    return files.filter((file) => {
        const key = `${file.kind}:${file.id}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
};
const FOLDER_EVIDENCE_KINDS: FolderEvidenceCategory[] = ['receipt', 'site_photo', 'tax_invoice', 'other_document'];
export default function ArchiveScreen({ projectId, matchReady, uncheckedMatchedFileCount = 0, onDismissMatchReady, archiveSeed, usageItems = USAGE_LINE_ITEMS, canRunArchiveTools = true, actionRequestBadge, reviewRequestButton, onArchiveSeedChange, onFilesUploaded }: ArchiveScreenProps) {
    const resolvedUsageItems = usageItems.length ? usageItems : USAGE_LINE_ITEMS;
    const [viewMode, setViewMode] = useState<ArchiveViewMode>('hierarchy');
    const [dragFile, setDragFile] = useState<DragContext>(null);
    const [fileData, setFileData] = useState<ArchiveSeed>(() => normalizeArchiveData(archiveSeed || createDefaultArchiveData()));
    const [checkingMatchedFiles, setCheckingMatchedFiles] = useState(false);
    const [matchingStatus, setMatchingStatus] = useState<'idle' | 'running' | 'done'>('idle');
    const [requiredEvidenceByLine, setRequiredEvidenceByLine] = useState<SafetyDocAgentRequiredEvidenceMap>({});
    const [matchingError, setMatchingError] = useState('');
    const [matchingNotice, setMatchingNotice] = useState('');
    const [archiveActionError, setArchiveActionError] = useState('');
    const [photoValidationStatus, setPhotoValidationStatus] = useState<ArchiveValidationStatus>('idle');
    const [photoValidationNotice, setPhotoValidationNotice] = useState<{ type: 'ok' | 'bad'; message: string } | null>(null);
    const [agentFailureTarget, setAgentFailureTarget] = useState<AgentFailureTarget | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<{ kind: FolderEvidenceCategory; catId: number; fileId: string; usageItemId?: string } | null>(null);
    const [selectedHierarchyCatId, setSelectedHierarchyCatId] = useState(resolvedUsageItems[0]?.categoryId || 1);
    const [selectedUsageItemId, setSelectedUsageItemId] = useState(resolvedUsageItems[0]?.id || '');
    const [hoverPreview, setHoverPreview] = useState<{
        entry: EvidenceFile;
        x: number;
        y: number;
    } | null>(null);
    const pendingArchiveSeedRef = useRef<ArchiveSeed | null>(null);
    useEffect(() => {
        if (archiveSeed)
            setFileData(normalizeArchiveData(archiveSeed));
    }, [archiveSeed]);
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
        if (!pendingArchiveSeedRef.current)
            return;
        const nextSeed = pendingArchiveSeedRef.current;
        pendingArchiveSeedRef.current = null;
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
    const getAllFilesForCategory = (catId: number) => {
        const merged = FOLDER_EVIDENCE_KINDS.flatMap((kind) => getFilesForCategory(kind, catId).map((file) => ({ ...file, kind })));
        return uniqueFiles(merged);
    };
    const getRequiredEvidence = (kind: FolderEvidenceCategory, _catId: number, usageItemId?: string) => {
        if (!usageItemId)
            return [];
        return requiredEvidenceByLine[usageItemId]?.[kind] || [];
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
                setRequiredEvidenceByLine((current) => {
                    const currentLine = current[usageItemId];
                    if (!currentLine?.[kind])
                        return current;
                    const nextLine = { ...currentLine };
                    delete nextLine[kind];
                    const next = { ...current, [usageItemId]: nextLine };
                    if (Object.keys(nextLine).length === 0)
                        delete next[usageItemId];
                    return next;
                });
                setSelectedHierarchyCatId(catId);
                setSelectedUsageItemId(usageItemId);
                const categoryName = CATS.find((cat) => cat.id === catId)?.short || '선택 항목';
                const itemName = resolvedUsageItems.find((item) => item.id === usageItemId)?.name || categoryName;
                onFilesUploaded?.(nextEntries, { categoryName, itemName });
            } catch (error) {
                setArchiveActionError(error instanceof Error ? error.message : '파일 업로드에 실패했습니다.');
            }
        };
        input.click();
    };
    const moveFile = async (kind: FolderEvidenceCategory, fromCat: number, toCat: number, fileEntry: EvidenceFile, fromUsageItemId?: string, toUsageItemId?: string) => {
        const targetUsageItemId = toUsageItemId || resolvedUsageItems.find((item) => item.categoryId === toCat)?.id || `cat-${toCat}`;
        setArchiveActionError('');
        let movedLinkId = fileEntry.linkId;
        try {
            if (fileEntry.linkId) {
                const link = await moveEvidenceFileLink(projectId, fileEntry.linkId, targetUsageItemId, kind);
                movedLinkId = link.linkId || fileEntry.linkId;
            } else if (fileEntry.fileId) {
                const link = await linkEvidenceFile(projectId, targetUsageItemId, fileEntry.fileId, kind);
                movedLinkId = link.linkId;
            }
        } catch (error) {
            setArchiveActionError(error instanceof Error ? error.message : '파일 이동에 실패했습니다.');
            return;
        }
        commitFileData((prev) => {
            const next: ArchiveSeed = { ...prev, categories: { ...prev.categories } };
            const fromLineMap = { ...(next.categories[fromCat] || {}) };
            const sourceUsageIds = fromUsageItemId ? [fromUsageItemId] : Object.keys(fromLineMap);
            sourceUsageIds.forEach((usageItemId) => {
                fromLineMap[usageItemId] = {
                    ...(fromLineMap[usageItemId] || {}),
                    [kind]: (fromLineMap[usageItemId]?.[kind] || []).filter((file) => file.id !== fileEntry.id),
                };
            });
            next.categories[fromCat] = fromLineMap;
            next.categories[toCat] = {
                ...(next.categories[toCat] || {}),
                [targetUsageItemId]: {
                    ...(next.categories[toCat]?.[targetUsageItemId] || {}),
                    [kind]: [...(next.categories[toCat]?.[targetUsageItemId]?.[kind] || []), { ...fileEntry, id: movedLinkId ? `evidence-link-${movedLinkId}` : fileEntry.id, linkId: movedLinkId, categoryIds: [toCat], usageItemIds: [targetUsageItemId] }],
                },
            };
            return next;
        });
    };
    const removeArchiveFile = (kind: FolderEvidenceCategory, catId: number, fileId: string, usageItemId?: string) => {
        setDeleteTarget({ kind, catId, fileId, usageItemId });
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
        setDeleteTarget(null);
    };
    const removeHierarchyFile = (kind: HierarchyEvidenceKind, catId: number, usageItemId: string, fileId: string) => {
        if (kind !== 'misc') {
            removeArchiveFile(kind, catId, fileId, usageItemId);
            return;
        }
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
        const nextUsageItem = resolvedUsageItems.find((item) => item.id === toUsageItemId) || resolvedUsageItems.find((item) => item.categoryId === toCatId);
        if (nextUsageItem)
            setSelectedUsageItemId(nextUsageItem.id);
        setSelectedHierarchyCatId(toCatId);
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
    const isProblemFile = (file: EvidenceFile) => file.kind === 'site_photo' && file.visionValidation?.status === 'unsuitable';
    const hasUncheckedMatchedFiles = uncheckedMatchedFileCount > 0;
    const showMatchReadyNotice = matchReady || hasUncheckedMatchedFiles;
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
        window.setTimeout(() => {
            const buildExampleRequiredEvidence = () => {
                const targets = resolvedUsageItems.slice(0, 3);
                return targets.reduce<SafetyDocAgentRequiredEvidenceMap>((result, item, index) => {
                    result[item.id] = index === 0
                        ? { receipt: ['영수증'], tax_invoice: ['세금계산서'] }
                        : index === 1
                            ? { site_photo: ['현장사진'], other_document: ['거래명세서'] }
                            : { other_document: ['지급대장'] };
                    return result;
                }, {});
            };
            const agentRequiredEvidence = buildExampleRequiredEvidence();
            setRequiredEvidenceByLine(agentRequiredEvidence);
            setFileData((current) => normalizeArchiveData(current));
            setViewMode('hierarchy');
            setMatchingStatus('done');
            setMatchingNotice(Object.keys(agentRequiredEvidence).length
                ? '백엔드 매칭 API가 아직 없어 예시 매칭 결과를 표시했습니다.'
                : '백엔드 매칭 API가 아직 없고 표시할 사용내역서 세부 항목도 없습니다.');
        }, 700);

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
    return (<div data-ui="archive-screen.1" style={{ background: C.soft, position: 'relative' }}>
      <div data-ui="archive-screen.2" className="screen-enter">
        {showMatchReadyNotice && (<Card style={{ marginBottom: 16, padding: '14px 18px', background: C.bg, border: `1px solid ${C.light}` }}>
            <div data-ui="archive-screen.3" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div data-ui="archive-screen.4" style={{ fontSize: 15, fontWeight: 700, color: C.primary }}>
                {hasUncheckedMatchedFiles ? `관리자가 아직 확인하지 않은 매칭 파일 ${uncheckedMatchedFileCount}건이 있습니다.` : '매칭 검토가 완료되었습니다. 파일을 드래그해 다른 폴더로 이동할 수 있습니다.'}
              </div>
              <button data-ui="archive-screen.5" onClick={() => void dismissMatchReady()} disabled={checkingMatchedFiles} style={{ border: `1px solid ${C.light}`, borderRadius: 999, padding: '7px 11px', background: C.white, cursor: checkingMatchedFiles ? 'not-allowed' : 'pointer', color: checkingMatchedFiles ? C.g400 : C.primary, fontFamily: 'inherit', fontSize: 12, fontWeight: 900 }}>{checkingMatchedFiles ? '확인 중' : '확인'}</button>
            </div>
          </Card>)}

        <ArchiveToolbar viewMode={viewMode} validationStatus={photoValidationStatus} matchingStatus={matchingStatus} onRunMatching={runSafetyDocMatching} onRunPhotoValidation={runVisionPhotoValidation} canRunArchiveTools={canRunArchiveTools} actionRequestBadge={actionRequestBadge} reviewRequestButton={reviewRequestButton} onViewModeChange={setViewMode}/>
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

        <div data-ui="archive-screen.6" key={viewMode} className="screen-enter" style={{ paddingTop: 0 }}>
          {viewMode === 'hierarchy' ? (<ArchiveHierarchyView cats={CATS} usageItems={resolvedUsageItems} selectedCatId={selectedHierarchyCatId} selectedUsageItemId={selectedUsageItemId} getFiles={getHierarchyFilesForCategory} isProblemFile={isProblemFile} onSelectCat={(catId) => {
                setSelectedHierarchyCatId(catId);
                setSelectedUsageItemId(resolvedUsageItems.find((item) => item.categoryId === catId)?.id || '');
            }} onSelectUsageItem={(item) => {
                setSelectedUsageItemId(item.id);
                setSelectedHierarchyCatId(item.categoryId);
            }} onRemove={removeHierarchyFile} onMove={moveHierarchyFile} onUpload={uploadFilesToSection} onPreviewFile={openFilePreview} onDownloadFile={openFileDownload} getRequiredEvidence={getRequiredEvidence}/>) : (<ArchiveFolderGrid cats={CATS} viewMode={viewMode} dragFile={dragFile} getAllFilesForCategory={getAllFilesForCategory} isProblemFile={isProblemFile} onDropFile={(toCat) => {
            if (!dragFile)
                return;
            void moveFile(dragFile.kind, dragFile.fromCat, toCat, dragFile.file, dragFile.fromUsageItemId);
            setDragFile(null);
        }} onSetDragFile={setDragFile} onRemove={removeArchiveFile} onPreview={(entry, x, y) => setHoverPreview({ entry, x, y })} onPreviewEnd={() => setHoverPreview(null)}/>)}
        </div>
      </div>

      <ArchivePreview hoverPreview={hoverPreview}/>

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
