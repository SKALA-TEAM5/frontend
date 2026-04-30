import { C } from '../../lib/theme';

export type ArchiveViewMode = 'hierarchy' | 'folder';
export type ArchiveValidationStatus = 'idle' | 'running' | 'done';

interface ArchiveToolbarProps {
    viewMode: ArchiveViewMode;
    onViewModeChange: (mode: ArchiveViewMode) => void;
    validationStatus: ArchiveValidationStatus;
    onRunValidation: () => void;
    onUpload?: () => void;
}

export default function ArchiveToolbar({ viewMode, onViewModeChange, validationStatus, onRunValidation, onUpload }: ArchiveToolbarProps) {
    const viewOptions = [
        { id: 'hierarchy', label: '계층 보기' },
        { id: 'folder', label: '9개 폴더 통합 보기' },
    ] as const;
    const validationLabel = validationStatus === 'running' ? '검증 중...' : validationStatus === 'done' ? '재검증하기' : '유효성 검증';

    return (<div data-ui="archive-toolbar.1" style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginBottom: 10 }}>
        <span data-ui="archive-toolbar.2" style={{ fontSize: 14, fontWeight: 800, color: C.g400 }}>보기 방식</span>
        {viewOptions.map((item, index) => (<span key={item.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
            <button data-ui="archive-toolbar.3" onClick={() => onViewModeChange(item.id as ArchiveViewMode)} style={{ padding: 0, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: viewMode === item.id ? 900 : 800, background: 'transparent', color: viewMode === item.id ? C.primary : C.g600 }}>
              {item.label}
            </button>
            {index < viewOptions.length - 1 && <span style={{ color: C.g200, fontSize: 14, fontWeight: 800 }}>|</span>}
          </span>))}
        {onUpload && <button data-ui="archive-toolbar.4" type="button" onClick={onUpload} style={{ marginLeft: 'auto', border: `1px solid ${C.g200}`, borderRadius: 999, padding: '9px 14px', background: C.white, color: C.g600, fontFamily: 'inherit', fontSize: 13, fontWeight: 900, cursor: 'pointer', boxShadow: `0 6px 14px ${C.primary}26` }}>
          증빙 업로드
        </button>}
        <button data-ui="archive-toolbar.5" type="button" onClick={onRunValidation} disabled={validationStatus === 'running'} style={{ marginLeft: onUpload ? 0 : 'auto', border: 'none', borderRadius: 999, padding: '9px 14px', background: validationStatus === 'done' ? C.bg : C.primary, color: validationStatus === 'done' ? C.primary : C.white, fontFamily: 'inherit', fontSize: 13, fontWeight: 900, cursor: validationStatus === 'running' ? 'wait' : 'pointer', boxShadow: validationStatus === 'done' ? 'none' : `0 6px 14px ${C.primary}26` }}>
          {validationLabel}
        </button>
      </div>);
}
