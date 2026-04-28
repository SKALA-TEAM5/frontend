import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import FileThumb from '../../components/ui/FileThumb';
import { C } from '../../lib/theme';
import type { EvidenceFile } from '../../types/domain';

interface ArchiveUsageStatementViewProps {
    files: EvidenceFile[];
    onAdd: () => void;
    onRemove: (fileId: string) => void;
}

export default function ArchiveUsageStatementView({ files, onAdd, onRemove }: ArchiveUsageStatementViewProps) {
    return (
        <Card style={{ padding: '18px 20px' }}>
            <div data-ui="features-project-tab-archive-usage-statement-view.header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
                <div data-ui="features-project-tab-archive-usage-statement-view.title-group">
                    <div data-ui="features-project-tab-archive-usage-statement-view.title" style={{ fontSize: 17, fontWeight: 900, color: C.g800 }}>사용내역서 보기</div>
                    <div data-ui="features-project-tab-archive-usage-statement-view.description" style={{ fontSize: 14, color: C.g400, marginTop: 4 }}>사용내역서는 9개 폴더로 분류하지 않고 프로젝트 기준 문서로 관리합니다.</div>
                </div>
                <Button size="sm" variant="outline" onClick={onAdd}>사용내역서 추가</Button>
            </div>

            <div data-ui="features-project-tab-archive-usage-statement-view.list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {files.length === 0 && (
                    <div data-ui="features-project-tab-archive-usage-statement-view.empty" style={{ minHeight: 160, border: `1px dashed ${C.g200}`, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.g400, fontSize: 15, fontWeight: 700 }}>
                        등록된 사용내역서가 없습니다
                    </div>
                )}
                {files.map((file) => (
                    <div data-ui="features-project-tab-archive-usage-statement-view.row" key={file.id} style={{ display: 'grid', gridTemplateColumns: '40px minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: '12px 14px', border: `1px solid ${C.g200}`, borderRadius: 14, background: C.white }}>
                        <FileThumb entry={file} size={40}/>
                        <div data-ui="features-project-tab-archive-usage-statement-view.row-body" style={{ minWidth: 0 }}>
                            <div data-ui="features-project-tab-archive-usage-statement-view.file-name" style={{ fontSize: 15, fontWeight: 900, color: C.g800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</div>
                            <div data-ui="features-project-tab-archive-usage-statement-view.file-meta" style={{ fontSize: 13, color: C.g400, marginTop: 4 }}>
                                업로더 {file.uploadedBy || '정보 없음'} · 업로드일 {file.uploadedAt || '날짜 미상'}
                            </div>
                        </div>
                        <button data-ui="features-project-tab-archive-usage-statement-view.remove-button" type="button" onClick={() => onRemove(file.id)} style={{ border: 'none', background: C.g100, color: C.g600, borderRadius: 9, padding: '7px 10px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 900 }}>
                            삭제
                        </button>
                    </div>
                ))}
            </div>
        </Card>
    );
}
