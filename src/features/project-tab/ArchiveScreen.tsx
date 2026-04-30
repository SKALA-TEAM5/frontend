import { useEffect, useState } from 'react';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import { C } from '../../lib/theme';
import { CATS, USAGE_LINE_ITEMS, buildArchiveDataFromUploads, createDefaultArchiveData, createEntryFromFile, normalizeArchiveData } from '../../lib/mock-data';
import ArchiveFolderGrid from './ArchiveFolderGrid';
import ArchiveHierarchyView, { type HierarchyEvidenceKind } from './ArchiveHierarchyView';
import ArchivePreview from './ArchivePreview';
import ArchiveToolbar, { type ArchiveValidationStatus, type ArchiveViewMode } from './ArchiveToolbar';
import UploadScreen from './UploadScreen';
import type { ArchiveSeed, ContractInfo, EvidenceCategory, EvidenceFile, FolderEvidenceCategory } from '../../types/domain';
interface ArchiveScreenProps {
    matchReady: boolean;
    onDismissMatchReady: () => void;
    archiveSeed: ArchiveSeed | null;
    validationStatus: ArchiveValidationStatus;
    onRunValidation: () => void;
    contractName: string;
    contractMeta: ContractInfo | null;
}
type DragContext = {
    file: EvidenceFile;
    fromCat: number;
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
const HIERARCHY_EVIDENCE_KINDS: HierarchyEvidenceKind[] = ['receipt', 'site_photo', 'tax_invoice', 'other_document'];
const PROBLEM_CATEGORY_IDS = new Set([4, 5, 8]);
const PROBLEM_KEYWORDS = ['개인보호구', '보호구', '안전시설물', '안전난간', '본사'];
export default function ArchiveScreen({ matchReady, onDismissMatchReady, archiveSeed, validationStatus, onRunValidation, contractName, contractMeta }: ArchiveScreenProps) {
    const [viewMode, setViewMode] = useState<ArchiveViewMode>('hierarchy');
    const [dragFile, setDragFile] = useState<DragContext>(null);
    const [fileData, setFileData] = useState<ArchiveSeed>(() => normalizeArchiveData(archiveSeed || createDefaultArchiveData()));
    const [uploadModalOpen, setUploadModalOpen] = useState(false);
    const [selectedHierarchyCatId, setSelectedHierarchyCatId] = useState(USAGE_LINE_ITEMS[0]?.categoryId || 1);
    const [selectedUsageItemId, setSelectedUsageItemId] = useState(USAGE_LINE_ITEMS[0]?.id || '');
    const [selectedHierarchyKind, setSelectedHierarchyKind] = useState<HierarchyEvidenceKind>('receipt');
    const [selectedHierarchyFile, setSelectedHierarchyFile] = useState<EvidenceFile | null>(null);
    const [hoverPreview, setHoverPreview] = useState<{
        entry: EvidenceFile;
        x: number;
        y: number;
    } | null>(null);
    useEffect(() => {
        if (archiveSeed)
            setFileData(normalizeArchiveData(archiveSeed));
    }, [archiveSeed]);
    const getFilesForCategory = (kind: FolderEvidenceCategory, catId: number) => fileData[kind]?.[catId] || [];
    const getHierarchyFilesForCategory = (kind: HierarchyEvidenceKind, catId: number) => kind === 'misc' ? [] : getFilesForCategory(kind, catId);
    const selectedUsageItem = USAGE_LINE_ITEMS.find((item) => item.id === selectedUsageItemId) || USAGE_LINE_ITEMS[0];
    const getAllFilesForCategory = (catId: number) => {
        const merged = FOLDER_EVIDENCE_KINDS.flatMap((kind) => getFilesForCategory(kind, catId).map((file) => ({ ...file, kind })));
        return uniqueFiles(merged);
    };
    useEffect(() => {
        if (viewMode !== 'hierarchy')
            return;
        const files = HIERARCHY_EVIDENCE_KINDS.flatMap((kind) => getHierarchyFilesForCategory(kind, selectedHierarchyCatId));
        if (selectedHierarchyFile && files.some((file) => file.id === selectedHierarchyFile.id))
            return;
        setSelectedHierarchyFile(files[0] || null);
    }, [fileData, selectedHierarchyCatId, selectedHierarchyFile, viewMode]);
    const moveFile = (kind: FolderEvidenceCategory, fromCat: number, toCat: number, fileEntry: EvidenceFile) => {
        setFileData((prev) => {
            const next = { ...prev, [kind]: { ...prev[kind] } };
            next[kind][fromCat] = (next[kind][fromCat] || []).filter((file) => file.id !== fileEntry.id);
            next[kind][toCat] = [...(next[kind][toCat] || []), { ...fileEntry, categoryIds: [toCat] }];
            return next;
        });
    };
    const removeArchiveFile = (kind: FolderEvidenceCategory, catId: number, fileId: string) => {
        if (!confirm('이 파일을 삭제하시겠습니까?'))
            return;
        setFileData((prev) => {
            const next = { ...prev, [kind]: { ...prev[kind] } };
            next[kind][catId] = (next[kind][catId] || []).filter((file) => file.id !== fileId);
            return next;
        });
    };
    const removeUsageStatement = (fileId: string) => {
        if (!confirm('이 파일을 삭제하시겠습니까?'))
            return;
        setFileData((prev) => ({
            ...prev,
            usage_statement: prev.usage_statement.filter((file) => file.id !== fileId),
        }));
    };
    const openUsageStatementAdd = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = 'image/*,.pdf,.xlsx';
        input.onchange = (e) => {
            const pickedFiles = Array.from((e.target as HTMLInputElement).files || []);
            setFileData((prev) => ({
                ...prev,
                usage_statement: [
                    ...prev.usage_statement,
                    ...pickedFiles.map((file) => createEntryFromFile(file, 'usage_statement', { categoryIds: [] })),
                ],
            }));
        };
        input.click();
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
            setFileData((prev) => ({
                ...prev,
                [kind]: {
                    ...prev[kind],
                    [catId]: [
                        ...(prev[kind][catId] || []),
                        ...pickedFiles.map((file) => createEntryFromFile(file, kind, { categoryIds: [catId] })),
                    ],
                },
            }));
            setSelectedHierarchyKind(kind);
        };
        input.click();
    };
    const removeHierarchyFile = (kind: HierarchyEvidenceKind, catId: number, fileId: string) => {
        if (kind !== 'misc') {
            removeArchiveFile(kind, catId, fileId);
            return;
        }
    };
    const moveHierarchyFile = (fromKind: HierarchyEvidenceKind, fromCatId: number, toKind: HierarchyEvidenceKind, toCatId: number, fileEntry: EvidenceFile) => {
        if (fromKind === toKind && fromCatId === toCatId)
            return;
        if (fromKind === 'misc' || toKind === 'misc')
            return;
        const nextKind: EvidenceCategory = toKind;
        const movedFile: EvidenceFile = { ...fileEntry, kind: nextKind, categoryIds: [toCatId] };
        setFileData((prev) => {
            const next = { ...prev, [fromKind]: { ...prev[fromKind] }, [toKind]: { ...prev[toKind] } };
            next[fromKind][fromCatId] = (next[fromKind][fromCatId] || []).filter((file) => file.id !== fileEntry.id);
            next[toKind][toCatId] = [...(next[toKind][toCatId] || []), movedFile];
            return next;
        });
        const nextUsageItem = USAGE_LINE_ITEMS.find((item) => item.categoryId === toCatId);
        if (nextUsageItem)
            setSelectedUsageItemId(nextUsageItem.id);
        setSelectedHierarchyCatId(toCatId);
        setSelectedHierarchyKind(toKind);
        setSelectedHierarchyFile(movedFile);
    };
    const isProblemFile = (file: EvidenceFile) => {
        if (validationStatus !== 'done')
            return false;
        return file.categoryIds?.some((catId) => PROBLEM_CATEGORY_IDS.has(catId)) || PROBLEM_KEYWORDS.some((keyword) => file.name.includes(keyword));
    };
    return (<div data-ui="archive-screen.1" style={{ background: C.soft, position: 'relative' }}>
      <div data-ui="archive-screen.2" className="screen-enter">
        {matchReady && (<Card style={{ marginBottom: 16, padding: '14px 18px', background: C.bg, border: `1px solid ${C.light}` }}>
            <div data-ui="archive-screen.3" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div data-ui="archive-screen.4" style={{ fontSize: 15, fontWeight: 700, color: C.primary }}>매칭 검토가 완료되었습니다. 파일을 드래그해 다른 폴더로 이동할 수 있습니다.</div>
              <button data-ui="archive-screen.5" onClick={onDismissMatchReady} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.g400, fontSize: 20 }}>x</button>
            </div>
          </Card>)}

        <ArchiveToolbar viewMode={viewMode} validationStatus={validationStatus} onRunValidation={onRunValidation} onUpload={viewMode === 'hierarchy' ? () => setUploadModalOpen(true) : undefined} onViewModeChange={setViewMode}/>

        <div data-ui="archive-screen.6" key={viewMode} className="screen-enter" style={{ paddingTop: 0 }}>
          {viewMode === 'hierarchy' ? (<ArchiveHierarchyView cats={CATS} usageItems={USAGE_LINE_ITEMS} selectedCatId={selectedHierarchyCatId} selectedUsageItemId={selectedUsageItemId} getFiles={getHierarchyFilesForCategory} isProblemFile={isProblemFile} onSelectCat={(catId) => {
                setSelectedHierarchyCatId(catId);
                setSelectedUsageItemId(USAGE_LINE_ITEMS.find((item) => item.categoryId === catId)?.id || '');
                setSelectedHierarchyFile(null);
            }} onSelectUsageItem={(item) => {
                setSelectedUsageItemId(item.id);
                setSelectedHierarchyCatId(item.categoryId);
                setSelectedHierarchyFile(null);
            }} onSelectFile={setSelectedHierarchyFile} onRemove={removeHierarchyFile} onMove={moveHierarchyFile} onUploadMissing={uploadMissingEvidence}/>) : (<ArchiveFolderGrid cats={CATS} viewMode={viewMode} dragFile={dragFile} getAllFilesForCategory={getAllFilesForCategory} isProblemFile={isProblemFile} onDropFile={(toCat) => {
            if (!dragFile)
                return;
            moveFile(dragFile.kind, dragFile.fromCat, toCat, dragFile.file);
            setDragFile(null);
        }} onSetDragFile={setDragFile} onRemove={removeArchiveFile} onPreview={(entry, x, y) => setHoverPreview({ entry, x, y })} onPreviewEnd={() => setHoverPreview(null)}/>)}
        </div>
      </div>

      <ArchivePreview hoverPreview={hoverPreview}/>

      <Modal open={uploadModalOpen} onClose={() => setUploadModalOpen(false)} zIndex={920} maxWidth={720}>
        <div style={{ background: C.soft, borderRadius: 22, border: `1px solid ${C.g200}`, boxShadow: '0 18px 44px rgba(0,0,0,.16)', overflow: 'hidden' }}>
          <div style={{ position: 'relative' }}>
            <button type="button" onClick={() => setUploadModalOpen(false)} style={{ position: 'absolute', top: 8, right: 10, zIndex: 2, border: 'none', background: 'transparent', color: C.g400, cursor: 'pointer', fontSize: 24, lineHeight: 1 }}>×</button>
          </div>
          <div style={{ padding: '34px 14px 14px' }}>
            <UploadScreen contractName={contractName} contractMeta={contractMeta} requireUsageStatementFirst={false} onMatchComplete={(payload) => {
                const nextSeed = buildArchiveDataFromUploads(payload.files);
                setFileData(normalizeArchiveData(nextSeed));
                setSelectedHierarchyFile(null);
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
