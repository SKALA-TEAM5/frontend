import { C } from '../../lib/theme';
export type ArchiveViewMode = 'hierarchy' | 'folder' | 'usage';
interface ArchiveToolbarProps {
    viewMode: ArchiveViewMode;
    totalVisibleFiles: number;
    onViewModeChange: (mode: ArchiveViewMode) => void;
}
export default function ArchiveToolbar({ viewMode, totalVisibleFiles, onViewModeChange }: ArchiveToolbarProps) {
    return (<div data-ui="features-project-tab-archive-toolbar.div-1" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <span data-ui="features-project-tab-archive-toolbar.span-1" style={{ fontSize: 12, fontWeight: 800, color: C.g400 }}>보기 방식</span>
        {[
            { id: 'hierarchy', label: '계층 보기' },
            { id: 'folder', label: '9개 폴더 통합 보기' },
            { id: 'usage', label: '사용내역서 보기' },
        ].map((item) => (<button data-ui="features-project-tab-archive-toolbar.button-1" key={item.id} onClick={() => onViewModeChange(item.id as ArchiveViewMode)} style={{ padding: '8px 13px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, background: viewMode === item.id ? C.primary : C.g100, color: viewMode === item.id ? '#fff' : C.g600 }}>
            {item.label}
          </button>))}
        <div data-ui="features-project-tab-archive-toolbar.div-2" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 999, background: C.white, border: `1px solid ${C.g200}` }}>
          <span data-ui="features-project-tab-archive-toolbar.span-2" style={{ fontSize: 11, fontWeight: 700, color: C.g400 }}>현재 표시</span>
          <span data-ui="features-project-tab-archive-toolbar.span-3" style={{ fontSize: 12, fontWeight: 800, color: C.primary }}>{totalVisibleFiles}개 파일</span>
        </div>
      </div>);
}
