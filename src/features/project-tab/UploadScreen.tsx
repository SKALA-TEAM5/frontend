import { useEffect, useState } from 'react';
import Button from '../../components/ui/Button';
import CenterModal from '../../components/ui/CenterModal';
import InlineLoader from '../../components/ui/InlineLoader';
import { C } from '../../lib/theme';
import { createEntryFromFile, getCategoryLabels } from '../../lib/mock-data';
import { PhotoDescriptionModal } from './EvidenceModals';
import UploadZone from './UploadZone';
import type { ContractInfo, EvidenceCategory, EvidenceFile } from '../../types/domain';
interface UploadScreenProps {
    contractName: string;
    contractMeta: ContractInfo | null;
    onMatchComplete: (payload: {
        files: Record<EvidenceCategory, EvidenceFile[]>;
    }) => void;
}
const UPLOAD_ZONES: Array<{
    key: EvidenceCategory;
    label: string;
    hint: string | null;
}> = [
    { key: 'usage_statement', label: '사용내역서', hint: null },
    { key: 'receipt', label: '영수증', hint: null },
    { key: 'site_photo', label: '현장사진', hint: '필요 항목에만 제출하고\n설명을 함께 입력해 주세요' },
    { key: 'tax_invoice', label: '세금내역서 + 제3자사실관계확인서', hint: '두 자료를 함께\n제출해 주세요' },
    { key: 'other_document', label: '기타 서류', hint: '추가 확인 자료를\n자유롭게 제출해 주세요' },
];
const UploadScreen = ({ contractName, contractMeta, onMatchComplete }: UploadScreenProps) => {
    const [files, setFiles] = useState<Record<EvidenceCategory, EvidenceFile[]>>({ receipt: [], site_photo: [], usage_statement: [], tax_invoice: [], other_document: [] });
    const [loading, setLoading] = useState(false);
    const [matchDone, setMatchDone] = useState(false);
    const [siteModalFiles, setSiteModalFiles] = useState<EvidenceFile[]>([]);
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
            const nextEntries = pickedFiles.map((file) => createEntryFromFile(file, key));
            setFiles((prev) => ({ ...prev, [key]: [...prev[key], ...nextEntries].slice(0, 12) }));
            showClassificationToast(nextEntries);
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
        const nextEntries = droppedFiles.map((file) => createEntryFromFile(file, key));
        setFiles((prev) => ({ ...prev, [key]: [...prev[key], ...nextEntries].slice(0, 12) }));
        showClassificationToast(nextEntries);
    };
    const total = Object.values(files).flat().length;
    const basicReady = Boolean(contractMeta?.name || contractName);
    const canProceed = basicReady && files.site_photo.every((file) => file.description?.trim());
    const hasUploads = files.receipt.length || files.site_photo.length || files.usage_statement.length || files.tax_invoice.length || files.other_document.length;
    const content = (<>
        {classificationToast && classificationToast.length > 0 && (<div data-ui="features-project-tab-upload-screen.div-1" style={{ position: 'sticky', top: 8, zIndex: 20, marginBottom: 14, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
            <div data-ui="features-project-tab-upload-screen.div-2" className="screen-enter" style={{ width: '100%', maxWidth: 760, background: C.white, border: `1px solid ${C.light}`, boxShadow: '0 12px 30px rgba(27,94,59,.12)', borderRadius: 18, padding: '14px 18px', pointerEvents: 'auto' }}>
              <div data-ui="features-project-tab-upload-screen.div-3" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                <div data-ui="features-project-tab-upload-screen.div-4" style={{ fontSize: 13, fontWeight: 800, color: C.primary }}>제출 자료 자동 분류 결과</div>
                <button data-ui="features-project-tab-upload-screen.button-1" onClick={() => setClassificationToast(null)} style={{ background: 'none', border: 'none', color: C.g400, cursor: 'pointer', fontSize: 18 }}>×</button>
              </div>
              <div data-ui="features-project-tab-upload-screen.div-5" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {classificationToast.map((item) => (<div data-ui="features-project-tab-upload-screen.div-6" key={item.id} style={{ display: 'grid', gridTemplateColumns: '86px minmax(0,1fr) minmax(0,1fr)', gap: 10, alignItems: 'center', padding: '9px 10px', borderRadius: 12, background: C.bg }}>
                    <div data-ui="features-project-tab-upload-screen.div-7" style={{ fontSize: 11, fontWeight: 800, color: C.primary }}>{item.kind === 'receipt' ? '영수증' : item.kind === 'site_photo' ? '현장사진' : item.kind === 'usage_statement' ? '사용내역서' : item.kind === 'tax_invoice' ? '세금내역서' : '기타 서류'}</div>
                    <div data-ui="features-project-tab-upload-screen.div-8" style={{ fontSize: 12, fontWeight: 700, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                    <div data-ui="features-project-tab-upload-screen.div-9" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {item.labels.map((label) => <span data-ui="features-project-tab-upload-screen.span-1" key={label} style={{ fontSize: 10, fontWeight: 700, color: C.ok, background: '#F4FBF6', border: '1px solid #D6EEDB', borderRadius: 999, padding: '3px 8px' }}>{label} 폴더</span>)}
                    </div>
                  </div>))}
              </div>
            </div>
        </div>)}
        <div data-ui="features-project-tab-upload-screen.div-10" className="screen-enter">
          <div data-ui="features-project-tab-upload-screen.div-20" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {UPLOAD_ZONES.map((zone) => {
            const count = files[zone.key].length;
            return (<div data-ui="features-project-tab-upload-screen.upload-zone-wrap" key={zone.key} style={{ gridColumn: zone.key === 'usage_statement' ? '1 / -1' : undefined }}>
                <UploadZone zone={zone} count={count} names={files[zone.key]} onDrop={(e) => handleDrop(zone.key, e)} onClick={() => pickFile(zone.key)} disabled={!basicReady}/>
              </div>);
        })}
          </div>
          <div data-ui="features-project-tab-upload-screen.div-24" style={{ marginTop: 16, padding: '15px 20px', borderRadius: 14, background: C.white, border: `1px solid ${C.g200}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div data-ui="features-project-tab-upload-screen.div-25" style={{ fontSize: 13, color: C.g600 }}>제출된 자료를 AI가 <strong data-ui="features-project-tab-upload-screen.strong-1" style={{ color: C.primary }}>9개 항목</strong>으로 자동 분류하고, 관련 증빙을 같은 항목에 연결합니다</div>
            <div data-ui="features-project-tab-upload-screen.div-26" style={{ display: 'flex', gap: 8, flexShrink: 0 }}><Button size="sm" disabled={!canProceed || !hasUploads || loading} onClick={() => { setLoading(true); setTimeout(() => { setLoading(false); setMatchDone(true); }, 1400); }}>분류 검토 →</Button></div>
          </div>
          {total > 0 && <div data-ui="features-project-tab-upload-screen.div-27" style={{ marginTop: 16, padding: '13px 18px', borderRadius: 12, background: C.bg, display: 'flex', alignItems: 'center', gap: 10 }}><span data-ui="features-project-tab-upload-screen.span-3">✅</span><div data-ui="features-project-tab-upload-screen.div-28" style={{ fontSize: 13, fontWeight: 600, color: C.primary }}>총 {total}개 파일 업로드 완료 — AI 자동 분류 중이에요.</div></div>}
          {loading && <InlineLoader title="매칭 검토 화면을 준비하고 있어요" body="업로드된 사용내역서, 영수증, 현장사진, 세금내역서, 제3자사실관계확인서와 기타 서류를 항목별로 정리하고 있습니다."/>}
          <CenterModal open={matchDone} title="매칭 검토가 완료되었습니다" body="분류된 자료를 아카이브에서 확인하고, 필요하면 폴더 간 이동으로 위치를 조정할 수 있습니다." actionLabel="아카이브로 이동" onAction={() => { setMatchDone(false); onMatchComplete({ files }); }}/>
          <PhotoDescriptionModal open={siteModalFiles.length > 0} files={siteModalFiles} onClose={() => setSiteModalFiles([])} onSave={(values) => { const nextEntries = siteModalFiles.map((file) => ({ ...file, description: values[file.name] })); setFiles((prev) => ({ ...prev, site_photo: [...prev.site_photo, ...nextEntries].slice(0, 12) })); showClassificationToast(nextEntries); setSiteModalFiles([]); }}/>
        </div>
    </>);
    return <div data-ui="features-project-tab-upload-screen.div-29" style={{ background: C.soft, padding: 0 }}>{content}</div>;
};
export default UploadScreen;
