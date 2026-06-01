import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Modal from '../../components/ui/Modal';
import FileThumb from '../../components/ui/FileThumb';
import { calculateUsageLineAmount, fmt, isImageFile, makeThumbSvg, parseUsageNumber, type UsageLineItem } from '../../lib/evidence-utils';
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
interface UsageDetailFileViewProps {
  cats: CategoryMeta[];
  usageItems: UsageLineItem[];
  selectedCatId: number;
  selectedUsageItemId: string;
  actionRequest?: { title: string; message: string; dueDate?: string };
  getFiles: (kind: HierarchyEvidenceKind, catId: number, usageItemId?: string) => EvidenceFile[];
  onSelectCat: (catId: number) => void;
  onSelectUsageItem: (item: UsageLineItem) => void;
  onRemove: (kind: HierarchyEvidenceKind, catId: number, usageItemId: string, fileId: string) => void;
  onRename: (kind: HierarchyEvidenceKind, catId: number, usageItemId: string, file: EvidenceFile, nextName: string) => void;
  onMove: (fromKind: HierarchyEvidenceKind, fromCatId: number, fromUsageItemId: string, toKind: HierarchyEvidenceKind, toCatId: number, file: EvidenceFile, toUsageItemId?: string) => void | Promise<void>;
  onEditUsageItem: (usageItemId: string, input: { categoryId: number; name: string; date: string; unit: string; quantity: number; unitPrice: number; amount: number }) => void | Promise<void>;
  onAddUsageItem: () => void;
  onDeleteUsageItem: (item: UsageLineItem) => void;
  onUpload: (kind: FolderEvidenceCategory, catId: number, usageItemId: string) => void;
  onDownloadFile?: (file: EvidenceFile) => void;
  isProblemFile?: (file: EvidenceFile) => boolean;
  isSupplementTarget?: (catId: number, usageItemId?: string) => boolean;
  fileHeaderAction?: ReactNode;
  renderEvidenceTodos?: (kind: FolderEvidenceCategory) => ReactNode;
}

const PlusIcon = ({ size = 14, color = C.primary }: { size?: number; color?: string }) => (
  <span aria-hidden="true" style={{ position: 'relative', width: size, height: size, display: 'inline-block' }}>
    <span style={{ position: 'absolute', left: 0, top: Math.floor(size / 2) - 1, width: size, height: 2, borderRadius: 999, background: color }} />
    <span style={{ position: 'absolute', left: Math.floor(size / 2) - 1, top: 0, width: 2, height: size, borderRadius: 999, background: color }} />
  </span>
);

const MoreIcon = ({ color = C.g600 }: { color?: string }) => (
  <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
    {[0, 1, 2].map((dot) => (
      <span key={dot} style={{ width: 3, height: 3, borderRadius: 999, background: color }} />
    ))}
  </span>
);

