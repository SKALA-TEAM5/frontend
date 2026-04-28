import { C } from '../../lib/theme';
export type ArchiveViewMode = 'hierarchy' | 'folder' | 'usage';
interface ArchiveToolbarProps {
    viewMode: ArchiveViewMode;
    totalVisibleFiles: number;
    onViewModeChange: (mode: ArchiveViewMode) => void;
}
export default function ArchiveToolbar({ viewMode, totalVisibleFiles, onViewModeChange }: ArchiveToolbarProps) {
    const viewOptions = [
        { id: 'hierarchy', label: '계층 보기' },
        { id: 'folder', label: '9개 폴더 통합 보기' },
        { id: 'usage', label: '사용내역서 보기' },
    ] as const;
    return (<div data-ui="features-project-tab-archive-toolbar.div-1" style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginBottom: 10 }}>
        <span data-ui="features-project-tab-archive-toolbar.span-1" style={{ fontSize: 14, fontWeight: 800, color: C.g400 }}>보기 방식</span>
        {viewOptions.map((item, index) => (<span key={item.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
            <button data-ui="features-project-tab-archive-toolbar.button-1" onClick={() => onViewModeChange(item.id as ArchiveViewMode)} style={{ padding: 0, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: viewMode === item.id ? 900 : 800, background: 'transparent', color: viewMode === item.id ? C.primary : C.g600 }}>
              {item.label}
            </button>
            {index < viewOptions.length - 1 && <span style={{ color: C.g200, fontSize: 14, fontWeight: 800 }}>|</span>}
          </span>))}
        <div data-ui="features-project-tab-archive-toolbar.div-2" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 999, background: C.white, border: `1px solid ${C.g200}` }}>
          <span data-ui="features-project-tab-archive-toolbar.span-2" style={{ fontSize: 13, fontWeight: 700, color: C.g400 }}>현재 표시</span>
          <span data-ui="features-project-tab-archive-toolbar.span-3" style={{ fontSize: 14, fontWeight: 800, color: C.primary }}>{totalVisibleFiles}개 파일</span>
        </div>
      </div>);
}

