import { useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from '../../components/ui/Modal';
import FileThumb from '../../components/ui/FileThumb';
import { fmt, isImageFile, makeThumbSvg, type UsageLineItem } from '../../lib/evidence-utils';
import { C } from '../../lib/theme';
import type { EvidenceFile, FolderEvidenceCategory } from '../../types/domain';

interface CategoryMeta {
  id: number;
  short: string;
}

export type HierarchyEvidenceKind = FolderEvidenceCategory | 'misc';

const EVIDENCE_SECTIONS: Array<{ id: FolderEvidenceCategory; label: string }> = [
  { id: 'receipt', label: '영수증' },
  { id: 'site_photo', label: '사진' },
  { id: 'tax_invoice', label: '세금계산서' },
  { id: 'other_document', label: '기타' },
];
const REQUIRED_EVIDENCE_LABELS: Record<FolderEvidenceCategory, string> = {
  receipt: '영수증',
  site_photo: '현장사진',
  tax_invoice: '세금계산서',
  other_document: '기타 자료',
};
const badgeBaseStyle: React.CSSProperties = {
  borderRadius: 999,
  padding: '4px 8px',
  fontSize: 11,
  fontWeight: 900,
  lineHeight: 1.2,
  whiteSpace: 'nowrap',
};

interface ArchiveHierarchyViewProps {
  cats: CategoryMeta[];
  usageItems: UsageLineItem[];
  selectedCatId: number;
  selectedUsageItemId: string;
  getFiles: (kind: HierarchyEvidenceKind, catId: number, usageItemId?: string) => EvidenceFile[];
  onSelectCat: (catId: number) => void;
  onSelectUsageItem: (item: UsageLineItem) => void;
  onRemove: (kind: HierarchyEvidenceKind, catId: number, usageItemId: string, fileId: string) => void;
  onMove: (fromKind: HierarchyEvidenceKind, fromCatId: number, fromUsageItemId: string, toKind: HierarchyEvidenceKind, toCatId: number, file: EvidenceFile, toUsageItemId?: string) => void | Promise<void>;
  onUpload: (kind: FolderEvidenceCategory, catId: number, usageItemId: string) => void;
  onPreviewFile?: (file: EvidenceFile) => void;
  onDownloadFile?: (file: EvidenceFile) => void;
  isProblemFile?: (file: EvidenceFile) => boolean;
  getRequiredEvidence?: (kind: FolderEvidenceCategory, catId: number, usageItemId?: string) => string[];
}

export default function ArchiveHierarchyView({ cats, usageItems, selectedCatId, selectedUsageItemId, getFiles, onSelectCat, onSelectUsageItem, onRemove, onMove, onUpload, onPreviewFile, onDownloadFile, isProblemFile, getRequiredEvidence }: ArchiveHierarchyViewProps) {
  const [dragPayload, setDragPayload] = useState<{ kind: HierarchyEvidenceKind; catId: number; usageItemId: string; file: EvidenceFile } | null>(null);
  const [hoverPreview, setHoverPreview] = useState<{ file: EvidenceFile; x: number; y: number } | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ kind: FolderEvidenceCategory; catId: number; file: EvidenceFile } | null>(null);
  const [moveTargetCatId, setMoveTargetCatId] = useState(selectedCatId);
  const [moveTargetUsageItemId, setMoveTargetUsageItemId] = useState(selectedUsageItemId);
  const [moveTargetKind, setMoveTargetKind] = useState<FolderEvidenceCategory>('receipt');
  const filteredItems = usageItems.filter((item) => item.categoryId === selectedCatId);
  const activeItem = filteredItems.find((item) => item.id === selectedUsageItemId) || filteredItems[0];

  const dropInto = (kind: HierarchyEvidenceKind, catId: number) => {
    if (!dragPayload) return;
    onMove(dragPayload.kind, dragPayload.catId, dragPayload.usageItemId, kind, catId, dragPayload.file, activeItem?.id);
    setDragPayload(null);
  };

  const openTooltip = (file: EvidenceFile, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    setHoverPreview({
      file,
      x: rect.left,
      y: rect.bottom + 2,
    });
  };

  const openMoveModal = (kind: FolderEvidenceCategory, file: EvidenceFile) => {
    setMoveTarget({ kind, catId: selectedCatId, file });
    setMoveTargetCatId(selectedCatId);
    setMoveTargetUsageItemId(selectedUsageItemId);
    setMoveTargetKind(kind);
    setHoverPreview(null);
  };

  const confirmMove = () => {
    if (!moveTarget) return;
    onMove(moveTarget.kind, moveTarget.catId, selectedUsageItemId, moveTargetKind, moveTargetCatId, moveTarget.file, moveTargetUsageItemId);
    setMoveTarget(null);
  };
  const moveTargetUsageItems = usageItems.filter((item) => item.categoryId === moveTargetCatId);
  const selectedMoveTargetUsageItem = moveTargetUsageItems.find((item) => item.id === moveTargetUsageItemId) || moveTargetUsageItems[0];
  const selectMoveTargetCat = (catId: number) => {
    const nextUsageItem = usageItems.find((item) => item.categoryId === catId);
    setMoveTargetCatId(catId);
    setMoveTargetUsageItemId(nextUsageItem?.id || '');
  };

  const renderFileRow = (kind: FolderEvidenceCategory, file: EvidenceFile) => {
    const problem = Boolean(isProblemFile?.(file));
    const validation = file.visionValidation;
    return (
      <div key={file.id} draggable onMouseLeave={() => setHoverPreview(null)} onDragStart={() => setDragPayload({ kind, catId: selectedCatId, usageItemId: activeItem?.id || selectedUsageItemId, file })} onDragEnd={() => setDragPayload(null)} style={{ border: `1px solid ${problem ? '#FFCDD2' : C.g100}`, background: problem ? C.dangerBg : C.white, borderRadius: 9, padding: '7px 8px', cursor: 'grab' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto 18px', alignItems: 'center', gap: 6 }}>
          <div style={{ minWidth: 0 }}>
            <div title={file.name} onMouseEnter={(event) => openTooltip(file, event.currentTarget)} style={{ fontSize: 12, color: C.g800, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: C.g400 }}>{file.uploadedAt || '날짜 미상'}</span>
              {kind === 'site_photo' && validation && <span style={{ ...badgeBaseStyle, color: validation.status === 'suitable' ? C.ok : C.danger, background: validation.status === 'suitable' ? '#F4FBF6' : C.dangerBg, border: `1px solid ${validation.status === 'suitable' ? '#BFE6C8' : '#FFCDD2'}` }}>{validation.status === 'suitable' ? '적합' : '부적합'}</span>}
            </div>
          </div>
          <button type="button" disabled={!file.fileId} onClick={(event) => { event.stopPropagation(); onDownloadFile?.(file); }} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: file.fileId ? C.g600 : C.g400, cursor: file.fileId ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontSize: 10, fontWeight: 900, padding: '4px 7px' }}>다운</button>
          <button type="button" onClick={(event) => { event.stopPropagation(); openMoveModal(kind, file); }} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.primary, cursor: 'pointer', fontFamily: 'inherit', fontSize: 10, fontWeight: 900, padding: '4px 7px' }}>이동</button>
          <button type="button" onClick={(event) => { event.stopPropagation(); onRemove(kind, selectedCatId, activeItem?.id || selectedUsageItemId, file.id); }} style={{ border: 'none', background: 'transparent', color: C.g400, cursor: 'pointer', fontSize: 14 }}>×</button>
        </div>
      </div>
    );
  };

  const renderPreviewTooltip = () => {
    if (!hoverPreview || typeof document === 'undefined') return null;
    const file = hoverPreview.file;
    const previewSrc = file.previewUrl || `data:image/svg+xml;charset=UTF-8,${makeThumbSvg(file.kind)}`;
    const canShowImagePreview = Boolean(file.previewUrl || isImageFile(file.name));
    return createPortal(
      <div style={{ position: 'fixed', top: hoverPreview.y, left: hoverPreview.x, width: 260, background: C.white, border: `1px solid ${C.g200}`, borderRadius: 12, boxShadow: '0 12px 28px rgba(0,0,0,.16)', padding: 11, zIndex: 9999, pointerEvents: 'none' }}>
        <div style={{ borderRadius: 10, overflow: 'hidden', background: C.g100, marginBottom: 9, minHeight: 138, display: 'grid', placeItems: 'center' }}>
          {canShowImagePreview ? <img src={previewSrc} alt={file.name} style={{ width: '100%', height: 138, objectFit: 'cover', display: 'block' }} /> : <FileThumb entry={file} size={72} />}
        </div>
        <div style={{ fontSize: 13, fontWeight: 900, color: C.g800, marginBottom: 5, wordBreak: 'break-all' }}>{file.name}</div>
        <div style={{ fontSize: 11, color: C.g400, lineHeight: 1.5 }}>{file.uploadedBy || '업로더 미상'} · {file.uploadedAt || '날짜 미상'}</div>
        {file.description && <div style={{ marginTop: 6, fontSize: 11, color: C.g600, lineHeight: 1.5 }}>{file.description}</div>}
      </div>,
      document.body
    );
  };

  return (
    <div data-ui="archive-hierarchy-view.1" style={{ position: 'relative', width: '100%', minWidth: 0, overflow: 'visible' }}>
      <section style={{ background: C.white, border: `1px solid ${C.g200}`, borderRadius: 14, overflow: 'visible', minWidth: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, .72fr) minmax(180px, .9fr) minmax(0, 1.9fr)', borderBottom: `1px solid ${C.g100}`, background: '#FCFEFD', borderRadius: '14px 14px 0 0', minWidth: 0 }}>
          <div style={{ padding: '10.5px 14px', borderRight: `1px solid ${C.g100}`, fontSize: 12, color: C.g800, fontWeight: 900, display: 'flex', alignItems: 'center' }}>9개 항목</div>
          <div style={{ padding: '10.5px 14px', borderRight: `1px solid ${C.g100}`, fontSize: 12, color: C.g800, fontWeight: 900, display: 'flex', alignItems: 'center' }}>사용내역서 세부 항목</div>
          <div style={{ padding: '10.5px 14px', fontSize: 12, color: C.g800, fontWeight: 900, display: 'flex', alignItems: 'center' }}>파일보기</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, .72fr) minmax(180px, .9fr) minmax(0, 1.9fr)', minHeight: 540, minWidth: 0 }}>
          <div style={{ padding: 10, borderRight: `1px solid ${C.g100}`, overflow: 'hidden', minWidth: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 540, overflowY: 'auto', paddingRight: 3 }}>
              {cats.map((cat) => {
                const items = usageItems.filter((item) => item.categoryId === cat.id);
                const count = EVIDENCE_SECTIONS.reduce((sum, section) => sum + getFiles(section.id, cat.id).length, 0);
                const hasProblem = EVIDENCE_SECTIONS.some((section) => getFiles(section.id, cat.id).some((file) => isProblemFile?.(file)));
                const active = cat.id === selectedCatId;
                return (
                  <button key={cat.id} type="button" onClick={() => onSelectCat(cat.id)} style={{ width: '100%', border: `1px solid ${hasProblem ? '#FFCDD2' : active ? C.light : C.g100}`, background: hasProblem ? C.dangerBg : active ? C.bg : C.white, borderRadius: 10, padding: '8px 9px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: hasProblem ? C.danger : active ? C.primary : C.g800, lineHeight: 1.35, whiteSpace: 'pre-line', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{cat.short}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
                      <span style={{ fontSize: 10, color: C.g400, fontWeight: 800 }}>{items.length}개 세부</span>
                      <span style={{ fontSize: 10, color: hasProblem ? C.danger : C.g400, fontWeight: 900 }}>{count}건</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ padding: 10, borderRight: `1px solid ${C.g100}`, overflow: 'hidden', minWidth: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 540, overflowY: 'auto', paddingRight: 3 }}>
              {filteredItems.length === 0 && <div style={{ border: `1px dashed ${C.g200}`, borderRadius: 10, padding: 14, fontSize: 12, color: C.g400, textAlign: 'center' }}>OCR 항목이 없습니다</div>}
              {filteredItems.map((item) => {
                const active = item.id === activeItem.id;
                return (
                  <button key={item.id} type="button" onClick={() => onSelectUsageItem(item)} style={{ width: '100%', border: `1px solid ${active ? C.light : C.g100}`, background: active ? C.bg : C.white, borderRadius: 10, padding: '8px 9px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                    <div title={item.name} style={{ fontSize: 12, fontWeight: 900, color: active ? C.primary : C.g800, lineHeight: 1.35, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                    <div style={{ fontSize: 10, color: C.g400, fontWeight: 800, marginTop: 4 }}>{fmt(item.amount)}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ padding: 12, overflow: 'hidden', minWidth: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 9, maxHeight: 520, overflowY: 'auto', paddingRight: 4 }}>
              {EVIDENCE_SECTIONS.map((section) => {
                const files = getFiles(section.id, selectedCatId, activeItem?.id);
                const hasUnsuitableSitePhoto = section.id === 'site_photo' && files.some((file) => isProblemFile?.(file));
                const requiredEvidence = getRequiredEvidence?.(section.id, selectedCatId, activeItem?.id) || [];
                const uploadButton = (compact = false) => (
                  <button type="button" aria-label={`${section.label} 업로드`} onClick={() => onUpload(section.id, selectedCatId, activeItem?.id || selectedUsageItemId)} style={{ width: compact ? 24 : 32, height: compact ? 24 : 32, border: `1px solid ${C.light}`, borderRadius: 999, background: C.white, color: C.primary, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 900, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span aria-hidden="true" style={{ position: 'relative', width: compact ? 12 : 14, height: compact ? 12 : 14, display: 'inline-block' }}>
                      <span style={{ position: 'absolute', left: 0, top: compact ? 5 : 6, width: compact ? 12 : 14, height: 2, borderRadius: 999, background: C.primary }} />
                      <span style={{ position: 'absolute', left: compact ? 5 : 6, top: 0, width: 2, height: compact ? 12 : 14, borderRadius: 999, background: C.primary }} />
                    </span>
                  </button>
                );
                return (
                  <div key={section.id} onDragOver={(event) => event.preventDefault()} onDrop={() => dropInto(section.id, selectedCatId)} style={{ border: `1px solid ${C.g200}`, borderRadius: 12, background: '#FCFEFD', padding: 9 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 900, color: C.g800 }}>{section.label}</span>
                        {requiredEvidence.map((name) => (
                          <span key={name} style={{ ...badgeBaseStyle, background: '#FFF4D8', color: '#8A5A00', border: '1px solid #F2D59B' }}>
                            {name || REQUIRED_EVIDENCE_LABELS[section.id]} 제출 필요
                          </span>
                        ))}
                        {hasUnsuitableSitePhoto && (
                          <span style={{ ...badgeBaseStyle, background: C.dangerBg, color: C.danger, border: '1px solid #FFCDD2' }}>
                            현장사진 부적합
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 900, color: C.g400 }}>{files.length}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {files.map((file) => renderFileRow(section.id, file))}
                      {files.length > 0 && <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 2 }}>{uploadButton(true)}</div>}
                      {files.length === 0 && <div style={{ minHeight: 54, border: `1px dashed ${C.g200}`, borderRadius: 10, padding: '10px 8px', display: 'grid', placeItems: 'center' }}>{uploadButton(true)}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
      {renderPreviewTooltip()}
      <Modal open={Boolean(moveTarget)} onClose={() => setMoveTarget(null)} zIndex={980} maxWidth={760}>
        <div style={{ background: C.white, borderRadius: 18, border: `1px solid ${C.g200}`, boxShadow: '0 18px 44px rgba(0,0,0,.16)', overflow: 'hidden' }}>
          <div style={{ padding: '22px 24px 16px', borderBottom: `1px solid ${C.g100}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: C.g800 }}>파일 이동</div>
                <div title={moveTarget?.file.name} style={{ fontSize: 13, color: C.g600, fontWeight: 800, marginTop: 7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{moveTarget?.file.name}</div>
              </div>
              <button type="button" onClick={() => setMoveTarget(null)} style={{ border: 'none', background: 'transparent', color: C.g400, cursor: 'pointer', fontSize: 24, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: C.g400, fontWeight: 900 }}>현재 위치</span>
              <span style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '7px 11px', background: C.bg, color: C.primary, fontSize: 12, fontWeight: 900 }}>{cats.find((cat) => cat.id === moveTarget?.catId)?.short || '-'} · {EVIDENCE_SECTIONS.find((section) => section.id === moveTarget?.kind)?.label || '-'}</span>
            </div>
          </div>

          <div style={{ padding: '18px 24px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12, color: C.g400, fontSize: 12, fontWeight: 900 }}>
              <span>{cats.find((cat) => cat.id === moveTargetCatId)?.short || '9개 항목'}</span>
              <span>›</span>
              <span>{selectedMoveTargetUsageItem?.name || '사용내역서 세부 내용'}</span>
              <span>›</span>
              <span style={{ color: C.primary }}>{EVIDENCE_SECTIONS.find((section) => section.id === moveTargetKind)?.label || '자료 탭'}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px,.9fr) minmax(190px,1.1fr) minmax(150px,.8fr)', gap: 10, minHeight: 330 }}>
              <section style={{ border: `1px solid ${C.g200}`, borderRadius: 14, overflow: 'hidden', background: '#FCFEFD' }}>
                <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.g100}`, fontSize: 12, fontWeight: 900, color: C.g800 }}>9개 항목</div>
                <div style={{ maxHeight: 286, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {cats.map((cat) => {
                    const active = moveTargetCatId === cat.id;
                    return (
                      <button key={cat.id} type="button" onClick={() => selectMoveTargetCat(cat.id)} style={{ width: '100%', border: `1px solid ${active ? C.light : 'transparent'}`, borderRadius: 10, background: active ? C.bg : 'transparent', color: active ? C.primary : C.g800, padding: '9px 10px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 900, lineHeight: 1.35, wordBreak: 'keep-all' }}>
                        {cat.short}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section style={{ border: `1px solid ${C.g200}`, borderRadius: 14, overflow: 'hidden', background: '#FCFEFD' }}>
                <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.g100}`, fontSize: 12, fontWeight: 900, color: C.g800 }}>사용내역서 세부 내용</div>
                <div style={{ maxHeight: 286, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {moveTargetUsageItems.length === 0 && <div style={{ border: `1px dashed ${C.g200}`, borderRadius: 10, padding: 12, color: C.g400, fontSize: 12, textAlign: 'center' }}>세부 항목이 없습니다</div>}
                  {moveTargetUsageItems.map((item) => {
                    const active = moveTargetUsageItemId === item.id;
                    return (
                      <button key={item.id} type="button" onClick={() => setMoveTargetUsageItemId(item.id)} style={{ width: '100%', border: `1px solid ${active ? C.light : 'transparent'}`, borderRadius: 10, background: active ? C.bg : 'transparent', color: active ? C.primary : C.g800, padding: '9px 10px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
                        <div title={item.name} style={{ fontSize: 12, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                        <div style={{ fontSize: 10, color: C.g400, fontWeight: 800, marginTop: 3 }}>{fmt(item.amount)}</div>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section style={{ border: `1px solid ${C.g200}`, borderRadius: 14, overflow: 'hidden', background: '#FCFEFD' }}>
                <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.g100}`, fontSize: 12, fontWeight: 900, color: C.g800 }}>자료 탭</div>
                <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {EVIDENCE_SECTIONS.map((section) => {
                    const active = moveTargetKind === section.id;
                    return (
                      <button key={section.id} type="button" onClick={() => setMoveTargetKind(section.id)} style={{ width: '100%', border: `1px solid ${active ? C.light : 'transparent'}`, borderRadius: 10, background: active ? C.bg : 'transparent', color: active ? C.primary : C.g800, padding: '11px 10px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 900 }}>
                        {section.label}
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', padding: '16px 24px', background: '#FCFEFD', borderTop: `1px solid ${C.g100}` }}>
            <div style={{ fontSize: 12, color: C.g400, fontWeight: 800 }}>
              이동 후 선택한 항목의 파일보기에서 확인할 수 있습니다.
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button type="button" onClick={() => setMoveTarget(null)} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '9px 14px', background: C.white, color: C.g600, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer' }}>취소</button>
              <button type="button" onClick={confirmMove} disabled={!moveTarget || !moveTargetUsageItemId || (moveTarget.catId === moveTargetCatId && moveTarget.kind === moveTargetKind && selectedUsageItemId === moveTargetUsageItemId)} style={{ border: 'none', borderRadius: 999, padding: '9px 16px', background: C.primary, color: C.white, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: !moveTarget || !moveTargetUsageItemId || (moveTarget.catId === moveTargetCatId && moveTarget.kind === moveTargetKind && selectedUsageItemId === moveTargetUsageItemId) ? 'not-allowed' : 'pointer', opacity: !moveTarget || !moveTargetUsageItemId || (moveTarget.catId === moveTargetCatId && moveTarget.kind === moveTargetKind && selectedUsageItemId === moveTargetUsageItemId) ? 0.45 : 1 }}>이동</button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