export default function UsageDetailFileView({ cats, usageItems, selectedCatId, selectedUsageItemId, actionRequest, getFiles, onSelectCat, onSelectUsageItem, onRemove, onRename, onMove, onEditUsageItem, onAddUsageItem, onDeleteUsageItem, onUpload, onDownloadFile, isProblemFile, isSupplementTarget, fileHeaderAction, renderEvidenceTodos }: UsageDetailFileViewProps) {
  const [dragPayload, setDragPayload] = useState<{ kind: HierarchyEvidenceKind; catId: number; usageItemId: string; file: EvidenceFile } | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ kind: FolderEvidenceCategory; catId: number; file: EvidenceFile } | null>(null);
  const [openFileMenu, setOpenFileMenu] = useState<{ kind: FolderEvidenceCategory; file: EvidenceFile; top: number; left: number } | null>(null);
  const fileMenuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [previewTarget, setPreviewTarget] = useState<EvidenceFile | null>(null);
  const [showVisionBoxes, setShowVisionBoxes] = useState(true);
  const [fileEditDraft, setFileEditDraft] = useState('');
  const [editUsageItemTarget, setEditUsageItemTarget] = useState<UsageLineItem | null>(null);
  const [editUsageItemDraft, setEditUsageItemDraft] = useState({ categoryId: selectedCatId, name: '', date: '', unit: '', quantity: '', unitPrice: '' });
  const [editUsageItemError, setEditUsageItemError] = useState('');
  const [moveTargetCatId, setMoveTargetCatId] = useState(selectedCatId);
  const [moveTargetUsageItemId, setMoveTargetUsageItemId] = useState(selectedUsageItemId);
  const [moveTargetKind, setMoveTargetKind] = useState<FolderEvidenceCategory>('receipt');
  const filteredItems = usageItems.filter((item) => item.categoryId === selectedCatId);
  const activeItem = filteredItems.find((item) => item.id === selectedUsageItemId) || filteredItems[0];
  const layoutColumns = 'minmax(140px, .5fr) minmax(620px, 1.24fr) minmax(250px, .84fr)';
  const usageItemGridColumns = '72px minmax(120px, .78fr) 32px 36px 78px 84px';
  const usageItemRowColumns = `${usageItemGridColumns} 66px`;
  const actionRequestText = `${actionRequest?.title || ''} ${actionRequest?.message || ''}`;
  const normalizeRequestText = (value: string) => value.replace(/\s+/g, '').toLowerCase();
  const normalizedActionRequestText = normalizeRequestText(actionRequestText);
  const isActionRequestedCat = (catId: number) => {
    if (!normalizedActionRequestText) return false;
    const cat = cats.find((item) => item.id === catId);
    return Boolean(cat && normalizeRequestText(cat.short) && normalizedActionRequestText.includes(normalizeRequestText(cat.short)));
  };
  const isActionRequestedUsageItem = (item: UsageLineItem) => {
    if (!normalizedActionRequestText) return false;
    const normalizedItemName = normalizeRequestText(item.name);
    return Boolean(normalizedItemName && normalizedActionRequestText.includes(normalizedItemName)) || isActionRequestedCat(item.categoryId);
  };
  const dropInto = (kind: HierarchyEvidenceKind, catId: number) => {
    if (!dragPayload) return;
    onMove(dragPayload.kind, dragPayload.catId, dragPayload.usageItemId, kind, catId, dragPayload.file, activeItem?.id);
    setDragPayload(null);
  };

  const openFileEditModal = (kind: FolderEvidenceCategory, file: EvidenceFile) => {
    setMoveTarget({ kind, catId: selectedCatId, file });
    setFileEditDraft(file.name);
    setMoveTargetCatId(selectedCatId);
    setMoveTargetUsageItemId(selectedUsageItemId);
    setMoveTargetKind(kind);
    setOpenFileMenu(null);
  };

  const confirmMove = () => {
    if (!moveTarget) return;
    onMove(moveTarget.kind, moveTarget.catId, selectedUsageItemId, moveTargetKind, moveTargetCatId, moveTarget.file, moveTargetUsageItemId);
    setMoveTarget(null);
    setFileEditDraft('');
  };
  const closeFileEditModal = () => {
    setMoveTarget(null);
    setFileEditDraft('');
  };
  const confirmRenameFile = () => {
    if (!moveTarget || !fileEditDraft.trim()) return;
    onRename(moveTarget.kind, moveTarget.catId, selectedUsageItemId, moveTarget.file, fileEditDraft);
    setMoveTarget({ ...moveTarget, file: { ...moveTarget.file, name: fileEditDraft.trim() } });
  };
  const openEditUsageItemModal = (item: UsageLineItem) => {
    setEditUsageItemTarget(item);
    setEditUsageItemDraft({
      categoryId: item.categoryId,
      name: item.name,
      date: item.date || '',
      unit: item.unit || '',
      quantity: item.quantity == null ? '' : String(item.quantity),
      unitPrice: item.unitPrice == null ? '' : String(item.unitPrice),
    });
    setEditUsageItemError('');
  };
  const confirmEditUsageItem = async () => {
    if (!editUsageItemTarget) return;
    const name = editUsageItemDraft.name.trim();
    const date = editUsageItemDraft.date.trim();
    const quantity = parseUsageNumber(editUsageItemDraft.quantity);
    const unitPrice = parseUsageNumber(editUsageItemDraft.unitPrice);
    const amount = calculateUsageLineAmount(quantity, unitPrice);
    if (!name) {
      setEditUsageItemError('항목명을 입력해 주세요.');
      return;
    }
    if (!date) {
      setEditUsageItemError('사용일자를 입력해 주세요.');
      return;
    }
    if (quantity <= 0) {
      setEditUsageItemError('수량을 입력해 주세요.');
      return;
    }
    if (unitPrice <= 0) {
      setEditUsageItemError('단가를 입력해 주세요.');
      return;
    }
    setEditUsageItemError('');
    try {
      await onEditUsageItem(editUsageItemTarget.id, {
        categoryId: editUsageItemDraft.categoryId,
        name,
        date,
        unit: editUsageItemDraft.unit.trim(),
        quantity,
        unitPrice,
        amount,
      });
      setEditUsageItemTarget(null);
    } catch (error) {
      setEditUsageItemError(error instanceof Error ? error.message : '세부항목 수정에 실패했습니다.');
    }
  };
  const moveTargetUsageItems = usageItems.filter((item) => item.categoryId === moveTargetCatId);
  const selectedMoveTargetUsageItem = moveTargetUsageItems.find((item) => item.id === moveTargetUsageItemId) || moveTargetUsageItems[0];
  const selectMoveTargetCat = (catId: number) => {
    const nextUsageItem = usageItems.find((item) => item.categoryId === catId);
    setMoveTargetCatId(catId);
    setMoveTargetUsageItemId(nextUsageItem?.id || '');
  };
  useEffect(() => {
    if (!openFileMenu) return;
    const updateFileMenuPosition = () => {
      const anchor = fileMenuAnchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      setOpenFileMenu((current) => current ? { ...current, top: rect.top, left: rect.right + 4 } : current);
    };
    window.addEventListener('scroll', updateFileMenuPosition, true);
    window.addEventListener('resize', updateFileMenuPosition);
    return () => {
      window.removeEventListener('scroll', updateFileMenuPosition, true);
      window.removeEventListener('resize', updateFileMenuPosition);
    };
  }, [openFileMenu]);

  const renderFileRow = (kind: FolderEvidenceCategory, file: EvidenceFile) => {
    const problem = Boolean(isProblemFile?.(file));
    return (
      <div key={file.id} draggable onDragStart={() => setDragPayload({ kind, catId: selectedCatId, usageItemId: activeItem?.id || selectedUsageItemId, file })} onDragEnd={() => setDragPayload(null)} style={{ position: 'relative', border: `1px solid ${problem ? '#FFCDD2' : C.g100}`, background: problem ? C.dangerBg : C.white, borderRadius: 9, padding: '7px 8px', cursor: 'grab' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'center', gap: 6 }}>
          <div style={{ minWidth: 0 }}>
            <div title={file.name} style={{ fontSize: 12, color: C.g800, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: C.g400 }}>{file.uploadedAt || '날짜 미상'}</span>
            </div>
          </div>
          <button type="button" aria-label={`${file.name} 더보기`} onClick={(event) => { event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); const isOpen = openFileMenu?.file.id === file.id && openFileMenu.kind === kind; fileMenuAnchorRef.current = isOpen ? null : event.currentTarget; setOpenFileMenu(isOpen ? null : { kind, file, top: rect.top, left: rect.right + 4 }); }} style={{ width: 26, height: 26, border: 'none', borderRadius: 999, background: 'transparent', color: openFileMenu?.file.id === file.id && openFileMenu.kind === kind ? C.g800 : C.g400, cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <MoreIcon color={openFileMenu?.file.id === file.id && openFileMenu.kind === kind ? C.g800 : C.g400} />
          </button>
        </div>
      </div>
    );
  };

  const renderFileMenu = () => {
    if (!openFileMenu || typeof document === 'undefined') return null;
    const menuWidth = 58;
    const left = Math.min(openFileMenu.left, window.innerWidth - menuWidth - 8);
    return createPortal(
      <div style={{ position: 'fixed', top: openFileMenu.top, left, zIndex: 1100, width: menuWidth, border: `1px solid ${C.g200}`, borderRadius: 8, background: C.white, boxShadow: '0 12px 26px rgba(31,47,39,.14)', padding: 3 }}>
        <button type="button" onClick={(event) => { event.stopPropagation(); fileMenuAnchorRef.current = null; setPreviewTarget(openFileMenu.file); setShowVisionBoxes(true); setOpenFileMenu(null); }} style={{ width: '100%', border: 'none', borderRadius: 6, background: 'transparent', color: C.g800, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 900, padding: '6px 4px', textAlign: 'center' }}>미리보기</button>
        <div style={{ height: 1, background: C.g100, margin: '2px 4px' }} />
        <button type="button" onClick={(event) => { event.stopPropagation(); fileMenuAnchorRef.current = null; openFileEditModal(openFileMenu.kind, openFileMenu.file); }} style={{ width: '100%', border: 'none', borderRadius: 6, background: 'transparent', color: C.g800, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 900, padding: '6px 4px', textAlign: 'center' }}>수정</button>
        <div style={{ height: 1, background: C.g100, margin: '2px 4px' }} />
        <button type="button" onClick={(event) => { event.stopPropagation(); fileMenuAnchorRef.current = null; setOpenFileMenu(null); onRemove(openFileMenu.kind, selectedCatId, activeItem?.id || selectedUsageItemId, openFileMenu.file.id); }} style={{ width: '100%', border: 'none', borderRadius: 6, background: 'transparent', color: C.danger, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 900, padding: '6px 4px', textAlign: 'center' }}>삭제</button>
      </div>,
      document.body,
    );
  };

  const renderPreviewOverlay = () => {
    if (!previewTarget) return null;
    const previewSrc = previewTarget.previewUrl || `data:image/svg+xml;charset=UTF-8,${makeThumbSvg(previewTarget.kind)}`;
    const canShowImagePreview = Boolean(previewTarget.previewUrl || isImageFile(previewTarget.name));
    const detections = previewTarget.visionValidation?.detections || [];
    const showDetections = showVisionBoxes && detections.length > 0 && canShowImagePreview;
    return (
      <div
        role="dialog"
        aria-label="파일 미리보기"
        onClick={() => setPreviewTarget(null)}
        style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'grid', placeItems: 'center', background: 'rgba(31,47,39,.08)', backdropFilter: 'blur(.5px)', padding: 24 }}
      >
        <div onClick={(event) => event.stopPropagation()} style={{ width: 'min(560px, 72%)', border: `1px solid ${C.g200}`, borderRadius: 16, background: C.white, boxShadow: '0 22px 52px rgba(31,47,39,.22)', padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 12, alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {previewTarget.visionValidation && (
                <span style={{ border: `1px solid ${previewTarget.visionValidation.status === 'unsuitable' ? '#FFCDD2' : C.g200}`, borderRadius: 999, background: previewTarget.visionValidation.status === 'unsuitable' ? C.dangerBg : C.bg, color: previewTarget.visionValidation.status === 'unsuitable' ? C.danger : C.primary, padding: '5px 10px', fontSize: 12, fontWeight: 900 }}>
                  비전 결과 {previewTarget.visionValidation.status === 'unsuitable' ? '부적합' : '적합'}
                </span>
              )}
            </div>
          </div>
          <div style={{ position: 'relative', border: `1px solid ${C.g100}`, borderRadius: 12, overflow: 'hidden', background: C.g100, minHeight: 260, display: 'grid', placeItems: 'center' }}>
            {canShowImagePreview ? (
              <img src={previewSrc} alt={previewTarget.name} style={{ width: '100%', maxHeight: 360, objectFit: 'contain', display: 'block' }} />
            ) : (
              <div style={{ minHeight: 260, display: 'grid', placeItems: 'center' }}>
                <FileThumb entry={previewTarget} size={104} />
              </div>
            )}
            {showDetections && detections.map((detection, index) => {
              const [x, y, width, height] = detection.box;
              const boxColor = detection.status === 'bad' ? '#E53935' : '#2F73D9';
              return (
                <div
                  key={`${detection.label}-${index}`}
                  style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, width: `${width}%`, height: `${height}%`, border: `3px solid ${boxColor}`, boxSizing: 'border-box', pointerEvents: 'none' }}
                >
                  <span style={{ position: 'absolute', left: -3, top: -28, background: boxColor, color: C.white, padding: '3px 6px', borderRadius: 4, fontSize: 11, fontWeight: 900, whiteSpace: 'nowrap' }}>
                    {detection.label} {detection.confidence.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, alignItems: 'center', marginTop: 12 }}>
            <div title={previewTarget.name} style={{ minWidth: 0, fontSize: 13, fontWeight: 900, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{previewTarget.name}</div>
            {previewTarget.visionValidation && (
              <button type="button" onClick={() => setShowVisionBoxes((value) => !value)} style={{ border: `1px solid ${showVisionBoxes ? C.primary : C.g200}`, borderRadius: 999, background: showVisionBoxes ? C.bg : C.white, color: showVisionBoxes ? C.primary : C.g600, padding: '7px 10px', fontFamily: 'inherit', fontSize: 11, fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                바운더리 박스 {showVisionBoxes ? 'ON' : 'OFF'}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" onClick={() => setPreviewTarget(null)} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.g600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 900, padding: '8px 14px' }}>
              닫기
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div data-ui="usage-detail-file-view.1" onClick={() => setOpenFileMenu(null)} style={{ position: 'relative', width: '100%', minWidth: 0, overflow: 'visible' }}>
      <section style={{ background: C.white, border: `1px solid ${C.g200}`, borderRadius: 6, overflow: 'hidden', minWidth: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: layoutColumns, borderBottom: `1px solid ${C.g200}`, background: '#F7FBF8', minWidth: 0 }}>
          <div style={{ padding: '12px 14px', borderRight: `1px solid ${C.g200}`, fontSize: 14, color: C.g800, fontWeight: 900, display: 'flex', alignItems: 'center' }}>9개 항목</div>
          <div style={{ padding: '12px 14px', borderRight: `1px solid ${C.g200}`, fontSize: 14, color: C.g800, fontWeight: 900, display: 'flex', alignItems: 'center' }}>사용내역서 세부 항목</div>
          <div style={{ padding: '8px 14px', fontSize: 14, color: C.g800, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span>파일보기</span>
            {fileHeaderAction && <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', flexShrink: 0 }}>{fileHeaderAction}</span>}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: layoutColumns, minHeight: 560, minWidth: 0 }}>
          <div style={{ padding: 12, borderRight: `1px solid ${C.g200}`, overflow: 'visible', minWidth: 0, background: '#FEFFFE' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, overflow: 'visible' }}>
              {cats.map((cat) => {
                const items = usageItems.filter((item) => item.categoryId === cat.id);
                const count = EVIDENCE_SECTIONS.reduce((sum, section) => sum + getFiles(section.id, cat.id).length, 0);
                const hasProblem = EVIDENCE_SECTIONS.some((section) => getFiles(section.id, cat.id).some((file) => isProblemFile?.(file)));
                const hasActionRequest = isActionRequestedCat(cat.id) || Boolean(isSupplementTarget?.(cat.id));
                const active = cat.id === selectedCatId;
                return (
                  <button key={cat.id} type="button" onClick={() => onSelectCat(cat.id)} style={{ width: '100%', border: `1px solid ${hasProblem || hasActionRequest ? (active ? C.danger : '#FFCDD2') : active ? C.primary : C.g100}`, background: hasProblem || hasActionRequest ? C.dangerBg : C.white, borderRadius: 6, padding: '9px 10px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', boxShadow: active ? `0 0 0 1px ${hasProblem || hasActionRequest ? 'rgba(229,57,53,.18)' : 'rgba(27,94,59,.18)'}` : 'none' }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: hasProblem || hasActionRequest ? C.danger : active ? C.primary : C.g800, lineHeight: 1.35, whiteSpace: 'pre-line', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{cat.short}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
                      <span style={{ fontSize: 10, color: C.g400, fontWeight: 800 }}>{items.length}개 세부</span>
                      <span style={{ fontSize: 10, color: hasProblem || hasActionRequest ? C.danger : C.g400, fontWeight: 900 }}>{count}건</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ padding: 12, borderRight: `1px solid ${C.g200}`, overflow: 'hidden', minWidth: 0, background: '#FEFFFE' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 560, overflowY: 'auto', paddingRight: 3 }}>
              <div className="thin-x-scroll" style={{ width: '100%', paddingBottom: 4 }}>
                <div style={{ minWidth: 560, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: usageItemRowColumns, gap: 8, alignItems: 'center', padding: '0 10px 4px', color: C.g400, fontSize: 10, fontWeight: 900 }}>
                    <span>사용일자</span>
                    <span>사용내역</span>
                    <span style={{ textAlign: 'center' }}>단위</span>
                    <span style={{ textAlign: 'right' }}>수량</span>
                    <span style={{ textAlign: 'right' }}>단가</span>
                    <span style={{ textAlign: 'right' }}>계</span>
                    <span />
                  </div>
                  {filteredItems.length === 0 && <div style={{ border: `1px dashed ${C.g200}`, borderRadius: 6, padding: 14, fontSize: 12, color: C.g400, textAlign: 'center', background: '#FCFEFD' }}>OCR 항목이 없습니다</div>}
                  {filteredItems.map((item) => {
                    const active = item.id === activeItem.id;
                    const hasActionRequest = isActionRequestedUsageItem(item) || Boolean(isSupplementTarget?.(item.categoryId, item.id));
                    return (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelectUsageItem(item)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onSelectUsageItem(item);
                          }
                        }}
                        style={{ width: '100%', border: `1px solid ${hasActionRequest ? (active ? C.danger : '#FFCDD2') : active ? C.primary : C.g100}`, background: hasActionRequest ? C.dangerBg : C.white, borderRadius: 6, padding: '9px 10px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', boxShadow: active ? `0 0 0 1px ${hasActionRequest ? 'rgba(229,57,53,.18)' : 'rgba(27,94,59,.18)'}` : 'none' }}
                      >
                        <div
                          title={[item.date, item.name, item.unit, item.quantity, item.unitPrice ? fmt(item.unitPrice) : '', fmt(item.amount)].filter(Boolean).join(' ')}
                          style={{ display: 'grid', gridTemplateColumns: usageItemRowColumns, gap: 8, alignItems: 'center', minWidth: 0 }}
                        >
                          <span style={{ fontSize: 11, color: hasActionRequest ? C.danger : C.g600, fontWeight: 900, whiteSpace: 'nowrap' }}>{item.date || '-'}</span>
                          <span style={{ minWidth: 0, fontSize: 12, fontWeight: 900, color: hasActionRequest ? C.danger : active ? C.primary : C.g800, lineHeight: 1.35, whiteSpace: 'normal', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{item.name}</span>
                          <span style={{ fontSize: 11, color: C.g600, fontWeight: 900, whiteSpace: 'nowrap', textAlign: 'center' }}>{item.unit || '-'}</span>
                          <span style={{ fontSize: 11, color: C.g600, fontWeight: 900, whiteSpace: 'nowrap', textAlign: 'right' }}>{item.quantity ?? '-'}</span>
                          <span style={{ fontSize: 11, color: C.g600, fontWeight: 900, whiteSpace: 'nowrap', textAlign: 'right' }}>{item.unitPrice ? fmt(item.unitPrice) : '-'}</span>
                          <span style={{ fontSize: 12, color: hasActionRequest ? C.danger : active ? C.primary : C.g800, fontWeight: 900, whiteSpace: 'nowrap', textAlign: 'right' }}>{fmt(item.amount)}</span>
                          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, alignSelf: 'center' }}>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                openEditUsageItemModal(item);
                              }}
                              style={{ border: `1px solid ${C.g200}`, borderRadius: 999, background: C.white, color: C.primary, cursor: 'pointer', fontFamily: 'inherit', fontSize: 10, fontWeight: 900, padding: '4px 7px' }}
                            >
                              수정
                            </button>
                            <button
                              type="button"
                              aria-label={`${item.name} 삭제`}
                              onClick={(event) => {
                                event.stopPropagation();
                                onDeleteUsageItem(item);
                              }}
                              style={{ width: 24, height: 24, border: 'none', borderRadius: 999, background: 'transparent', color: C.g400, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, fontSize: 16, fontWeight: 900, lineHeight: 1 }}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                        {hasActionRequest && actionRequest?.dueDate && <div style={{ marginTop: 5, fontSize: 10, fontWeight: 900, color: C.g600, background: C.white, border: `1px solid ${C.g200}`, borderRadius: 999, padding: '2px 6px', display: 'inline-flex' }}>기한 {actionRequest.dueDate}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
              <button type="button" aria-label="사용내역서 세부 항목 추가" onClick={onAddUsageItem} style={{ minHeight: 44, width: '100%', border: `1px dashed ${C.light}`, borderRadius: 6, background: '#FCFEFD', color: C.primary, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                <PlusIcon size={15} />
              </button>
            </div>
          </div>

          <div style={{ padding: 14, overflow: 'hidden', minWidth: 0, background: '#FBFDFC' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, maxHeight: 532, overflowY: 'auto', paddingRight: 4 }}>
              {EVIDENCE_SECTIONS.map((section) => {
                const files = getFiles(section.id, selectedCatId, activeItem?.id);
                const uploadButton = (compact = false) => (
                  <button type="button" aria-label={`${section.label} 업로드`} onClick={() => onUpload(section.id, selectedCatId, activeItem?.id || selectedUsageItemId)} style={{ width: compact ? 24 : 32, height: compact ? 24 : 32, border: `1px solid ${C.light}`, borderRadius: 999, background: C.white, color: C.primary, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 900, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span aria-hidden="true" style={{ position: 'relative', width: compact ? 12 : 14, height: compact ? 12 : 14, display: 'inline-block' }}>
                      <span style={{ position: 'absolute', left: 0, top: compact ? 5 : 6, width: compact ? 12 : 14, height: 2, borderRadius: 999, background: C.primary }} />
                      <span style={{ position: 'absolute', left: compact ? 5 : 6, top: 0, width: 2, height: compact ? 12 : 14, borderRadius: 999, background: C.primary }} />
                    </span>
                  </button>
                );
                return (
                  <div key={section.id} onDragOver={(event) => event.preventDefault()} onDrop={() => dropInto(section.id, selectedCatId)} style={{ border: `1px solid ${C.g200}`, borderRadius: 8, background: C.white, padding: 11 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 900, color: C.g800 }}>{section.label}</span>
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 900, color: C.g400 }}>{files.length}</div>
                    </div>
                    {renderEvidenceTodos?.(section.id)}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {files.map((file) => renderFileRow(section.id, file))}
                      {files.length > 0 && <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 2 }}>{uploadButton(true)}</div>}
                      {files.length === 0 && <div style={{ minHeight: 58, border: `1px dashed ${C.g200}`, borderRadius: 6, padding: '10px 8px', background: '#FCFEFD', display: 'grid', placeItems: 'center' }}>{uploadButton(true)}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
      {renderFileMenu()}
      {renderPreviewOverlay()}
      <Modal open={Boolean(moveTarget)} onClose={closeFileEditModal} zIndex={980} maxWidth={760}>
        <div style={{ background: C.white, borderRadius: 18, border: `1px solid ${C.g200}`, boxShadow: '0 18px 44px rgba(0,0,0,.16)', overflow: 'hidden' }}>
          <div style={{ padding: '22px 24px 16px', borderBottom: `1px solid ${C.g100}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: C.g800 }}>파일 수정</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7, minWidth: 0, flexWrap: 'wrap' }}>
                  <div title={moveTarget?.file.name} style={{ minWidth: 0, maxWidth: 430, fontSize: 13, color: C.g600, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{moveTarget?.file.name}</div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: `1px solid ${C.g200}`, borderRadius: 999, padding: '5px 9px', background: C.bg, color: C.primary, whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 10, color: C.g400, fontWeight: 900 }}>현재 위치</span>
                    <span style={{ fontSize: 11, fontWeight: 900 }}>{cats.find((cat) => cat.id === moveTarget?.catId)?.short || '-'} · {EVIDENCE_SECTIONS.find((section) => section.id === moveTarget?.kind)?.label || '-'}</span>
                  </span>
                </div>
              </div>
              <button type="button" onClick={closeFileEditModal} style={{ border: 'none', background: 'transparent', color: C.g400, cursor: 'pointer', fontSize: 24, lineHeight: 1 }}>×</button>
            </div>
          </div>

          <div style={{ padding: '18px 24px 20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, alignItems: 'end', marginBottom: 18 }}>
              <label style={{ display: 'grid', gap: 7, minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 900, color: C.g600 }}>파일명</span>
                <input
                  value={fileEditDraft}
                  onChange={(event) => setFileEditDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      confirmRenameFile();
                    }
                  }}
                  style={{ height: 42, border: `1px solid ${C.g200}`, borderRadius: 6, background: C.white, color: C.g800, fontFamily: 'inherit', fontSize: 14, fontWeight: 800, padding: '0 12px', outline: 'none', minWidth: 0 }}
                />
              </label>
              <button type="button" onClick={confirmRenameFile} disabled={!fileEditDraft.trim()} style={{ border: 'none', borderRadius: 999, padding: '10px 16px', background: C.primary, color: C.white, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: fileEditDraft.trim() ? 'pointer' : 'not-allowed', opacity: fileEditDraft.trim() ? 1 : 0.45 }}>파일명 수정</button>
            </div>
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
                <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.g100}`, fontSize: 12, fontWeight: 900, color: C.g800 }}>유형</div>
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
              파일명 수정, 다운로드, 위치 이동을 처리합니다.
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button type="button" disabled={!moveTarget?.file.fileId} onClick={() => moveTarget && onDownloadFile?.(moveTarget.file)} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '9px 14px', background: C.white, color: moveTarget?.file.fileId ? C.g600 : C.g400, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: moveTarget?.file.fileId ? 'pointer' : 'not-allowed' }}>다운로드</button>
              <button type="button" onClick={confirmMove} disabled={!moveTarget || !moveTargetUsageItemId || (moveTarget.catId === moveTargetCatId && moveTarget.kind === moveTargetKind && selectedUsageItemId === moveTargetUsageItemId)} style={{ border: 'none', borderRadius: 999, padding: '9px 16px', background: C.primary, color: C.white, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: !moveTarget || !moveTargetUsageItemId || (moveTarget.catId === moveTargetCatId && moveTarget.kind === moveTargetKind && selectedUsageItemId === moveTargetUsageItemId) ? 'not-allowed' : 'pointer', opacity: !moveTarget || !moveTargetUsageItemId || (moveTarget.catId === moveTargetCatId && moveTarget.kind === moveTargetKind && selectedUsageItemId === moveTargetUsageItemId) ? 0.45 : 1 }}>이동</button>
            </div>
          </div>
        </div>
      </Modal>
      <Modal open={Boolean(editUsageItemTarget)} onClose={() => setEditUsageItemTarget(null)} zIndex={980} maxWidth="min(620px, calc(100vw - 32px))">
        <div style={{ background: C.white, borderRadius: 18, border: `1px solid ${C.g200}`, boxShadow: '0 18px 44px rgba(0,0,0,.16)', overflow: 'hidden', maxHeight: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '22px 24px 16px', borderBottom: `1px solid ${C.g100}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: C.g800 }}>세부 항목 수정</div>
                <div style={{ fontSize: 12, color: C.g400, fontWeight: 800, marginTop: 6 }}>기본 정보와 9개 항목 위치를 함께 수정합니다.</div>
              </div>
              <button type="button" onClick={() => setEditUsageItemTarget(null)} style={{ border: 'none', background: 'transparent', color: C.g400, cursor: 'pointer', fontSize: 24, lineHeight: 1 }}>×</button>
            </div>
          </div>

          <div style={{ padding: '18px 24px 20px', display: 'grid', gap: 16, overflowY: 'auto', minHeight: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(130px, 150px)', gap: 10 }}>
              <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 900, color: C.g800 }}>
                항목명
                <input value={editUsageItemDraft.name} onChange={(event) => setEditUsageItemDraft((draft) => ({ ...draft, name: event.target.value }))} style={{ minWidth: 0, border: `1px solid ${C.g200}`, borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 800, color: C.g800, fontFamily: 'inherit' }} />
              </label>
              <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 900, color: C.g800 }}>
                사용일자
                <input type="date" value={editUsageItemDraft.date} onChange={(event) => setEditUsageItemDraft((draft) => ({ ...draft, date: event.target.value }))} style={{ minWidth: 0, border: `1px solid ${C.g200}`, borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 800, color: C.g800, fontFamily: 'inherit' }} />
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, .75fr) minmax(0, .8fr) minmax(0, 1fr) minmax(100px, 120px)', gap: 10, alignItems: 'end' }}>
              <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 900, color: C.g800 }}>
                단위
                <input value={editUsageItemDraft.unit} onChange={(event) => setEditUsageItemDraft((draft) => ({ ...draft, unit: event.target.value }))} style={{ minWidth: 0, border: `1px solid ${C.g200}`, borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 800, color: C.g800, fontFamily: 'inherit' }} />
              </label>
              <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 900, color: C.g800 }}>
                수량
                <input inputMode="decimal" value={editUsageItemDraft.quantity} onChange={(event) => setEditUsageItemDraft((draft) => ({ ...draft, quantity: event.target.value }))} style={{ minWidth: 0, border: `1px solid ${C.g200}`, borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 800, color: C.g800, fontFamily: 'inherit' }} />
              </label>
              <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 900, color: C.g800 }}>
                단가
                <input inputMode="numeric" value={editUsageItemDraft.unitPrice} onChange={(event) => setEditUsageItemDraft((draft) => ({ ...draft, unitPrice: event.target.value }))} style={{ minWidth: 0, border: `1px solid ${C.g200}`, borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 800, color: C.g800, fontFamily: 'inherit' }} />
              </label>
              <div style={{ minWidth: 0, border: `1px solid ${C.g100}`, borderRadius: 10, padding: '10px 12px', background: '#FCFEFD' }}>
                <div style={{ fontSize: 11, color: C.g400, fontWeight: 900, marginBottom: 3 }}>금액</div>
                <div style={{ fontSize: 13, color: C.g800, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fmt(calculateUsageLineAmount(editUsageItemDraft.quantity, editUsageItemDraft.unitPrice))}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
              <div style={{ gridColumn: '1 / -1', fontSize: 12, fontWeight: 900, color: C.g800, marginBottom: 2 }}>9개 항목 위치</div>
              {cats.map((cat) => {
                const active = editUsageItemDraft.categoryId === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setEditUsageItemDraft((draft) => ({ ...draft, categoryId: cat.id }))}
                    style={{ minWidth: 0, width: '100%', minHeight: 58, border: `1px solid ${active ? C.light : C.g200}`, borderRadius: 10, background: active ? C.bg : C.white, color: active ? C.primary : C.g800, padding: '10px 12px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 900, lineHeight: 1.35, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}
                  >
                    {cat.short}
                  </button>
                );
              })}
            </div>
            {editUsageItemError && <div style={{ fontSize: 12, color: C.danger, fontWeight: 900 }}>{editUsageItemError}</div>}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', padding: '16px 24px', background: '#FCFEFD', borderTop: `1px solid ${C.g100}`, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12, color: C.g400, fontWeight: 800 }}>
              위치를 바꾸면 연결된 파일도 함께 이동합니다.
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button type="button" onClick={() => setEditUsageItemTarget(null)} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '9px 14px', background: C.white, color: C.g600, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: 'pointer' }}>취소</button>
              <button type="button" onClick={confirmEditUsageItem} disabled={!editUsageItemTarget} style={{ border: 'none', borderRadius: 999, padding: '9px 16px', background: C.primary, color: C.white, fontSize: 13, fontWeight: 900, fontFamily: 'inherit', cursor: !editUsageItemTarget ? 'not-allowed' : 'pointer', opacity: !editUsageItemTarget ? 0.45 : 1 }}>저장</button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
