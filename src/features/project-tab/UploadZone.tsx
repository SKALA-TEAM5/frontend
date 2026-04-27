import { useState } from 'react';
import { C } from '../../lib/theme';
import type { EvidenceCategory, EvidenceFile } from '../../types/domain';
import { FolderIcon } from '../../components/ui';
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
    disabled: boolean;
    disabledReason?: string;
}
const UploadZone = ({ zone, count, names, onDrop, onClick, disabled, disabledReason }: UploadZoneProps) => {
    const [drag, setDrag] = useState(false);
    return (<div data-ui="features-project-tab-upload-zone.div-1" style={{ position: 'relative' }} onDragOver={(e) => { if (disabled)
        return; e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { if (disabled)
        return; setDrag(false); onDrop(e); }}>
      <div data-ui="features-project-tab-upload-zone.div-2" onClick={disabled ? undefined : onClick} style={{ border: `2px dashed ${drag ? C.primary : count > 0 ? C.light : C.g200}`, borderRadius: 18, background: drag ? C.bg : count > 0 ? C.soft : C.white, transition: 'all .2s', cursor: disabled ? 'not-allowed' : 'pointer', padding: '32px 24px', textAlign: 'center', boxShadow: drag ? `0 0 0 4px ${C.primary}15` : undefined, minHeight: 180, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.58 : 1 }}>
        <div data-ui="features-project-tab-upload-zone.div-3" style={{ marginBottom: 12 }}><FolderIcon color={count > 0 ? C.primary : C.g400} hasFiles={count > 0}/></div>
        <div data-ui="features-project-tab-upload-zone.div-4" style={{ fontSize: 18, fontWeight: 800, color: count > 0 ? C.primary : C.g800, marginBottom: 4 }}>{zone.label}</div>
        {count > 0 ? <div data-ui="features-project-tab-upload-zone.div-5" style={{ fontSize: 12, color: C.mid, fontWeight: 600 }}>{count}개 파일 업로드됨</div> : <div data-ui="features-project-tab-upload-zone.div-6" style={{ fontSize: 12, color: C.g400 }}>클릭하거나 드래그하세요</div>}
        {names.slice(0, 2).map((entry, i) => <div data-ui="features-project-tab-upload-zone.div-7" key={i} style={{ fontSize: 11, color: C.g400, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '90%' }}>📄 {entry.name}</div>)}
        {count > 2 && <div data-ui="features-project-tab-upload-zone.div-8" style={{ fontSize: 11, color: C.g400, marginTop: 2 }}>+{count - 2}개 더</div>}
      </div>
      {disabled && <div data-ui="features-project-tab-upload-zone.div-9" style={{ position: 'absolute', inset: 0, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}><div data-ui="features-project-tab-upload-zone.div-10" style={{ background: 'rgba(255,255,255,.92)', border: `1px solid ${C.g200}`, padding: '8px 12px', borderRadius: 99, fontSize: 11, fontWeight: 700, color: C.g600 }}>{disabledReason || '계약 조회 후 업로드 가능'}</div></div>}
      {zone.hint && <div data-ui="features-project-tab-upload-zone.div-11" style={{ position: 'absolute', top: 10, right: 10, background: '#FFFDE7', border: '1px solid #FDD835', borderRadius: 9, padding: '6px 10px', fontSize: 10, color: '#5D4037', fontWeight: 600, lineHeight: 1.5, maxWidth: 148, whiteSpace: 'pre-line', boxShadow: '0 2px 8px rgba(0,0,0,.07)' }}>⚠️ {zone.hint}</div>}
    </div>);
};
export default UploadZone;
