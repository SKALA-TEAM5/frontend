import { useEffect, useState } from 'react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import CenterModal from '../../components/ui/CenterModal';
import InlineLoader from '../../components/ui/InlineLoader';
import Modal from '../../components/ui/Modal';
import { C } from '../../lib/theme';
import { createEntryFromFile, getCategoryLabels } from '../../lib/evidence-utils';
import { PhotoDescriptionModal } from './EvidenceModals';
import UploadZone from './UploadZone';
import type { ContractInfo, EvidenceCategory, EvidenceFile } from '../../types/domain';
interface UploadScreenProps {
    contractName: string;
    contractMeta: ContractInfo | null;
    requireUsageStatementFirst?: boolean;
    onUploadCountChange?: (count: number) => void;
    onFilesAdded?: (files: EvidenceFile[]) => void;
    onMatchComplete: (payload: {
        files: Record<EvidenceCategory, EvidenceFile[]>;
    }) => void;
    compact?: boolean;
    hideUsageStatementZone?: boolean;
}
const UPLOAD_ZONES: Array<{
    key: EvidenceCategory;
    label: string;
    hint: string | null;
}> = [
    { key: 'usage_statement', label: '사용내역서', hint: null },
    { key: 'receipt', label: '영수증', hint: null },
    { key: 'site_photo', label: '현장사진', hint: '필요 사진만 제출해 주세요.' },
    { key: 'tax_invoice', label: '세금계산서 + 제3자발급사실조회서', hint: '두 자료를 함께\n제출해 주세요.' },
    { key: 'other_document', label: '기타 자료', hint: '추가 확인 자료를\n제출해 주세요.' },
];
const OTHER_DOCUMENT_TYPES = ['지급대장', '점검일지', '선임확인서', '기타'];
const UploadScreen = ({ contractName, contractMeta, requireUsageStatementFirst = false, onUploadCountChange, onFilesAdded, onMatchComplete, compact = false, hideUsageStatementZone = false }: UploadScreenProps) => {
    const [files, setFiles] = useState<Record<EvidenceCategory, EvidenceFile[]>>({ receipt: [], site_photo: [], usage_statement: [], tax_invoice: [], other_document: [] });
    const [loading, setLoading] = useState(false);
    const [matchDone, setMatchDone] = useState(false);
    const [siteModalFiles, setSiteModalFiles] = useState<EvidenceFile[]>([]);
    const [otherModalFiles, setOtherModalFiles] = useState<EvidenceFile[]>([]);
    const [otherDocumentTypes, setOtherDocumentTypes] = useState<Record<string, string[]>>({});
    const [classificationToast, setClassificationToast] = useState<Array<{
        id: string;
        name: string;
        labels: string[];
        kind: EvidenceCategory;
    }> | null>(null);
    useEffect(() => {
        if (!classificationToast || classificationToast.length === 0)
            return;
        const timeout = window.setTimeout(() => setClassificationToast(null), 4200);
        return () => window.clearTimeout(timeout);
    }, [classificationToast]);
    const showClassificationToast = (entries: EvidenceFile[]) => {
        setClassificationToast(entries.map((entry) => ({
            id: entry.id,
            name: entry.name,
            kind: entry.kind,
            labels: getCategoryLabels(entry.categoryIds || []),
        })));
    };
    const pickFile = (key: EvidenceCategory) => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.multiple = true;
        inp.accept = key === 'site_photo' ? 'image/*' : 'image/*,.pdf,.xlsx';
        inp.onchange = (e) => {
            const pickedFiles = Array.from((e.target as HTMLInputElement).files || []);
            if (key === 'site_photo') {
                setSiteModalFiles(pickedFiles.map((file) => createEntryFromFile(file, 'site_photo')));
                return;
            }
            if (key === 'other_document') {
                const nextEntries = pickedFiles.map((file) => createEntryFromFile(file, 'other_document'));
                setOtherModalFiles(nextEntries);
                setOtherDocumentTypes(Object.fromEntries(nextEntries.map((entry) => [entry.id, []])));
                return;
            }
            const nextEntries = pickedFiles.map((file) => createEntryFromFile(file, key));
            setFiles((prev) => ({ ...prev, [key]: [...prev[key], ...nextEntries].slice(0, 12) }));
            showClassificationToast(nextEntries);
            onFilesAdded?.(nextEntries);
        };
        inp.click();
    };
    const handleDrop = (key: EvidenceCategory, e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const droppedFiles = Array.from(e.dataTransfer.files || []);
        if (key === 'site_photo') {
            setSiteModalFiles(droppedFiles.map((file) => createEntryFromFile(file, 'site_photo')));
            return;
        }
        if (key === 'other_document') {
            const nextEntries = droppedFiles.map((file) => createEntryFromFile(file, 'other_document'));
            setOtherModalFiles(nextEntries);
            setOtherDocumentTypes(Object.fromEntries(nextEntries.map((entry) => [entry.id, []])));
            return;
        }
        const nextEntries = droppedFiles.map((file) => createEntryFromFile(file, key));
        setFiles((prev) => ({ ...prev, [key]: [...prev[key], ...nextEntries].slice(0, 12) }));
        showClassificationToast(nextEntries);
        onFilesAdded?.(nextEntries);
    };
    const removeFile = (key: EvidenceCategory, fileId: string) => {
        setFiles((prev) => ({ ...prev, [key]: prev[key].filter((file) => file.id !== fileId) }));
    };
    const total = Object.values(files).flat().length;
    useEffect(() => {
        onUploadCountChange?.(total);
    }, [onUploadCountChange, total]);
    const basicReady = Boolean(contractMeta?.name || contractName);
    const usageStatementReady = files.usage_statement.length > 0;
    const canProceed = basicReady && files.site_photo.every((file) => file.description?.trim());
    const hasUploads = files.receipt.length || files.site_photo.length || files.usage_statement.length || files.tax_invoice.length || files.other_document.length;
    const visibleUploadZones = hideUsageStatementZone ? UPLOAD_ZONES.filter((zone) => zone.key !== 'usage_statement') : UPLOAD_ZONES;
    const content = (<>
        {classificationToast && classificationToast.length > 0 && (<div data-ui="upload-screen.1" style={{ position: 'fixed', top: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 900, width: 'min(760px, calc(100vw - 40px))', pointerEvents: 'none' }}>
            <div data-ui="upload-screen.2" className="screen-enter" style={{ width: '100%', background: C.white, border: `1px solid ${C.light}`, boxShadow: '0 12px 30px rgba(27,94,59,.12)', borderRadius: 18, padding: '14px 18px', pointerEvents: 'auto' }}>
              <div data-ui="upload-screen.3" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                <div data-ui="upload-screen.4" style={{ fontSize: 15, fontWeight: 800, color: C.primary }}>제출 완료 자동 분류 결과</div>
                <button data-ui="upload-screen.5" onClick={() => setClassificationToast(null)} style={{ background: 'none', border: 'none', color: C.g400, cursor: 'pointer', fontSize: 20 }}>×</button>
              </div>
              <div data-ui="upload-screen.6" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {classificationToast.map((item) => (<div data-ui="upload-screen.7" key={item.id} style={{ display: 'grid', gridTemplateColumns: '86px minmax(0,1fr) minmax(0,1fr)', gap: 10, alignItems: 'center', padding: '9px 10px', borderRadius: 12, background: C.bg }}>
                    <div data-ui="upload-screen.8" style={{ fontSize: 13, fontWeight: 800, color: C.primary }}>{item.kind === 'receipt' ? '영수증' : item.kind === 'site_photo' ? '현장사진' : item.kind === 'usage_statement' ? '사용내역서' : item.kind === 'tax_invoice' ? '세금계산서' : '기타 자료'}</div>
                    <div data-ui="upload-screen.9" style={{ fontSize: 14, fontWeight: 700, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                    <div data-ui="upload-screen.10" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {item.labels.map((label) => <span data-ui="upload-screen.11" key={label} style={{ fontSize: 12, fontWeight: 700, color: C.ok, background: '#F4FBF6', border: '1px solid #D6EEDB', borderRadius: 999, padding: '3px 8px' }}>{label} 폴더</span>)}
                    </div>
                  </div>))}
              </div>
            </div>
        </div>)}
        <div data-ui="upload-screen.12" className="screen-enter">
        <Card style={{ padding: compact ? '14px 16px' : '20px 22px', overflow: 'visible', minWidth: 0 }}>
          <div data-ui="upload-screen.13" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: compact ? 10 : 12, minWidth: 0 }}>
            {visibleUploadZones.map((zone) => {
            const count = files[zone.key].length;
            const blockedByInitialUsageRule = requireUsageStatementFirst && zone.key !== 'usage_statement' && !usageStatementReady;
            return (<div data-ui="upload-screen.14" key={zone.key} style={{ gridColumn: zone.key === 'usage_statement' ? '1 / -1' : undefined, minWidth: 0 }}>
                <UploadZone zone={zone} count={count} names={files[zone.key]} onDrop={(e) => handleDrop(zone.key, e)} onClick={() => pickFile(zone.key)} onRemove={(fileId) => removeFile(zone.key, fileId)} disabled={!basicReady || blockedByInitialUsageRule} disabledReason={blockedByInitialUsageRule ? '첫 프로젝트는 사용내역서를 먼저 업로드해 주세요.' : undefined} compact={compact}/>
              </div>);
        })}
          </div>
          <div data-ui="upload-screen.16" style={{ marginTop: compact ? 8 : 12, padding: compact ? '9px 12px' : '12px 14px', borderRadius: compact ? 10 : 12, background: C.bg, border: `1px solid ${C.g200}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: compact ? 8 : 10, flexWrap: 'wrap' }}>
            <div data-ui="upload-screen.17" style={{ fontSize: compact ? 12 : 14, color: C.g600, lineHeight: 1.5, minWidth: 0 }}>제출 완료 후 AI가 <strong data-ui="upload-screen.18" style={{ color: C.primary }}>9개 항목</strong>으로 자동 분류하고, 관련 증빙을 같은 폴더에 묶습니다.</div>
            <div data-ui="upload-screen.19" style={{ display: 'flex', gap: 8, flexShrink: 0 }}><Button size="sm" disabled={!canProceed || !hasUploads || loading} onClick={() => { setLoading(true); setTimeout(() => { setLoading(false); setMatchDone(true); }, 1400); }}>분류 검토</Button></div>
          </div>
          {loading && <InlineLoader title="매칭 검토 화면을 준비하고 있어요" body={hideUsageStatementZone ? '업로드된 영수증, 현장사진, 세금계산서와 기타 자료를 항목별로 정리하고 있습니다.' : '업로드된 사용내역서, 영수증, 현장사진, 세금계산서와 기타 자료를 항목별로 정리하고 있습니다.'}/>}
          <CenterModal open={matchDone} title="매칭 검토가 완료되었습니다" body="분류가 완료되었습니다. 아카이브에서 확인하고 필요하면 폴더 간 이동으로 위치를 조정할 수 있습니다." actionLabel="아카이브로 이동" onAction={() => { setMatchDone(false); onMatchComplete({ files }); }}/>
          <PhotoDescriptionModal open={siteModalFiles.length > 0} files={siteModalFiles} onClose={() => setSiteModalFiles([])} onSave={(values) => { const nextEntries = siteModalFiles.map((file) => ({ ...file, description: values[file.name] })); setFiles((prev) => ({ ...prev, site_photo: [...prev.site_photo, ...nextEntries].slice(0, 12) })); showClassificationToast(nextEntries); onFilesAdded?.(nextEntries); setSiteModalFiles([]); }}/>
          <Modal open={otherModalFiles.length > 0} onClose={() => setOtherModalFiles([])} zIndex={940} maxWidth={720}>
            <div style={{ background: C.white, borderRadius: 22, border: `1px solid ${C.g200}`, boxShadow: '0 18px 40px rgba(0,0,0,.16)', overflow: 'hidden' }}>
              <div style={{ padding: '18px 22px', borderBottom: `1px solid ${C.g100}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: C.g800 }}>기타 자료 분류</div>
                  <div style={{ fontSize: 14, color: C.g400, marginTop: 3 }}>업로드한 파일이 어떤 서류인지 선택해 주세요.</div>
                </div>
                <button type="button" onClick={() => setOtherModalFiles([])} style={{ background: 'none', border: 'none', color: C.g400, cursor: 'pointer', fontSize: 22 }}>×</button>
              </div>
              <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '62vh', overflowY: 'auto' }}>
                {otherModalFiles.map((file) => (
                  <div key={file.id} style={{ border: `1px solid ${C.g200}`, borderRadius: 14, padding: 14, background: '#FCFEFD' }}>
                    <div style={{ fontSize: 15, fontWeight: 900, color: C.g800, wordBreak: 'break-all', marginBottom: 10 }}>{file.name}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      {OTHER_DOCUMENT_TYPES.map((type) => {
                        const checked = (otherDocumentTypes[file.id] || []).includes(type);
                        return (
                          <label key={type} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 800, color: checked ? C.primary : C.g600, cursor: 'pointer' }}>
                            <input type="checkbox" checked={checked} onChange={(event) => {
                              setOtherDocumentTypes((prev) => {
                                const current = prev[file.id] || [];
                                const next = event.target.checked ? [...current, type] : current.filter((item) => item !== type);
                                return { ...prev, [file.id]: next };
                              });
                            }} />
                            {type}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding: '16px 22px', borderTop: `1px solid ${C.g100}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button variant="outline" size="sm" onClick={() => setOtherModalFiles([])}>취소</Button>
                <Button size="sm" disabled={otherModalFiles.some((file) => !(otherDocumentTypes[file.id] || []).length)} onClick={() => {
                  const nextEntries = otherModalFiles.map((file) => ({ ...file, documentType: (otherDocumentTypes[file.id] || []).join(', ') }));
                  setFiles((prev) => ({ ...prev, other_document: [...prev.other_document, ...nextEntries].slice(0, 12) }));
                  showClassificationToast(nextEntries);
                  onFilesAdded?.(nextEntries);
                  setOtherModalFiles([]);
                  setOtherDocumentTypes({});
                }}>저장</Button>
              </div>
            </div>
          </Modal>
        </Card>
        </div>
    </>);
    return <div data-ui="upload-screen.20" style={{ background: C.soft, padding: 0 }}>{content}</div>;
};
export default UploadScreen;
