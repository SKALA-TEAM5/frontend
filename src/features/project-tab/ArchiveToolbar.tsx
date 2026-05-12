import { C } from '../../lib/theme';

export type ArchiveViewMode = 'hierarchy' | 'folder';
export type ArchiveValidationStatus = 'idle' | 'running' | 'done';

interface ArchiveToolbarProps {
    viewMode: ArchiveViewMode;
    onViewModeChange: (mode: ArchiveViewMode) => void;
    validationStatus: ArchiveValidationStatus;
    onRunPhotoValidation: () => void;
    onRunMatching: () => void;
    matchingStatus?: 'idle' | 'running' | 'done';
}

export default function ArchiveToolbar({ viewMode, onViewModeChange, validationStatus, onRunPhotoValidation, onRunMatching, matchingStatus = 'idle' }: ArchiveToolbarProps) {
    const viewOptions = [
        { id: 'hierarchy', label: '계층 보기' },
        { id: 'folder', label: '9개 폴더 통합 보기' },
    ] as const;
    const matchingLabel = matchingStatus === 'running' ? '매칭 중...' : matchingStatus === 'done' ? '재매칭' : '매칭';
    const validationLabel = validationStatus === 'running' ? '현장사진 검증 중...' : validationStatus === 'done' ? '현장사진 재검증' : '현장사진 검증';
    return (<div data-ui="archive-toolbar.1" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12, padding: '12px 14px', borderRadius: 6, background: '#F4FBF6', border: `1px solid ${C.g200}` }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span data-ui="archive-toolbar.2" style={{ fontSize: 13, fontWeight: 900, color: C.g400 }}>보기 방식</span>
          {viewOptions.map((item, index) => (<span key={item.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
              <button data-ui="archive-toolbar.3" onClick={() => onViewModeChange(item.id as ArchiveViewMode)} style={{ padding: 0, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: viewMode === item.id ? 900 : 800, background: 'transparent', color: viewMode === item.id ? C.primary : C.g600 }}>
                {item.label}
              </button>
              {index < viewOptions.length - 1 && <span style={{ color: C.g200, fontSize: 14, fontWeight: 800 }}>|</span>}
            </span>))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button data-ui="archive-toolbar.4" type="button" onClick={onRunMatching} disabled={matchingStatus === 'running'} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '9px 15px', background: matchingStatus === 'done' ? C.bg : C.white, color: matchingStatus === 'done' ? C.primary : C.g600, fontFamily: 'inherit', fontSize: 13, fontWeight: 900, cursor: matchingStatus === 'running' ? 'wait' : 'pointer', boxShadow: 'none' }}>
            {matchingLabel}
          </button>
          <button data-ui="archive-toolbar.5" type="button" onClick={onRunPhotoValidation} disabled={validationStatus === 'running'} style={{ border: 'none', borderRadius: 999, padding: '9px 15px', background: validationStatus === 'done' ? C.bg : C.primary, color: validationStatus === 'done' ? C.primary : C.white, fontFamily: 'inherit', fontSize: 13, fontWeight: 900, cursor: validationStatus === 'running' ? 'wait' : 'pointer', boxShadow: 'none' }}>
            {validationLabel}
          </button>
        </div>
      </div>);
}
