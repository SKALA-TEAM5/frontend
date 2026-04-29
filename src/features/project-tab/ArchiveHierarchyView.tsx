import { useState } from 'react';
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
  onRemove: (kind: HierarchyEvidenceKind, catId: number, fileId: string) => void;
  onMove: (fromKind: HierarchyEvidenceKind, fromCatId: number, toKind: HierarchyEvidenceKind, toCatId: number, file: EvidenceFile) => void;
  isProblemFile?: (file: EvidenceFile) => boolean;
}

export default function ArchiveHierarchyView({ cats, selectedCatId, selectedKind, selectedFile, getFiles, onSelectCat, onSelectKind, onSelectFile, onRemove, onMove, isProblemFile }: ArchiveHierarchyViewProps) {
  const [dragPayload, setDragPayload] = useState<{ kind: HierarchyEvidenceKind; catId: number; file: EvidenceFile } | null>(null);
  const activeCat = cats.find((cat) => cat.id === selectedCatId) || cats[0];
  const activeSection = HIERARCHY_SECTIONS.find((section) => section.id === selectedKind) || HIERARCHY_SECTIONS[0];
  const activeFiles = getFiles(activeSection.id, activeCat.id);
  const previewSrc = selectedFile ? selectedFile.previewUrl || `data:image/svg+xml;charset=UTF-8,${makeThumbSvg(selectedFile.kind)}` : '';
  const canShowImagePreview = Boolean(selectedFile && (selectedFile.previewUrl || isImageFile(selectedFile.name)));

  const dropInto = (kind: HierarchyEvidenceKind, catId: number) => {
    if (!dragPayload) return;
    onMove(dragPayload.kind, dragPayload.catId, kind, catId, dragPayload.file);
    setDragPayload(null);
  };

  return (
    <div data-ui="archive-hierarchy-view.1" style={{ display: 'grid', gridTemplateColumns: '240px 120px minmax(150px, .66fr) minmax(160px, .48fr)', gap: 9, alignItems: 'start' }}>
      <aside style={{ background: C.white, border: `1px solid ${C.g200}`, borderRadius: 14, padding: 10, overflow: 'hidden' }}>
        <div style={{ fontSize: 12, color: C.g400, fontWeight: 900, margin: '3px 5px 8px' }}>9개 항목</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', paddingRight: 3 }}>
          {cats.map((cat) => {
            const count = HIERARCHY_SECTIONS.reduce((sum, section) => sum + getFiles(section.id, cat.id).length, 0);
            const hasProblem = HIERARCHY_SECTIONS.some((section) => getFiles(section.id, cat.id).some((file) => isProblemFile?.(file)));
            const active = cat.id === selectedCatId;
            return (
              <button key={cat.id} type="button" onClick={() => onSelectCat(cat.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropInto(selectedKind, cat.id)} style={{ width: '100%', border: `1px solid ${hasProblem ? '#FFCDD2' : active ? C.light : C.g100}`, background: hasProblem ? C.dangerBg : active ? C.bg : C.white, borderRadius: 10, padding: '8px 9px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 900, color: hasProblem ? C.danger : active ? C.primary : C.g800, lineHeight: 1.35, whiteSpace: 'pre-line' }}>{cat.short}</span>
                  <span style={{ fontSize: 11, fontWeight: 900, color: hasProblem ? C.danger : active ? C.primary : C.g400, whiteSpace: 'nowrap' }}>{count}건</span>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <aside style={{ background: C.white, border: `1px solid ${C.g200}`, borderRadius: 14, padding: 10 }}>
        <div style={{ fontSize: 12, color: C.g400, fontWeight: 900, margin: '3px 5px 8px' }}>자료 종류</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {HIERARCHY_SECTIONS.map((section) => {
            const count = getFiles(section.id, activeCat.id).length;
            const hasProblem = getFiles(section.id, activeCat.id).some((file) => isProblemFile?.(file));
            const active = section.id === selectedKind;
            return (
              <button key={section.id} type="button" onClick={() => onSelectKind(section.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropInto(section.id, activeCat.id)} style={{ width: '100%', border: `1px solid ${hasProblem ? '#FFCDD2' : active ? C.light : C.g100}`, background: hasProblem ? C.dangerBg : active ? C.bg : C.white, borderRadius: 10, padding: '9px 9px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 900, color: hasProblem ? C.danger : active ? C.primary : C.g800 }}>{section.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 900, color: hasProblem ? C.danger : active ? C.primary : C.g400 }}>{count}건</span>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <section style={{ background: C.white, border: `1px solid ${C.g200}`, borderRadius: 14, padding: 10, minHeight: 380 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', margin: '3px 5px 8px' }}>
          <div>
            <div style={{ fontSize: 12, color: C.g400, fontWeight: 900 }}>선택 파일</div>
          </div>
        </div>
        <div onDragOver={(event) => event.preventDefault()} onDrop={() => dropInto(activeSection.id, activeCat.id)} style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 328, overflowY: 'auto', paddingRight: 3 }}>
          {activeFiles.length === 0 && <div style={{ border: `1px dashed ${C.g200}`, borderRadius: 12, padding: 22, textAlign: 'center', color: C.g400, fontSize: 12 }}>이 폴더에 파일이 없습니다</div>}
          {activeFiles.map((file) => {
            const problem = Boolean(isProblemFile?.(file));
            return (
            <div key={file.id} draggable onDragStart={() => setDragPayload({ kind: activeSection.id, catId: activeCat.id, file })} onDragEnd={() => setDragPayload(null)} onClick={() => onSelectFile(file)} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 20px', alignItems: 'center', gap: 7, border: `1px solid ${problem ? '#FFCDD2' : selectedFile?.id === file.id ? C.light : C.g100}`, background: problem ? C.dangerBg : selectedFile?.id === file.id ? C.bg : '#FCFEFD', borderRadius: 10, padding: '8px 9px', cursor: 'pointer' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: C.g800, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</div>
                <div style={{ fontSize: 11, color: C.g400, marginTop: 2 }}>{file.uploadedBy || '업로더 미상'} · {file.uploadedAt || '날짜 미상'}</div>
              </div>
              <button type="button" onClick={(event) => { event.stopPropagation(); onRemove(activeSection.id, activeCat.id, file.id); }} style={{ border: 'none', background: 'transparent', color: C.g400, cursor: 'pointer', fontSize: 14 }}>×</button>
            </div>
          );
          })}
        </div>
      </section>

      <section style={{ background: C.white, border: `1px solid ${C.g200}`, borderRadius: 14, padding: 10, minHeight: 380 }}>
        {selectedFile ? (
          <div>
            <div style={{ border: `1px solid ${C.g100}`, borderRadius: 12, minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FCFEFD', overflow: 'hidden' }}>
              {canShowImagePreview ? <img src={previewSrc} alt={selectedFile.name} style={{ maxWidth: '100%', maxHeight: 240, objectFit: 'contain' }}/> : <FileThumb entry={selectedFile} size={82}/>}
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: C.g800, fontWeight: 900, wordBreak: 'break-all' }}>{selectedFile.name}</div>
            <div style={{ marginTop: 4, fontSize: 11, color: C.g400 }}>{selectedFile.uploadedBy || '업로더 미상'} · {selectedFile.uploadedAt || '날짜 미상'}</div>
            {selectedFile.description && <div style={{ marginTop: 8, fontSize: 11, color: C.g600, lineHeight: 1.45 }}>{selectedFile.description}</div>}
          </div>
        ) : (
          <div style={{ border: `1px dashed ${C.g200}`, borderRadius: 12, padding: 22, textAlign: 'center', color: C.g400, fontSize: 12 }}>파일을 선택하면 상세 정보가 표시됩니다</div>
        )}
      </section>
    </div>
  );
}
