import { useEffect, useState } from 'react';
import Card from '../../components/ui/Card';
import { C } from '../../lib/theme';
import { CATS, createDefaultArchiveData, createEntryFromFile, normalizeArchiveData } from '../../lib/mock-data';
import { PhotoDescriptionModal } from './EvidenceModals';
import ArchiveFolderGrid from './ArchiveFolderGrid';
import ArchivePreview from './ArchivePreview';
import ArchiveToolbar, { type ArchiveTabId, type ArchiveViewMode } from './ArchiveToolbar';
import ArchiveUsageStatementView from './ArchiveUsageStatementView';
import type { ArchiveSeed, EvidenceFile, FolderEvidenceCategory } from '../../types/domain';
interface ArchiveScreenProps {
    matchReady: boolean;
    onDismissMatchReady: () => void;
    archiveSeed: ArchiveSeed | null;
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
const FOLDER_EVIDENCE_KINDS: FolderEvidenceCategory[] = ['receipt', 'site_photo', 'tax_invoice'];
export default function ArchiveScreen({ matchReady, onDismissMatchReady, archiveSeed }: ArchiveScreenProps) {
    const [tab, setTab] = useState<ArchiveTabId>('receipt');
    const [viewMode, setViewMode] = useState<ArchiveViewMode>('folder');
    const [dragFile, setDragFile] = useState<DragContext>(null);
    const [fileData, setFileData] = useState<ArchiveSeed>(() => normalizeArchiveData(archiveSeed || createDefaultArchiveData()));
    const [siteModalContext, setSiteModalContext] = useState<{
        catId: number;
        files: EvidenceFile[];
    } | null>(null);
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
    const getAllFilesForCategory = (catId: number) => {
        const merged = FOLDER_EVIDENCE_KINDS.flatMap((kind) => getFilesForCategory(kind, catId).map((file) => ({ ...file, kind })));
        return uniqueFiles(merged);
    };
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
        if (!confirm('이 사용내역서를 삭제하시겠습니까?'))
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
    const openArchiveAdd = (kind: FolderEvidenceCategory, catId: number) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = kind === 'site_photo' ? 'image/*' : 'image/*,.pdf,.xlsx';
        input.onchange = (e) => {
            const pickedFiles = Array.from((e.target as HTMLInputElement).files || []);
            if (kind === 'site_photo') {
                setSiteModalContext({ catId, files: pickedFiles.map((file) => createEntryFromFile(file, 'site_photo', { categoryIds: [catId] })) });
                return;
            }
            setFileData((prev) => {
                const next = { ...prev, [kind]: { ...prev[kind] } };
                next[kind][catId] = [...(next[kind][catId] || []), ...pickedFiles.map((file) => createEntryFromFile(file, kind, { categoryIds: [catId] }))];
                return next;
            });
        };
        input.click();
    };
    const totalVisibleFiles = viewMode === 'folder'
        ? uniqueFiles(CATS.flatMap((cat) => getAllFilesForCategory(cat.id))).length
        : viewMode === 'usage'
            ? fileData.usage_statement.length
            : uniqueFiles(CATS.flatMap((cat) => getFilesForCategory(tab, cat.id).map((file) => ({ ...file, kind: tab })))).length;
    return (<div data-ui="features-project-tab-archive-screen.div-1" style={{ background: C.soft, position: 'relative' }}>
      <div data-ui="features-project-tab-archive-screen.div-2" className="screen-enter">
        <div data-ui="features-project-tab-archive-screen.div-3" style={{ marginBottom: 20 }}>
          <h1 data-ui="features-project-tab-archive-screen.h1-1" style={{ fontSize: 30, fontWeight: 900, color: C.g800, letterSpacing: '-0.04em' }}>증빙 자료 아카이브</h1>
          <p data-ui="features-project-tab-archive-screen.p-1" style={{ fontSize: 14, color: C.g400, marginTop: 5 }}>폴더별 통합 보기, 자료유형별 보기, 프로젝트 기준 사용내역서 보기를 전환하면서 제출 자료를 확인할 수 있어요.</p>
        </div>

        {matchReady && (<Card style={{ marginBottom: 16, padding: '14px 18px', background: C.bg, border: `1px solid ${C.light}` }}>
            <div data-ui="features-project-tab-archive-screen.div-4" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div data-ui="features-project-tab-archive-screen.div-5" style={{ fontSize: 13, fontWeight: 700, color: C.primary }}>매칭 검토가 완료되었습니다. 파일을 드래그해 다른 폴더로 이동할 수 있습니다.</div>
              <button data-ui="features-project-tab-archive-screen.button-1" onClick={onDismissMatchReady} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.g400, fontSize: 18 }}>x</button>
            </div>
          </Card>)}

        <ArchiveToolbar viewMode={viewMode} tab={tab} totalVisibleFiles={totalVisibleFiles} onViewModeChange={setViewMode} onTabChange={(nextTab) => {
            setTab(nextTab);
            setHoverPreview(null);
        }}/>

        <div data-ui="features-project-tab-archive-screen.div-6" key={`${viewMode}-${tab}`} className="screen-enter">
          {viewMode === 'usage' ? (<ArchiveUsageStatementView files={fileData.usage_statement} onAdd={openUsageStatementAdd} onRemove={removeUsageStatement}/>) : (<ArchiveFolderGrid cats={CATS} viewMode={viewMode} tab={tab} dragFile={dragFile} getAllFilesForCategory={getAllFilesForCategory} getFilesForCategory={getFilesForCategory} onDropFile={(toCat) => {
            if (!dragFile)
                return;
            moveFile(dragFile.kind, dragFile.fromCat, toCat, dragFile.file);
            setDragFile(null);
        }} onSetDragFile={setDragFile} onAdd={openArchiveAdd} onRemove={removeArchiveFile} onPreview={(entry, x, y) => setHoverPreview({ entry, x, y })} onPreviewEnd={() => setHoverPreview(null)}/>)}
        </div>
      </div>

      <ArchivePreview hoverPreview={hoverPreview}/>

      <PhotoDescriptionModal open={Boolean(siteModalContext)} files={siteModalContext?.files || []} onClose={() => setSiteModalContext(null)} onSave={(values) => {
            if (!siteModalContext)
                return;
            setFileData((prev) => {
                const next = { ...prev, site_photo: { ...prev.site_photo } };
                next.site_photo[siteModalContext.catId] = [
                    ...(next.site_photo[siteModalContext.catId] || []),
                    ...siteModalContext.files.map((file) => ({
                        ...file,
                        description: values[file.name],
                        categoryIds: [siteModalContext.catId],
                    })),
                ];
                return next;
            });
            setSiteModalContext(null);
        }}/>
    </div>);
}
