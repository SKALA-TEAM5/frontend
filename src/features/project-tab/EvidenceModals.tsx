import { Fragment, useEffect, useState } from 'react';
import { C } from '../../lib/theme';
import { CONTRACT_DB, SITE_DESCRIPTION_SEED } from '../../lib/mock-data';
import Button from '../../components/ui/Button';
import FileThumb from '../../components/ui/FileThumb';
import Modal from '../../components/ui/Modal';
import type { ContractInfo, EvidenceFile } from '../../types/domain';
interface ContractPickerModalProps {
    open: boolean;
    onClose: () => void;
    onPick: (contract: ContractInfo) => void;
}
export const ContractPickerModal = ({ open, onClose, onPick }: ContractPickerModalProps) => {
    return (<Modal open={open} onClose={onClose} zIndex={900} maxWidth={560}>
      <div data-ui="features-project-tab-evidence-modals.div-1" style={{ background: C.white, borderRadius: 22, boxShadow: '0 18px 40px rgba(0,0,0,.16)', border: `1px solid ${C.g200}`, overflow: 'hidden' }}>
        <div data-ui="features-project-tab-evidence-modals.div-2" style={{ padding: '18px 22px', borderBottom: `1px solid ${C.g100}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div data-ui="features-project-tab-evidence-modals.div-3">
            <div data-ui="features-project-tab-evidence-modals.div-4" style={{ fontSize: 18, fontWeight: 800, color: C.g800 }}>계약 조회</div>
            <div data-ui="features-project-tab-evidence-modals.div-5" style={{ fontSize: 12, color: C.g400, marginTop: 3 }}>계약명과 계약번호만 표시됩니다</div>
          </div>
          <button data-ui="features-project-tab-evidence-modals.button-1" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.g400 }}>×</button>
        </div>
        <div data-ui="features-project-tab-evidence-modals.div-6" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '60vh', overflow: 'auto' }}>
          {CONTRACT_DB.map((contract, i) => (<button data-ui="features-project-tab-evidence-modals.button-2" key={i} onClick={() => onPick(contract)} style={{ width: '100%', textAlign: 'left', background: C.white, border: `1px solid ${C.g200}`, borderRadius: 14, padding: '15px 16px', cursor: 'pointer' }}>
              <div data-ui="features-project-tab-evidence-modals.div-7" style={{ fontSize: 14, fontWeight: 700, color: C.g800 }}>{contract.name}</div>
              <div data-ui="features-project-tab-evidence-modals.div-8" style={{ fontSize: 12, color: C.g400, marginTop: 3 }}>{contract.num}</div>
            </button>))}
        </div>
      </div>
    </Modal>);
};
interface ContractInfoModalProps {
    open: boolean;
    contract: ContractInfo | null;
    onClose: () => void;
}
export const ContractInfoModal = ({ open, contract, onClose }: ContractInfoModalProps) => {
    return (<Modal open={open} onClose={onClose} zIndex={930} maxWidth={560}>
      <div data-ui="features-project-tab-evidence-modals.div-9" style={{ background: C.white, borderRadius: 24, boxShadow: '0 18px 40px rgba(0,0,0,.16)', border: `1px solid ${C.g200}`, overflow: 'hidden' }}>
        <div data-ui="features-project-tab-evidence-modals.div-10" style={{ padding: '18px 22px', borderBottom: `1px solid ${C.g100}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div data-ui="features-project-tab-evidence-modals.div-11" style={{ fontSize: 18, fontWeight: 800, color: C.g800 }}>계약 기본정보</div>
          <button data-ui="features-project-tab-evidence-modals.button-3" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.g400 }}>×</button>
        </div>
        <div data-ui="features-project-tab-evidence-modals.div-12" style={{ padding: '18px 22px', display: 'grid', gridTemplateColumns: '120px 1fr', gap: '12px 14px' }}>
          {[
            ['계약명', contract?.name || '-'],
            ['계약번호', contract?.num || '-'],
            ['작성일자', '2026-04-22'],
            ['공사명', contract?.project || '-'],
            ['공사기간', contract?.period || '-'],
            ['정산차수', contract?.round || '-'],
            ['계상금액', contract?.planned ? `${contract.planned}원` : '-'],
            ['누계금액', contract?.accumulated ? `${contract.accumulated}원` : '-'],
        ].map(([label, value]) => (<Fragment key={label}>
              <div data-ui="features-project-tab-evidence-modals.div-13" style={{ fontSize: 13, fontWeight: 800, color: C.g400 }}>{label}</div>
              <div data-ui="features-project-tab-evidence-modals.div-14" style={{ fontSize: 14, fontWeight: 700, color: C.g800 }}>{value}</div>
            </Fragment>))}
        </div>
      </div>
    </Modal>);
};
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
interface PhotoRequirementItem {
    cat: string;
    required: boolean;
    tone: 'error' | 'ok' | 'neutral';
    summary: string;
}
interface PhotoRequirementModalProps {
    open: boolean;
    report?: PhotoRequirementItem[];
    onClose: () => void;
}
export const PhotoRequirementModal = ({ open, report = [], onClose }: PhotoRequirementModalProps) => {
    return (<Modal open={open} onClose={onClose} zIndex={945} maxWidth={620}>
      <div data-ui="features-project-tab-evidence-modals.div-26" style={{ background: C.white, borderRadius: 24, boxShadow: '0 18px 40px rgba(0,0,0,.16)', border: `1px solid ${C.g200}`, overflow: 'hidden' }}>
        <div data-ui="features-project-tab-evidence-modals.div-27" style={{ padding: '18px 22px', borderBottom: `1px solid ${C.g100}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div data-ui="features-project-tab-evidence-modals.div-28"><div data-ui="features-project-tab-evidence-modals.div-29" style={{ fontSize: 18, fontWeight: 800, color: C.g800 }}>현장사진 제출 분석 결과</div><div data-ui="features-project-tab-evidence-modals.div-30" style={{ fontSize: 12, color: C.g400, marginTop: 3 }}>제출된 자료를 바탕으로 필수 현장사진 누락 여부를 확인했습니다</div></div>
          <button data-ui="features-project-tab-evidence-modals.button-5" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.g400 }}>×</button>
        </div>
        <div data-ui="features-project-tab-evidence-modals.div-31" style={{ padding: 18, maxHeight: '64vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {report.map((item, i) => (<div data-ui="features-project-tab-evidence-modals.div-32" key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: item.tone === 'error' ? C.dangerBg : item.tone === 'ok' ? C.bg : C.g100, border: `1px solid ${item.tone === 'error' ? '#FFCDD2' : item.tone === 'ok' ? '#D6EEDB' : C.g200}` }}>
              <span data-ui="features-project-tab-evidence-modals.span-1" style={{ fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 99, flexShrink: 0, background: item.tone === 'error' ? C.danger : item.tone === 'ok' ? C.ok : C.g400, color: '#fff' }}>{item.required ? '필수' : '선택'}</span>
              <div data-ui="features-project-tab-evidence-modals.div-33" style={{ minWidth: 0 }}>
                <div data-ui="features-project-tab-evidence-modals.div-34" style={{ fontSize: 12, fontWeight: 700, color: C.g800 }}>{item.cat}</div>
                <div data-ui="features-project-tab-evidence-modals.div-35" style={{ fontSize: 11, color: item.tone === 'error' ? C.danger : C.g600, marginTop: 2, lineHeight: 1.6 }}>{item.summary}</div>
              </div>
            </div>))}
        </div>
        <div data-ui="features-project-tab-evidence-modals.div-36" style={{ padding: '16px 22px', borderTop: `1px solid ${C.g100}`, display: 'flex', justifyContent: 'flex-end' }}>
          <Button size="sm" onClick={onClose}>확인</Button>
        </div>
      </div>
    </Modal>);
};
