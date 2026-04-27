import Card from '../../components/ui/Card';
import { C } from '../../lib/theme';
import type { FolderEvidenceCategory } from '../../types/domain';
export type ArchiveTabId = FolderEvidenceCategory;
export type ArchiveViewMode = 'folder' | 'type' | 'usage';
const ARCHIVE_TABS: Array<{
    id: ArchiveTabId;
    label: string;
}> = [
    { id: 'receipt', label: '영수증' },
    { id: 'site_photo', label: '현장사진' },
    { id: 'tax_invoice', label: '세금내역서 + 제3자사실관계확인서' },
];
interface ArchiveToolbarProps {
    viewMode: ArchiveViewMode;
    tab: ArchiveTabId;
    totalVisibleFiles: number;
    onViewModeChange: (mode: ArchiveViewMode) => void;
    onTabChange: (tab: ArchiveTabId) => void;
}
export default function ArchiveToolbar({ viewMode, tab, totalVisibleFiles, onViewModeChange, onTabChange }: ArchiveToolbarProps) {
    return (<Card style={{ padding: '14px 16px', maxWidth: 760, marginBottom: 20 }}>
      <div data-ui="features-project-tab-archive-toolbar.div-1" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: viewMode === 'type' ? 12 : 0 }}>
        <span data-ui="features-project-tab-archive-toolbar.span-1" style={{ fontSize: 12, fontWeight: 800, color: C.g400 }}>보기 방식</span>
        {[
            { id: 'folder', label: '9개 폴더 통합 보기' },
            { id: 'type', label: '자료유형별 보기' },
            { id: 'usage', label: '사용내역서 보기' },
        ].map((item) => (<button data-ui="features-project-tab-archive-toolbar.button-1" key={item.id} onClick={() => onViewModeChange(item.id as ArchiveViewMode)} style={{ padding: '8px 13px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, background: viewMode === item.id ? C.primary : C.g100, color: viewMode === item.id ? '#fff' : C.g600 }}>
            {item.label}
          </button>))}
        <div data-ui="features-project-tab-archive-toolbar.div-2" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 999, background: C.white, border: `1px solid ${C.g200}` }}>
          <span data-ui="features-project-tab-archive-toolbar.span-2" style={{ fontSize: 11, fontWeight: 700, color: C.g400 }}>현재 표시</span>
          <span data-ui="features-project-tab-archive-toolbar.span-3" style={{ fontSize: 12, fontWeight: 800, color: C.primary }}>{totalVisibleFiles}개 파일</span>
        </div>
      </div>
      {viewMode === 'type' && (<div data-ui="features-project-tab-archive-toolbar.div-3" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {ARCHIVE_TABS.map((typeTab) => (<button data-ui="features-project-tab-archive-toolbar.button-2" key={typeTab.id} onClick={() => onTabChange(typeTab.id)} style={{ padding: '8px 14px', borderRadius: 9, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, transition: 'all .18s', background: tab === typeTab.id ? C.primary : C.white, color: tab === typeTab.id ? '#fff' : C.g600, boxShadow: tab === typeTab.id ? `0 2px 10px ${C.primary}30` : '0 1px 4px rgba(0,0,0,.06)' }}>
              {typeTab.label}
            </button>))}
        </div>)}
    </Card>);
}
