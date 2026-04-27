import { useEffect, useState } from 'react';
import { C } from '../../lib/theme';
import { SITE_DESCRIPTION_SEED } from '../../lib/mock-data';
import Button from '../../components/ui/Button';
import FileThumb from '../../components/ui/FileThumb';
import Modal from '../../components/ui/Modal';
import type { EvidenceFile } from '../../types/domain';
interface PhotoDescriptionModalProps {
    open: boolean;
    files?: EvidenceFile[];
    initialValues?: Record<string, string>;
    onClose: () => void;
    onSave: (values: Record<string, string>) => void;
    title?: string;
}
export const PhotoDescriptionModal = ({ open, files = [], initialValues = {}, onClose, onSave, title = '현장사진 설명 입력' }: PhotoDescriptionModalProps) => {
    const [values, setValues] = useState<Record<string, string>>({});
    const initialSignature = files.map((file) => `${file.id || file.name}:${initialValues[file.name] || SITE_DESCRIPTION_SEED[file.name] || ''}`).join('||');
    useEffect(() => {
        if (open) {
            const next: Record<string, string> = {};
            files.forEach((file) => { next[file.name] = initialValues[file.name] || SITE_DESCRIPTION_SEED[file.name] || ''; });
            setValues(next);
        }
    }, [open, initialSignature]);
    const canSave = files.every((file) => values[file.name] && values[file.name].trim());
    return (<Modal open={open} onClose={onClose} zIndex={940} maxWidth={760}>
      <div data-ui="features-project-tab-evidence-modals.div-15" style={{ background: C.white, borderRadius: 24, boxShadow: '0 18px 40px rgba(0,0,0,.16)', border: `1px solid ${C.g200}`, overflow: 'hidden' }}>
        <div data-ui="features-project-tab-evidence-modals.div-16" style={{ padding: '18px 22px', borderBottom: `1px solid ${C.g100}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div data-ui="features-project-tab-evidence-modals.div-17"><div data-ui="features-project-tab-evidence-modals.div-18" style={{ fontSize: 18, fontWeight: 800, color: C.g800 }}>{title}</div><div data-ui="features-project-tab-evidence-modals.div-19" style={{ fontSize: 12, color: C.g400, marginTop: 3 }}>사진마다 설명을 입력해야 저장됩니다</div></div>
          <button data-ui="features-project-tab-evidence-modals.button-4" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.g400 }}>×</button>
        </div>
        <div data-ui="features-project-tab-evidence-modals.div-20" style={{ padding: 18, maxHeight: '64vh', overflow: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {files.map((file, i) => (<div data-ui="features-project-tab-evidence-modals.div-21" key={file.name + i} style={{ border: `1px solid ${C.g200}`, borderRadius: 16, padding: 14 }}>
              <div data-ui="features-project-tab-evidence-modals.div-22" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <FileThumb entry={file} size={64}/>
                <div data-ui="features-project-tab-evidence-modals.div-23" style={{ minWidth: 0, flex: 1 }}>
                  <div data-ui="features-project-tab-evidence-modals.div-24" style={{ fontSize: 12, fontWeight: 700, color: C.g800, marginBottom: 8, wordBreak: 'break-all' }}>{file.name}</div>
                  <textarea data-ui="features-project-tab-evidence-modals.textarea-1" value={values[file.name] || ''} onChange={(e) => setValues((prev) => ({ ...prev, [file.name]: e.target.value }))} placeholder="예: 안전난간대 설치 완료 상태, 작업자 안전모 착용 확인" style={{ width: '100%', minHeight: 88, resize: 'vertical', border: `1px solid ${C.g200}`, borderRadius: 12, padding: '10px 12px', fontFamily: 'inherit', fontSize: 12, outline: 'none', color: '#23352d', background: '#fff', caretColor: '#23352d', lineHeight: 1.6 }}/>
                </div>
              </div>
            </div>))}
        </div>
        <div data-ui="features-project-tab-evidence-modals.div-25" style={{ padding: '16px 22px', borderTop: `1px solid ${C.g100}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="outline" size="sm" onClick={onClose}>취소</Button>
          <Button size="sm" disabled={!canSave} onClick={() => onSave(values)}>저장</Button>
        </div>
      </div>
    </Modal>);
};
