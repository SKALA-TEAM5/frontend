import { useEffect, useRef, useState } from 'react';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import { C } from '../../lib/theme';
import { CATS, USAGE_LINE_ITEMS, buildArchiveDataFromUploads, createDefaultArchiveData, createEntryFromFile, normalizeArchiveData } from '../../lib/evidence-utils';
import ArchiveFolderGrid from './ArchiveFolderGrid';
import ArchiveHierarchyView, { type HierarchyEvidenceKind } from './ArchiveHierarchyView';
import ArchivePreview from './ArchivePreview';
import ArchiveToolbar, { type ArchiveValidationStatus, type ArchiveViewMode } from './ArchiveToolbar';
import UploadScreen from './UploadScreen';
import type { ArchiveSeed, ContractInfo, EvidenceCategory, EvidenceFile, FolderEvidenceCategory } from '../../types/domain';
interface ArchiveScreenProps {
    matchReady: boolean;
    uncheckedMatchedFileCount?: number;
    onDismissMatchReady: () => void | Promise<void>;
    archiveSeed: ArchiveSeed | null;
    validationStatus: ArchiveValidationStatus;
    onRunValidation: () => void;
    canRunValidation?: boolean;
    contractName: string;
    contractMeta: ContractInfo | null;
    onArchiveSeedChange?: (seed: ArchiveSeed) => void;
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
const PROBLEM_CATEGORY_IDS = new Set([4, 5, 8]);
const PROBLEM_KEYWORDS = ['개인보호구', '보호구', '안전시설물', '안전난간', '본사'];
export default function ArchiveScreen({ matchReady, uncheckedMatchedFileCount = 0, onDismissMatchReady, archiveSeed, validationStatus, onRunValidation, canRunValidation = true, contractName, contractMeta, onArchiveSeedChange }: ArchiveScreenProps) {
    const [viewMode, setViewMode] = useState<ArchiveViewMode>('hierarchy');
    const [dragFile, setDragFile] = useState<DragContext>(null);
    const [fileData, setFileData] = useState<ArchiveSeed>(() => normalizeArchiveData(archiveSeed || createDefaultArchiveData()));
    const [uploadModalOpen, setUploadModalOpen] = useState(false);
    const [checkingMatchedFiles, setCheckingMatchedFiles] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<{ kind: FolderEvidenceCategory; catId: number; fileId: string; usageItemId?: string } | null>(null);
    const [selectedHierarchyCatId, setSelectedHierarchyCatId] = useState(USAGE_LINE_ITEMS[0]?.categoryId || 1);
    const [selectedUsageItemId, setSelectedUsageItemId] = useState(USAGE_LINE_ITEMS[0]?.id || '');
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
    const moveFile = (kind: FolderEvidenceCategory, fromCat: number, toCat: number, fileEntry: EvidenceFile, fromUsageItemId?: string, toUsageItemId?: string) => {
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
            const targetUsageItemId = toUsageItemId || USAGE_LINE_ITEMS.find((item) => item.categoryId === toCat)?.id || `cat-${toCat}`;
            next.categories[toCat] = {
                ...(next.categories[toCat] || {}),
                [targetUsageItemId]: {
                    ...(next.categories[toCat]?.[targetUsageItemId] || {}),
                    [kind]: [...(next.categories[toCat]?.[targetUsageItemId]?.[kind] || []), { ...fileEntry, categoryIds: [toCat], usageItemIds: [targetUsageItemId] }],
                },
            };
            return next;
        });
    };
    const removeArchiveFile = (kind: FolderEvidenceCategory, catId: number, fileId: string, usageItemId?: string) => {
        setDeleteTarget({ kind, catId, fileId, usageItemId });
    };
    const confirmRemoveArchiveFile = () => {
        if (!deleteTarget)
            return;
        const { kind, catId, fileId, usageItemId } = deleteTarget;
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
    const uploadMissingEvidence = (kind: FolderEvidenceCategory, catId: number) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = 'image/*,.pdf,.xlsx';
        input.onchange = (e) => {
            const pickedFiles = Array.from((e.target as HTMLInputElement).files || []);
            if (pickedFiles.length === 0)
                return;
            commitFileData((prev) => ({
                ...prev,
                categories: {
                    ...prev.categories,
                    [catId]: {
                        ...(prev.categories[catId] || {}),
                        [selectedUsageItemId]: {
                            ...(prev.categories[catId]?.[selectedUsageItemId] || {}),
                            [kind]: [
                                ...((prev.categories[catId]?.[selectedUsageItemId]?.[kind]) || []),
                                ...pickedFiles.map((file) => createEntryFromFile(file, kind, { categoryIds: [catId], usageItemIds: [selectedUsageItemId] })),
                            ],
                        },
                    },
                },
            }));
        };
        input.click();
    };
    const removeHierarchyFile = (kind: HierarchyEvidenceKind, catId: number, usageItemId: string, fileId: string) => {
        if (kind !== 'misc') {
            removeArchiveFile(kind, catId, fileId, usageItemId);
            return;
        }
    };
    const moveHierarchyFile = (fromKind: HierarchyEvidenceKind, fromCatId: number, fromUsageItemId: string, toKind: HierarchyEvidenceKind, toCatId: number, fileEntry: EvidenceFile, toUsageItemId?: string) => {
        if (fromKind === toKind && fromCatId === toCatId && fromUsageItemId === toUsageItemId)
            return;
        if (fromKind === 'misc' || toKind === 'misc')
            return;
        const nextKind: EvidenceCategory = toKind;
        const movedFile: EvidenceFile = { ...fileEntry, kind: nextKind, categoryIds: [toCatId] };
        commitFileData((prev) => {
            const next: ArchiveSeed = { ...prev, categories: { ...prev.categories } };
            next.categories[fromCatId] = { ...(next.categories[fromCatId] || {}) };
            next.categories[toCatId] = { ...(next.categories[toCatId] || {}) };
            next.categories[fromCatId][fromUsageItemId] = {
                ...(next.categories[fromCatId][fromUsageItemId] || {}),
                [fromKind]: (next.categories[fromCatId][fromUsageItemId]?.[fromKind] || []).filter((file) => file.id !== fileEntry.id),
            };
            const targetUsageItemId = toUsageItemId || USAGE_LINE_ITEMS.find((item) => item.categoryId === toCatId)?.id || `cat-${toCatId}`;
            next.categories[toCatId][targetUsageItemId] = {
                ...(next.categories[toCatId][targetUsageItemId] || {}),
                [toKind]: [...(next.categories[toCatId][targetUsageItemId]?.[toKind] || []), { ...movedFile, usageItemIds: [targetUsageItemId] }],
            };
            return next;
        });
        const nextUsageItem = USAGE_LINE_ITEMS.find((item) => item.id === toUsageItemId) || USAGE_LINE_ITEMS.find((item) => item.categoryId === toCatId);
        if (nextUsageItem)
            setSelectedUsageItemId(nextUsageItem.id);
        setSelectedHierarchyCatId(toCatId);
    };
    const isProblemFile = (file: EvidenceFile) => {
        if (validationStatus !== 'done')
            return false;
        return file.categoryIds?.some((catId) => PROBLEM_CATEGORY_IDS.has(catId)) || PROBLEM_KEYWORDS.some((keyword) => file.name.includes(keyword));
    };
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

        <ArchiveToolbar viewMode={viewMode} validationStatus={validationStatus} onRunValidation={onRunValidation} canRunValidation={canRunValidation} onUpload={viewMode === 'hierarchy' ? () => setUploadModalOpen(true) : undefined} onViewModeChange={setViewMode}/>

        <div data-ui="archive-screen.6" key={viewMode} className="screen-enter" style={{ paddingTop: 0 }}>
          {viewMode === 'hierarchy' ? (<ArchiveHierarchyView cats={CATS} usageItems={USAGE_LINE_ITEMS} selectedCatId={selectedHierarchyCatId} selectedUsageItemId={selectedUsageItemId} getFiles={getHierarchyFilesForCategory} isProblemFile={isProblemFile} onSelectCat={(catId) => {
                setSelectedHierarchyCatId(catId);
                setSelectedUsageItemId(USAGE_LINE_ITEMS.find((item) => item.categoryId === catId)?.id || '');
            }} onSelectUsageItem={(item) => {
                setSelectedUsageItemId(item.id);
                setSelectedHierarchyCatId(item.categoryId);
            }} onRemove={removeHierarchyFile} onMove={moveHierarchyFile} onUploadMissing={uploadMissingEvidence}/>) : (<ArchiveFolderGrid cats={CATS} viewMode={viewMode} dragFile={dragFile} getAllFilesForCategory={getAllFilesForCategory} isProblemFile={isProblemFile} onDropFile={(toCat) => {
            if (!dragFile)
                return;
            moveFile(dragFile.kind, dragFile.fromCat, toCat, dragFile.file, dragFile.fromUsageItemId);
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

      <Modal open={uploadModalOpen} onClose={() => setUploadModalOpen(false)} zIndex={920} maxWidth={720}>
        <div style={{ background: C.soft, borderRadius: 22, border: `1px solid ${C.g200}`, boxShadow: '0 18px 44px rgba(0,0,0,.16)', overflow: 'hidden' }}>
          <div style={{ position: 'relative' }}>
            <button type="button" onClick={() => setUploadModalOpen(false)} style={{ position: 'absolute', top: 8, right: 10, zIndex: 2, border: 'none', background: 'transparent', color: C.g400, cursor: 'pointer', fontSize: 24, lineHeight: 1 }}>×</button>
          </div>
          <div style={{ padding: '34px 14px 14px' }}>
            <UploadScreen contractName={contractName} contractMeta={contractMeta} requireUsageStatementFirst={false} hideUsageStatementZone onMatchComplete={(payload) => {
                const nextSeed = buildArchiveDataFromUploads(payload.files);
                setFileData(normalizeArchiveData(nextSeed));
                setSelectedHierarchyCatId(USAGE_LINE_ITEMS[0]?.categoryId || 1);
                setSelectedUsageItemId(USAGE_LINE_ITEMS[0]?.id || '');
                setViewMode('hierarchy');
                setUploadModalOpen(false);
            }} compact/>
          </div>
        </div>
      </Modal>
    </div>);
}
