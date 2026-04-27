import { useState } from 'react';
import Button from '../../components/ui/Button';
import FileThumb from '../../components/ui/FileThumb';
import { isImageFile, makeThumbSvg } from '../../lib/mock-data';
import { C } from '../../lib/theme';
import type { EvidenceFile, FolderEvidenceCategory } from '../../types/domain';

interface CategoryMeta {
  id: number;
  short: string;
}

export type HierarchyEvidenceKind = FolderEvidenceCategory | 'misc';

const HIERARCHY_SECTIONS: Array<{ id: HierarchyEvidenceKind; label: string }> = [
  { id: 'receipt', label: '영수증' },
  { id: 'site_photo', label: '사진' },
  { id: 'tax_invoice', label: '세금계산서' },
  { id: 'other_document', label: '기타' },
];

interface ArchiveHierarchyViewProps {
  cats: CategoryMeta[];
  selectedCatId: number;
  selectedKind: HierarchyEvidenceKind;
  selectedFile: EvidenceFile | null;
  getFiles: (kind: HierarchyEvidenceKind, catId: number) => EvidenceFile[];
  onSelectCat: (catId: number) => void;
  onSelectKind: (kind: HierarchyEvidenceKind) => void;
  onSelectFile: (file: EvidenceFile) => void;
  onAdd: (kind: HierarchyEvidenceKind, catId: number) => void;
  onRemove: (kind: HierarchyEvidenceKind, catId: number, fileId: string) => void;
  onMove: (fromKind: HierarchyEvidenceKind, fromCatId: number, toKind: HierarchyEvidenceKind, toCatId: number, file: EvidenceFile) => void;
}

