import { useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from '../../components/ui/Modal';
import FileThumb from '../../components/ui/FileThumb';
import { fmt, isImageFile, makeThumbSvg, type UsageLineItem } from '../../lib/mock-data';
import { C } from '../../lib/theme';
import type { EvidenceFile, FolderEvidenceCategory } from '../../types/domain';

interface CategoryMeta {
  id: number;
  short: string;
}

export type HierarchyEvidenceKind = FolderEvidenceCategory | 'misc';

const EVIDENCE_SECTIONS: Array<{ id: FolderEvidenceCategory; label: string; requiredLabel: string }> = [
  { id: 'receipt', label: '영수증', requiredLabel: '영수증' },
  { id: 'site_photo', label: '사진', requiredLabel: '현장사진' },
  { id: 'tax_invoice', label: '세금계산서', requiredLabel: '세금계산서' },
  { id: 'other_document', label: '기타', requiredLabel: '기타 증빙' },
];

const REQUIRED_EVIDENCE_BY_CATEGORY: Record<number, FolderEvidenceCategory[]> = {
  1: ['receipt', 'tax_invoice', 'other_document'],
  2: ['receipt', 'site_photo'],
  3: ['receipt', 'other_document'],
  4: ['receipt', 'site_photo', 'other_document'],
  5: ['receipt', 'site_photo', 'tax_invoice', 'other_document'],
  6: ['receipt', 'site_photo'],
  7: ['receipt', 'tax_invoice', 'other_document'],
  8: ['receipt', 'other_document'],
  9: ['receipt', 'site_photo', 'tax_invoice'],
};

const REQUIRED_OTHER_DOCUMENTS_BY_CATEGORY: Record<number, string[]> = {
  1: ['안전관리자 선임계', '임금 지급대장'],
  3: ['보호구 지급대장'],
  4: ['진단 계약서', '진단 결과보고서'],
  5: ['교육 이수증', '참석자 명단'],
  7: ['기술지도 계약서', '기술지도 결과보고서'],
  8: ['전담조직 업무분장표', '인건비 산정 근거'],
};

const getRequiredEvidenceLabel = (kind: FolderEvidenceCategory, catId: number) => {
  if (kind !== 'other_document') {
    return EVIDENCE_SECTIONS.find((section) => section.id === kind)?.requiredLabel || '증빙';
  }

  const requiredDocuments = REQUIRED_OTHER_DOCUMENTS_BY_CATEGORY[catId];
  return requiredDocuments?.length ? requiredDocuments.join(', ') : '기타 서류명 확인 필요';
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
  onMove: (fromKind: HierarchyEvidenceKind, fromCatId: number, fromUsageItemId: string, toKind: HierarchyEvidenceKind, toCatId: number, file: EvidenceFile, toUsageItemId?: string) => void;
  onUploadMissing: (kind: FolderEvidenceCategory, catId: number) => void;
  isProblemFile?: (file: EvidenceFile) => boolean;
}

export default function ArchiveHierarchyView({ cats, usageItems, selectedCatId, selectedUsageItemId, getFiles, onSelectCat, onSelectUsageItem, onRemove, onMove, onUploadMissing, isProblemFile }: ArchiveHierarchyViewProps) {
  const [dragPayload, setDragPayload] = useState<{ kind: HierarchyEvidenceKind; catId: number; usageItemId: string; file: EvidenceFile } | null>(null);
  const [hoverPreview, setHoverPreview] = useState<{ file: EvidenceFile; x: number; y: number } | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ kind: FolderEvidenceCategory; catId: number; file: EvidenceFile } | null>(null);
  const [moveTargetCatId, setMoveTargetCatId] = useState(selectedCatId);
  const [moveTargetUsageItemId, setMoveTargetUsageItemId] = useState(selectedUsageItemId);
  const [moveTargetKind, setMoveTargetKind] = useState<FolderEvidenceCategory>('receipt');
  const filteredItems = usageItems.filter((item) => item.categoryId === selectedCatId);
  const activeItem = filteredItems.find((item) => item.id === selectedUsageItemId) || filteredItems[0] || usageItems[0];
  const activeCategory = cats.find((cat) => cat.id === selectedCatId) || cats[0];
  const requiredKinds = REQUIRED_EVIDENCE_BY_CATEGORY[selectedCatId] || ['receipt'];
  const allActiveFiles = EVIDENCE_SECTIONS.flatMap((section) => getFiles(section.id, selectedCatId, activeItem?.id));

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
    return (
      <div key={file.id} draggable onMouseLeave={() => setHoverPreview(null)} onDragStart={() => setDragPayload({ kind, catId: selectedCatId, usageItemId: activeItem?.id || selectedUsageItemId, file })} onDragEnd={() => setDragPayload(null)} style={{ border: `1px solid ${problem ? '#FFCDD2' : C.g100}`, background: problem ? C.dangerBg : C.white, borderRadius: 9, padding: '7px 8px', cursor: 'grab' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto 18px', alignItems: 'center', gap: 6 }}>
          <div style={{ minWidth: 0 }}>
            <div title={file.name} onMouseEnter={(event) => openTooltip(file, event.currentTarget)} style={{ fontSize: 12, color: C.g800, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</div>
            <div style={{ fontSize: 10, color: C.g400, marginTop: 2 }}>{file.uploadedAt || '날짜 미상'}</div>
          </div>
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
                const requiredKindsForCat = REQUIRED_EVIDENCE_BY_CATEGORY[cat.id] || [];
                const missingCount = requiredKindsForCat.filter((kind) => getFiles(kind, cat.id).length === 0).length;
                const hasProblem = EVIDENCE_SECTIONS.some((section) => getFiles(section.id, cat.id).some((file) => isProblemFile?.(file)));
                const flagged = missingCount > 0 || hasProblem;
                const active = cat.id === selectedCatId;
                return (
                  <button key={cat.id} type="button" onClick={() => onSelectCat(cat.id)} style={{ width: '100%', border: `1px solid ${flagged ? '#FFE082' : active ? C.light : C.g100}`, background: flagged ? C.warnBg : active ? C.bg : C.white, borderRadius: 10, padding: '8px 9px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: flagged ? C.warn : active ? C.primary : C.g800, lineHeight: 1.35, whiteSpace: 'pre-line', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{cat.short}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
                      <span style={{ fontSize: 10, color: C.g400, fontWeight: 800 }}>{items.length}개 세부</span>
                      <span style={{ fontSize: 10, color: flagged ? C.warn : C.g400, fontWeight: 900 }}>{flagged ? `${missingCount}개 누락` : `${count}건`}</span>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div title={activeItem?.name} style={{ fontSize: 15, color: C.g800, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activeItem?.name || activeCategory.short}</div>
                <div style={{ fontSize: 11, color: C.g400, marginTop: 4 }}>{activeCategory.short}{activeItem ? ` · ${fmt(activeItem.amount)}` : ''}</div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 900, color: C.primary, background: C.bg, borderRadius: 999, padding: '5px 9px', whiteSpace: 'nowrap' }}>{allActiveFiles.length}개 파일</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 9, maxHeight: 462, overflowY: 'auto', paddingRight: 4 }}>
              {EVIDENCE_SECTIONS.map((section) => {
                const files = getFiles(section.id, selectedCatId, activeItem?.id);
                const required = requiredKinds.includes(section.id);
                const missing = required && files.length === 0;
                const requiredEvidenceLabel = getRequiredEvidenceLabel(section.id, selectedCatId);
                return (
                  <div key={section.id} onDragOver={(event) => event.preventDefault()} onDrop={() => dropInto(section.id, selectedCatId)} style={{ border: `1px solid ${missing ? '#FFE082' : C.g100}`, borderRadius: 12, background: missing ? '#FFFDF0' : '#FCFEFD', padding: 9 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 900, color: missing ? C.warn : C.g800 }}>{section.label}</div>
                      <div style={{ fontSize: 10, fontWeight: 900, color: C.g400 }}>{files.length}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {files.map((file) => renderFileRow(section.id, file))}
                      {missing && (
                        <button type="button" onClick={() => onUploadMissing(section.id, selectedCatId)} style={{ width: '100%', border: '1px dashed #F9C74F', borderRadius: 10, padding: '10px 8px', background: C.warnBg, color: C.warn, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 900, lineHeight: 1.45, textAlign: 'left' }}>
                          {requiredEvidenceLabel}가 없습니다. 업로드하세요
                        </button>
                      )}
                      {!missing && files.length === 0 && <div style={{ border: `1px dashed ${C.g200}`, borderRadius: 10, padding: '12px 8px', color: C.g400, fontSize: 11, textAlign: 'center' }}>선택 자료 없음</div>}
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
