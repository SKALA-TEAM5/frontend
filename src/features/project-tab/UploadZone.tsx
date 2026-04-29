import { useState } from 'react';
import { FolderIcon } from '../../components/ui';
import { C } from '../../lib/theme';
import type { EvidenceCategory, EvidenceFile } from '../../types/domain';

interface UploadZoneProps {
    zone: {
        key: EvidenceCategory;
        label: string;
        hint: string | null;
    };
    count: number;
    names: EvidenceFile[];
    onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
    onClick: () => void;
    onRemove: (fileId: string) => void;
    disabled: boolean;
    disabledReason?: string;
    compact?: boolean;
}

const UploadZone = ({ zone, count, names, onDrop, onClick, onRemove, disabled, disabledReason, compact = false }: UploadZoneProps) => {
    const [drag, setDrag] = useState(false);

    return (
        <div
            data-ui="upload-zone.1"
            style={{ position: 'relative' }}
            onDragOver={(e) => {
                if (disabled) return;
                e.preventDefault();
                setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
                if (disabled) return;
                setDrag(false);
                onDrop(e);
            }}
        >
            <div
                data-ui="upload-zone.2"
                onClick={disabled ? undefined : onClick}
                style={{ border: `${compact ? 1 : 2}px dashed ${drag ? C.primary : count > 0 ? C.light : C.g200}`, borderRadius: compact ? 14 : 16, background: drag ? C.bg : count > 0 ? C.soft : C.white, transition: 'all .2s', cursor: disabled ? 'not-allowed' : 'pointer', padding: compact ? '18px 16px' : '18px 18px', textAlign: 'center', boxShadow: drag ? `0 0 0 4px ${C.primary}15` : undefined, minHeight: compact ? 132 : 122, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.58 : 1 }}
            >
                <div data-ui="upload-zone.4" style={{ marginBottom: compact ? 8 : 6, transform: compact ? 'scale(.78)' : 'scale(.78)', height: compact ? 28 : 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FolderIcon color={count > 0 ? C.primary : C.g400} hasFiles={count > 0}/></div>
                <div data-ui="upload-zone.5" style={{ fontSize: compact ? 16 : 17, fontWeight: 800, color: count > 0 ? C.primary : C.g800, marginBottom: compact ? 3 : 2, lineHeight: 1.25 }}>{zone.label}</div>
                {count > 0 ? <div data-ui="upload-zone.6" style={{ fontSize: compact ? 12 : 14, color: C.mid, fontWeight: 600 }}>{count}개 파일 업로드됨</div> : <div data-ui="upload-zone.7" style={{ fontSize: compact ? 12 : 14, color: C.g400 }}>클릭하거나 드래그하세요</div>}
                {count > 0 && (
                    <div data-ui="upload-zone.8" onClick={(event) => event.stopPropagation()} style={{ width: '100%', maxHeight: compact ? undefined : 92, overflowY: compact ? 'visible' : 'auto', marginTop: compact ? 7 : 10, paddingRight: compact ? 0 : 4, display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {names.map((entry) => (
                            <div data-ui="upload-zone.9" key={entry.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 20px', alignItems: 'center', gap: 6, border: `1px solid ${C.g100}`, borderRadius: 9, background: '#FCFEFD', padding: '5px 6px' }}>
                                <div title={entry.name} style={{ fontSize: compact ? 12 : 13, color: C.g600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>파일 {entry.name}</div>
                                <button type="button" aria-label={`${entry.name} 삭제`} onClick={(event) => { event.stopPropagation(); onRemove(entry.id); }} style={{ border: 'none', background: 'transparent', color: C.g400, cursor: 'pointer', fontSize: 15, fontWeight: 900, lineHeight: 1 }}>×</button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            {disabled && <div data-ui="upload-zone.10" style={{ position: 'absolute', inset: 0, borderRadius: compact ? 13 : 18, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}><div data-ui="upload-zone.11" style={{ background: 'rgba(255,255,255,.92)', border: `1px solid ${C.g200}`, padding: compact ? '7px 10px' : '8px 12px', borderRadius: 99, fontSize: compact ? 12 : 13, fontWeight: 700, color: C.g600 }}>{disabledReason || '사용내역서 제출 후 업로드 가능'}</div></div>}
            {zone.hint && <div data-ui="upload-zone.12" style={{ position: 'absolute', top: compact ? 7 : 10, right: compact ? 7 : 10, background: '#FFFDE7', border: '1px solid #FDD835', borderRadius: compact ? 8 : 9, padding: compact ? '4px 7px' : '6px 10px', fontSize: compact ? 11 : 12, color: '#5D4037', fontWeight: 600, lineHeight: compact ? 1.35 : 1.5, maxWidth: compact ? 126 : 167, whiteSpace: 'pre-line', boxShadow: '0 2px 8px rgba(0,0,0,.07)' }}>⚠️ {zone.hint}</div>}
        </div>
    );
};

export default UploadZone;