export default function ArchiveHierarchyView({ cats, selectedCatId, selectedKind, selectedFile, getFiles, onSelectCat, onSelectKind, onSelectFile, onAdd, onRemove, onMove }: ArchiveHierarchyViewProps) {
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const activeCat = cats.find((cat) => cat.id === selectedCatId) || cats[0];
  const activeSection = HIERARCHY_SECTIONS.find((section) => section.id === selectedKind) || HIERARCHY_SECTIONS[0];
  const activeFiles = getFiles(activeSection.id, activeCat.id);
  const previewSrc = selectedFile
    ? selectedFile.previewUrl || `data:image/svg+xml;charset=UTF-8,${makeThumbSvg(selectedFile.kind)}`
    : '';
  const canShowImagePreview = Boolean(selectedFile && (selectedFile.previewUrl || isImageFile(selectedFile.name)));
  const parseDragPayload = (event: React.DragEvent<HTMLElement>) => {
    const raw = event.dataTransfer.getData('application/json');
    if (!raw) return null;
    return JSON.parse(raw) as { kind: HierarchyEvidenceKind; catId: number; fileId: string };
  };

  return (
    <div data-ui="features-project-tab-archive-hierarchy-view.layout" style={{ display: 'grid', gridTemplateColumns: '230px 170px minmax(280px, 1fr) minmax(280px, .8fr)', gap: 14, alignItems: 'start' }}>
      <aside data-ui="features-project-tab-archive-hierarchy-view.category-panel" style={{ background: C.white, border: `1px solid ${C.g200}`, borderRadius: 18, padding: 12, overflow: 'hidden' }}>
        <div data-ui="features-project-tab-archive-hierarchy-view.category-title" style={{ fontSize: 12, color: C.g400, fontWeight: 900, margin: '4px 6px 10px' }}>9개 항목</div>
        <div data-ui="features-project-tab-archive-hierarchy-view.category-list" style={{ display: 'flex', flexDirection: 'column', gap: 7, overflowY: 'auto', paddingRight: 4 }}>
          {cats.map((cat) => {
            const count = HIERARCHY_SECTIONS.reduce((sum, section) => sum + getFiles(section.id, cat.id).length, 0);
            const active = cat.id === selectedCatId;
            return (
              <button data-ui="features-project-tab-archive-hierarchy-view.category-button" key={cat.id} type="button" onClick={() => onSelectCat(cat.id)} onDragOver={(event) => {
                event.preventDefault();
                setDropTarget(`cat-${cat.id}`);
              }} onDragLeave={() => setDropTarget(null)} onDrop={(event) => {
                event.preventDefault();
                setDropTarget(null);
                const payload = parseDragPayload(event);
                if (!payload) return;
                const movingFile = getFiles(payload.kind, payload.catId).find((file) => file.id === payload.fileId);
                if (movingFile) onMove(payload.kind, payload.catId, payload.kind, cat.id, movingFile);
              }} style={{ width: '100%', border: `1px solid ${dropTarget === `cat-${cat.id}` ? C.primary : active ? C.light : C.g100}`, background: dropTarget === `cat-${cat.id}` ? C.bg : active ? C.bg : C.white, borderRadius: 12, padding: '10px 11px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', boxShadow: dropTarget === `cat-${cat.id}` ? `0 0 0 3px ${C.primary}18` : undefined }}>
                <div data-ui="features-project-tab-archive-hierarchy-view.category-button-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span data-ui="features-project-tab-archive-hierarchy-view.category-name" style={{ fontSize: 12, fontWeight: 900, color: active ? C.primary : C.g800, lineHeight: 1.35 }}>{cat.short}</span>
                  <span data-ui="features-project-tab-archive-hierarchy-view.category-count" style={{ fontSize: 10, fontWeight: 900, color: active ? C.primary : C.g400, whiteSpace: 'nowrap' }}>{count}개</span>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <aside data-ui="features-project-tab-archive-hierarchy-view.kind-panel" style={{ background: C.white, border: `1px solid ${C.g200}`, borderRadius: 18, padding: 12, overflow: 'hidden' }}>
        <div data-ui="features-project-tab-archive-hierarchy-view.kind-title" style={{ fontSize: 12, color: C.g400, fontWeight: 900, margin: '4px 6px 10px' }}>자료 유형</div>
        <div data-ui="features-project-tab-archive-hierarchy-view.kind-list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {HIERARCHY_SECTIONS.map((section) => {
            const count = getFiles(section.id, activeCat.id).length;
            const active = section.id === selectedKind;
            return (
              <button data-ui="features-project-tab-archive-hierarchy-view.kind-button" key={section.id} type="button" onClick={() => onSelectKind(section.id)} onDragOver={(event) => {
                event.preventDefault();
                setDropTarget(`kind-${section.id}`);
              }} onDragLeave={() => setDropTarget(null)} onDrop={(event) => {
                event.preventDefault();
                setDropTarget(null);
                const payload = parseDragPayload(event);
                if (!payload) return;
                const movingFile = getFiles(payload.kind, payload.catId).find((file) => file.id === payload.fileId);
                if (movingFile) onMove(payload.kind, payload.catId, section.id, activeCat.id, movingFile);
              }} style={{ width: '100%', border: `1px solid ${dropTarget === `kind-${section.id}` ? C.primary : active ? C.light : C.g100}`, background: dropTarget === `kind-${section.id}` ? C.bg : active ? C.bg : C.white, borderRadius: 13, padding: '12px 11px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', boxShadow: dropTarget === `kind-${section.id}` ? `0 0 0 3px ${C.primary}18` : undefined }}>
                <div data-ui="features-project-tab-archive-hierarchy-view.kind-button-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span data-ui="features-project-tab-archive-hierarchy-view.kind-name" style={{ fontSize: 12, fontWeight: 900, color: active ? C.primary : C.g800 }}>{section.label}</span>
                  <span data-ui="features-project-tab-archive-hierarchy-view.kind-count" style={{ fontSize: 10, fontWeight: 900, color: active ? C.primary : C.g400 }}>{count}개</span>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <section data-ui="features-project-tab-archive-hierarchy-view.file-panel" style={{ background: C.white, border: `1px solid ${C.g200}`, borderRadius: 18, padding: 16, overflow: 'hidden' }}>
        <div data-ui="features-project-tab-archive-hierarchy-view.file-panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div data-ui="features-project-tab-archive-hierarchy-view.file-panel-title" style={{ minWidth: 0 }}>
            <div data-ui="features-project-tab-archive-hierarchy-view.file-panel-label" style={{ fontSize: 11, color: C.g400, fontWeight: 900, marginBottom: 3 }}>세부 파일</div>
            <div data-ui="features-project-tab-archive-hierarchy-view.file-panel-name" style={{ fontSize: 15, color: C.g800, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activeCat.short} / {activeSection.label}</div>
          </div>
          <Button size="sm" variant="outline" style={{ padding: '8px 10px', fontSize: 11 }} onClick={() => onAdd(activeSection.id, activeCat.id)}>업로드</Button>
        </div>
        <div data-ui="features-project-tab-archive-hierarchy-view.file-list" onDragOver={(event) => {
          event.preventDefault();
          setDropTarget('file-list');
        }} onDragLeave={() => setDropTarget(null)} onDrop={(event) => {
          event.preventDefault();
          setDropTarget(null);
          const payload = parseDragPayload(event);
          if (!payload) return;
          const movingFile = getFiles(payload.kind, payload.catId).find((file) => file.id === payload.fileId);
          if (movingFile) onMove(payload.kind, payload.catId, activeSection.id, activeCat.id, movingFile);
        }} style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 482, overflowY: 'auto', padding: dropTarget === 'file-list' ? '8px' : '0 4px 0 0', border: `1px dashed ${dropTarget === 'file-list' ? C.primary : 'transparent'}`, borderRadius: 14, background: dropTarget === 'file-list' ? C.bg : 'transparent', transition: 'background .15s ease, border-color .15s ease, padding .15s ease' }}>
          {activeFiles.length === 0 && <div data-ui="features-project-tab-archive-hierarchy-view.empty-file-list" style={{ minHeight: 220, border: `1px dashed ${C.g200}`, borderRadius: 12, display: 'grid', placeItems: 'center', color: C.g400, fontSize: 12, fontWeight: 800, textAlign: 'center' }}>첨부 파일 없음</div>}
          {activeFiles.map((file) => {
            const active = selectedFile?.id === file.id;
            return (
              <button data-ui="features-project-tab-archive-hierarchy-view.file-row" key={`${activeSection.id}-${file.id}`} type="button" draggable onDragStart={(event) => {
                event.dataTransfer.setData('application/json', JSON.stringify({ kind: activeSection.id, catId: activeCat.id, fileId: file.id }));
                event.dataTransfer.effectAllowed = 'move';
              }} onClick={() => onSelectFile(file)} style={{ display: 'grid', gridTemplateColumns: '34px minmax(0,1fr) 22px', alignItems: 'center', gap: 9, border: `1px solid ${active ? C.light : C.g100}`, borderRadius: 12, background: active ? C.bg : '#FCFEFD', padding: '8px 9px', cursor: 'grab', fontFamily: 'inherit', textAlign: 'left' }}>
                <FileThumb entry={file} size={34}/>
                <span data-ui="features-project-tab-archive-hierarchy-view.file-name" style={{ minWidth: 0, fontSize: 12, fontWeight: 800, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</span>
                <span data-ui="features-project-tab-archive-hierarchy-view.remove-file" role="button" tabIndex={0} onClick={(event) => {
                  event.stopPropagation();
                  onRemove(activeSection.id, activeCat.id, file.id);
                }} style={{ border: 'none', color: C.g400, fontSize: 14, textAlign: 'center' }}>x</span>
              </button>
            );
          })}
        </div>
      </section>

      <aside data-ui="features-project-tab-archive-hierarchy-view.preview-panel" style={{ background: C.white, border: `1px solid ${C.g200}`, borderRadius: 18, padding: 16, minWidth: 0 }}>
        <div data-ui="features-project-tab-archive-hierarchy-view.preview-title" style={{ fontSize: 13, fontWeight: 900, color: C.g800, marginBottom: 12 }}>미리보기</div>
        {selectedFile ? (
          <>
            <div data-ui="features-project-tab-archive-hierarchy-view.preview-box" style={{ border: `1px solid ${C.g100}`, borderRadius: 16, background: '#FCFEFD', minHeight: 320, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
              {canShowImagePreview ? <img data-ui="features-project-tab-archive-hierarchy-view.preview-image" src={previewSrc} alt={selectedFile.name} style={{ width: '100%', height: '100%', minHeight: 320, objectFit: 'cover', display: 'block' }}/> : <FileThumb entry={selectedFile} size={120}/>}
            </div>
            <div data-ui="features-project-tab-archive-hierarchy-view.preview-file-name" style={{ fontSize: 13, fontWeight: 900, color: C.g800, marginTop: 14, wordBreak: 'break-all' }}>{selectedFile.name}</div>
            <div data-ui="features-project-tab-archive-hierarchy-view.preview-meta" style={{ fontSize: 11, color: C.g400, marginTop: 6 }}>업로드일 {selectedFile.uploadedAt || '날짜 미상'}</div>
          </>
        ) : (
          <div data-ui="features-project-tab-archive-hierarchy-view.preview-empty" style={{ minHeight: 320, border: `1px dashed ${C.g200}`, borderRadius: 16, display: 'grid', placeItems: 'center', color: C.g400, fontSize: 13, fontWeight: 800 }}>가운데 목록에서 파일을 선택하세요</div>
        )}
      </aside>
    </div>
  );
}
