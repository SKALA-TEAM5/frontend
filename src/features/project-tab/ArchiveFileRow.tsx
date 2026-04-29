import FileThumb from '../../components/ui/FileThumb';
import { C } from '../../lib/theme';
import type { EvidenceCategory, EvidenceFile } from '../../types/domain';
const KIND_LABELS: Record<EvidenceCategory, string> = {
    receipt: '영수증',
    site_photo: '현장사진',
    usage_statement: '사용내역서',
    tax_invoice: '세금계산서 + 전문공사 계약확인서',
    other_document: '기타 자료',
};
const TYPE_BADGE_STYLES: Record<EvidenceCategory, {
    color: string;
    bg: string;
    border: string;
}> = {
    receipt: { color: C.primary, bg: C.bg, border: C.light },
    site_photo: { color: C.ok, bg: '#F4FBF6', border: '#D6EEDB' },
    usage_statement: { color: '#8A6D3B', bg: '#FFF9E8', border: '#F2D59B' },
    tax_invoice: { color: '#7B4CE2', bg: '#F5F0FF', border: '#D9C7FF' },
    other_document: { color: C.g600, bg: C.g100, border: C.g200 },
};
interface ArchiveFileRowProps {
    file: EvidenceFile;
    catId: number;
    kind: EvidenceCategory;
    compact?: boolean;
    problem?: boolean;
    onDragStart: () => void;
    onDragEnd: () => void;
    onRemove: () => void;
    onPreview: (entry: EvidenceFile, x: number, y: number) => void;
    onPreviewEnd: () => void;
}
export default function ArchiveFileRow({ file, catId, kind, compact = false, problem = false, onDragStart, onDragEnd, onRemove, onPreview, onPreviewEnd }: ArchiveFileRowProps) {
    const badgeStyle = TYPE_BADGE_STYLES[kind];
    const openPreview = (target: HTMLElement) => {
            if (kind !== 'site_photo' && kind !== 'receipt')
                return;
            const rect = target.getBoundingClientRect();
            onPreview(file, rect.left, rect.bottom + 8);
    };
    return (<div data-ui="archive-file-row.1" key={`${kind}-${file.id}-${catId}`} draggable onDragStart={onDragStart} onDragEnd={onDragEnd} style={{
            display: 'grid',
            gridTemplateColumns: compact ? '32px minmax(0,1fr) 18px' : '32px minmax(0,1fr) auto 18px',
            gap: 8,
            alignItems: 'center',
            padding: '7px 8px',
            borderRadius: 10,
            background: problem ? C.dangerBg : C.white,
            border: `1px solid ${problem ? '#FFCDD2' : C.g100}`,
            cursor: 'grab',
        }}>
      <div data-ui="archive-file-row.2" onMouseEnter={(e) => openPreview(e.currentTarget)} onMouseLeave={onPreviewEnd}>
        <FileThumb entry={file} size={32}/>
      </div>
      <div data-ui="archive-file-row.3" style={{ minWidth: 0 }}>
        <div data-ui="archive-file-row.4" data-file-name onMouseEnter={(e) => openPreview(e.currentTarget)} onMouseLeave={onPreviewEnd} style={{ fontSize: 13, fontWeight: 700, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</div>
        <div data-ui="archive-file-row.5" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
          <span data-ui="archive-file-row.6" style={{ fontSize: 12, color: C.g400 }}>{file.uploadedAt || '날짜 미상'}</span>
          {kind === 'site_photo' && file.description && <span data-ui="archive-file-row.7" style={{ fontSize: 12, color: C.g400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>{file.description}</span>}
        </div>
      </div>
      {!compact && (<span data-ui="archive-file-row.8" style={{ fontSize: 12, fontWeight: 700, color: badgeStyle.color, background: badgeStyle.bg, border: `1px solid ${badgeStyle.border}`, borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap' }}>
          {KIND_LABELS[kind]}
        </span>)}
      <button data-ui="archive-file-row.9" type="button" onMouseEnter={onPreviewEnd} onClick={(e) => {
            e.stopPropagation();
            onPreviewEnd();
            onRemove();
        }} style={{ background: 'none', border: 'none', color: C.g400, cursor: 'pointer', fontSize: 16, padding: 0 }}>x</button>
    </div>);
}
