import { useEffect, useState } from 'react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import CenterModal from '../../components/ui/CenterModal';
import InlineLoader from '../../components/ui/InlineLoader';
import { C } from '../../lib/theme';
import { createEntryFromFile, getCategoryLabels } from '../../lib/mock-data';
import { ContractInfoModal, PhotoDescriptionModal, PhotoRequirementModal } from './EvidenceModals';
import UploadZone from './UploadZone';
import type { ContractInfo, EvidenceCategory, EvidenceFile } from '../../types/domain';
interface UploadScreenProps {
    contractName: string;
    contractMeta: ContractInfo | null;
    onMatchComplete: (payload: {
        files: Record<EvidenceCategory, EvidenceFile[]>;
    }) => void;
}
type PhotoRequirementReportItem = {
    cat: string;
    required: boolean;
    tone: 'error' | 'ok' | 'neutral';
    summary: string;
    note: string;
    keywords: string[];
};
const UPLOAD_ZONES: Array<{
    key: EvidenceCategory;
    label: string;
    hint: string | null;
}> = [
    { key: 'usage_statement', label: '사용내역서', hint: '처음에는 사용내역서를\n먼저 제출해 주세요' },
    { key: 'receipt', label: '영수증', hint: null },
    { key: 'site_photo', label: '현장사진', hint: '필요 항목에만 제출하고\n설명을 함께 입력해 주세요' },
    { key: 'tax_invoice', label: '세금내역서 + 제3자사실관계확인서', hint: '두 자료를 함께\n제출해 주세요' },
];
const FIELD_REQUIRED = [
    { cat: '개인보호구 구입', required: true, note: '안전모·안전화 착용 현장사진 필수', keywords: ['안전모', '안전화', '보호구', '안전장갑', '장갑'] },
    { cat: '안전시설물 설치', required: true, note: '설치 완료 시설물 현장사진 필수', keywords: ['안전망', '난간', '안전난간', '표지판', '추락방지', '안전시설'] },
    { cat: '안전보건 교육', required: false, note: '교육 진행 사진 권장 (필수 아님)', keywords: ['교육', '수강'] },
    { cat: '위험성평가 지원', required: false, note: '현장사진 없이도 인정 가능', keywords: ['위험성평가', '위험요인'] },
    { cat: '근로자 건강관리', required: false, note: '현장사진 없이도 인정 가능', keywords: ['건강', '검진', '상담'] },
];
const UploadScreen = ({ contractName, contractMeta, onMatchComplete }: UploadScreenProps) => {
    const [files, setFiles] = useState<Record<EvidenceCategory, EvidenceFile[]>>({ receipt: [], site_photo: [], usage_statement: [], tax_invoice: [] });
    const [photoRequirementReport, setPhotoRequirementReport] = useState<PhotoRequirementReportItem[] | null>(null);
    const [photoRequirementOpen, setPhotoRequirementOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [matchDone, setMatchDone] = useState(false);
    const [siteModalFiles, setSiteModalFiles] = useState<EvidenceFile[]>([]);
    const [contractInfoOpen, setContractInfoOpen] = useState(false);
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
    const hasUsageStatement = files.usage_statement.length > 0;
    const canProceed = basicReady && hasUsageStatement && files.site_photo.every((file) => file.description?.trim());
    const hasUploads = files.receipt.length || files.site_photo.length || files.usage_statement.length || files.tax_invoice.length;
    const analyzePhotoRequirements = () => {
        const evidenceText = [...files.receipt, ...files.usage_statement, ...files.tax_invoice].map((file) => `${file.name} ${file.description || ''}`).join(' ').toLowerCase();
        const siteText = files.site_photo.map((file) => `${file.name} ${file.description || ''}`).join(' ').toLowerCase();
        const items: PhotoRequirementReportItem[] = FIELD_REQUIRED.map((item) => {
            const relevant = item.keywords.some((keyword) => evidenceText.includes(keyword.toLowerCase()));
            const hasSite = item.keywords.some((keyword) => siteText.includes(keyword.toLowerCase()));
            if (item.required && relevant && !hasSite)
                return { ...item, tone: 'error', summary: '필수 현장사진이 제출되지 않았습니다.' };
            if (item.required && relevant && hasSite)
                return { ...item, tone: 'ok', summary: '필수 현장사진 제출이 확인되었습니다.' };
            if (item.required && !relevant)
                return { ...item, tone: 'neutral', summary: '현재 제출 자료에서 해당 항목 집행 정황이 확인되지 않습니다.' };
            return { ...item, tone: hasSite ? 'ok' : 'neutral', summary: hasSite ? '현장사진이 함께 제출되었습니다.' : item.note };
        });
        setPhotoRequirementReport(items);
        setPhotoRequirementOpen(true);
    };
    const content = (<>
        {classificationToast && classificationToast.length > 0 && (<div data-ui="features-project-tab-upload-screen.div-1" style={{ position: 'sticky', top: 8, zIndex: 20, marginBottom: 14, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
            <div data-ui="features-project-tab-upload-screen.div-2" className="screen-enter" style={{ width: '100%', maxWidth: 760, background: C.white, border: `1px solid ${C.light}`, boxShadow: '0 12px 30px rgba(27,94,59,.12)', borderRadius: 18, padding: '14px 18px', pointerEvents: 'auto' }}>
              <div data-ui="features-project-tab-upload-screen.div-3" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                <div data-ui="features-project-tab-upload-screen.div-4" style={{ fontSize: 13, fontWeight: 800, color: C.primary }}>제출 자료 자동 분류 결과</div>
                <button data-ui="features-project-tab-upload-screen.button-1" onClick={() => setClassificationToast(null)} style={{ background: 'none', border: 'none', color: C.g400, cursor: 'pointer', fontSize: 18 }}>×</button>
              </div>
              <div data-ui="features-project-tab-upload-screen.div-5" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {classificationToast.map((item) => (<div data-ui="features-project-tab-upload-screen.div-6" key={item.id} style={{ display: 'grid', gridTemplateColumns: '86px minmax(0,1fr) minmax(0,1fr)', gap: 10, alignItems: 'center', padding: '9px 10px', borderRadius: 12, background: C.bg }}>
                    <div data-ui="features-project-tab-upload-screen.div-7" style={{ fontSize: 11, fontWeight: 800, color: C.primary }}>{item.kind === 'receipt' ? '영수증' : item.kind === 'site_photo' ? '현장사진' : item.kind === 'usage_statement' ? '사용내역서' : '세금내역서'}</div>
                    <div data-ui="features-project-tab-upload-screen.div-8" style={{ fontSize: 12, fontWeight: 700, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                    <div data-ui="features-project-tab-upload-screen.div-9" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {item.labels.map((label) => <span data-ui="features-project-tab-upload-screen.span-1" key={label} style={{ fontSize: 10, fontWeight: 700, color: C.ok, background: '#F4FBF6', border: '1px solid #D6EEDB', borderRadius: 999, padding: '3px 8px' }}>{label} 폴더</span>)}
                    </div>
                  </div>))}
              </div>
            </div>
          </div>)}
        <div data-ui="features-project-tab-upload-screen.div-10" className="screen-enter">
          <div data-ui="features-project-tab-upload-screen.div-11" style={{ marginBottom: 28 }}><h1 data-ui="features-project-tab-upload-screen.h1-1" style={{ fontSize: 32, fontWeight: 900, color: C.g800, letterSpacing: '-0.04em', lineHeight: 1.15 }}>파일을 업로드 하세요.</h1><p data-ui="features-project-tab-upload-screen.p-1" style={{ fontSize: 14, color: C.g400, marginTop: 6 }}>사용내역서를 먼저 제출한 뒤 영수증, 필요한 현장사진, 세금내역서와 제3자사실관계확인서를 추가 제출할 수 있습니다.</p></div>
          <Card style={{ marginBottom: 16, padding: '18px 20px' }}>
            <div data-ui="features-project-tab-upload-screen.div-12" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
              <div data-ui="features-project-tab-upload-screen.div-13" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, flex: 1 }}>
                <div data-ui="features-project-tab-upload-screen.div-14"><div data-ui="features-project-tab-upload-screen.div-15" style={{ fontSize: 11, color: C.g400, fontWeight: 700, marginBottom: 4 }}>계약명</div><div data-ui="features-project-tab-upload-screen.div-16" style={{ fontSize: 15, fontWeight: 700, color: C.g800 }}>{contractMeta?.name || contractName}</div></div>
                <div data-ui="features-project-tab-upload-screen.div-17"><div data-ui="features-project-tab-upload-screen.div-18" style={{ fontSize: 11, color: C.g400, fontWeight: 700, marginBottom: 4 }}>계약번호</div><div data-ui="features-project-tab-upload-screen.div-19" style={{ fontSize: 15, fontWeight: 700, color: C.g800 }}>{contractMeta?.num || '-'}</div></div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setContractInfoOpen(true)} style={{ flexShrink: 0 }}>계약 기본정보</Button>
            </div>
          </Card>
          <div data-ui="features-project-tab-upload-screen.div-20" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {UPLOAD_ZONES.map((zone) => {
            const count = files[zone.key].length;
            const waitingForUsage = basicReady && zone.key !== 'usage_statement' && !hasUsageStatement;
            return <UploadZone key={zone.key} zone={zone} count={count} names={files[zone.key]} onDrop={(e) => handleDrop(zone.key, e)} onClick={() => pickFile(zone.key)} disabled={!basicReady || waitingForUsage} disabledReason={waitingForUsage ? '사용내역서 먼저 업로드' : undefined}/>;
        })}
          </div>
          <div data-ui="features-project-tab-upload-screen.div-21" style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div data-ui="features-project-tab-upload-screen.div-22" style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
              <button data-ui="features-project-tab-upload-screen.button-2" onClick={analyzePhotoRequirements} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'transparent', border: 'none', borderRadius: 0, cursor: 'pointer', fontFamily: 'inherit', boxShadow: 'none' }}>
                <div data-ui="features-project-tab-upload-screen.div-23" style={{ width: 24, height: 24, borderRadius: 99, border: `2px solid ${photoRequirementReport ? C.primary : C.g400}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: photoRequirementReport ? C.primary : C.g600, transition: 'all .18s', flexShrink: 0, background: photoRequirementReport ? C.bg : 'transparent' }}>?</div>
                <span data-ui="features-project-tab-upload-screen.span-2" style={{ fontSize: 13, fontWeight: 700, color: photoRequirementReport ? C.primary : C.g600, transition: 'color .15s', whiteSpace: 'nowrap' }}>현장사진 필수 제출 여부 알아보기</span>
              </button>
            </div>
          </div>
          <div data-ui="features-project-tab-upload-screen.div-24" style={{ marginTop: 8, padding: '15px 20px', borderRadius: 14, background: C.white, border: `1px solid ${C.g200}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div data-ui="features-project-tab-upload-screen.div-25" style={{ fontSize: 13, color: C.g600 }}>사용내역서를 기준으로 AI가 <strong data-ui="features-project-tab-upload-screen.strong-1" style={{ color: C.primary }}>9개 항목</strong>으로 자동 분류하고, 추가 증빙을 같은 항목에 연결합니다</div>
            <div data-ui="features-project-tab-upload-screen.div-26" style={{ display: 'flex', gap: 8, flexShrink: 0 }}><Button size="sm" disabled={!canProceed || !hasUploads || loading} onClick={() => { setLoading(true); setTimeout(() => { setLoading(false); setMatchDone(true); }, 1400); }}>분류 검토 →</Button></div>
          </div>
          {total > 0 && <div data-ui="features-project-tab-upload-screen.div-27" style={{ marginTop: 12, padding: '13px 18px', borderRadius: 12, background: C.bg, display: 'flex', alignItems: 'center', gap: 10 }}><span data-ui="features-project-tab-upload-screen.span-3">✅</span><div data-ui="features-project-tab-upload-screen.div-28" style={{ fontSize: 13, fontWeight: 600, color: C.primary }}>총 {total}개 파일 업로드 완료 — AI 자동 분류 중이에요.</div></div>}
          {loading && <InlineLoader title="매칭 검토 화면을 준비하고 있어요" body="업로드된 사용내역서, 영수증, 현장사진, 세금내역서와 제3자사실관계확인서를 항목별로 정리하고 있습니다."/>}
          <CenterModal open={matchDone} title="매칭 검토가 완료되었습니다" body="분류된 자료를 아카이브에서 확인하고, 필요하면 폴더 간 이동으로 위치를 조정할 수 있습니다." actionLabel="아카이브로 이동" onAction={() => { setMatchDone(false); onMatchComplete({ files }); }}/>
          <PhotoDescriptionModal open={siteModalFiles.length > 0} files={siteModalFiles} onClose={() => setSiteModalFiles([])} onSave={(values) => { const nextEntries = siteModalFiles.map((file) => ({ ...file, description: values[file.name] })); setFiles((prev) => ({ ...prev, site_photo: [...prev.site_photo, ...nextEntries].slice(0, 12) })); showClassificationToast(nextEntries); setSiteModalFiles([]); }}/>
          <PhotoRequirementModal open={photoRequirementOpen} report={photoRequirementReport || []} onClose={() => setPhotoRequirementOpen(false)}/>
          <ContractInfoModal open={contractInfoOpen} contract={contractMeta} onClose={() => setContractInfoOpen(false)}/>
        </div>
    </>);
    return <div data-ui="features-project-tab-upload-screen.div-29" style={{ background: C.soft, padding: 0 }}>{content}</div>;
};
export default UploadScreen;
