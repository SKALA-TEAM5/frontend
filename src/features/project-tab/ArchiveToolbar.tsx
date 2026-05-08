import { C } from '../../lib/theme';

export type ArchiveViewMode = 'hierarchy' | 'folder';
export type ArchiveValidationStatus = 'idle' | 'running' | 'done';

interface ArchiveToolbarProps {
    viewMode: ArchiveViewMode;
    onViewModeChange: (mode: ArchiveViewMode) => void;
    validationStatus: ArchiveValidationStatus;
    onRunPhotoValidation: () => void;
    onRunMatching: () => void;
    canRunArchiveTools?: boolean;
    matchingStatus?: 'idle' | 'running' | 'done';
    actionRequestBadge?: {
        label: string;
        pulse?: boolean;
        onClick: () => void;
    };
    reviewRequestButton?: {
        label: string;
        disabled?: boolean;
        onClick: () => void;
    };
}

export default function ArchiveToolbar({ viewMode, onViewModeChange, validationStatus, onRunPhotoValidation, onRunMatching, canRunArchiveTools = true, matchingStatus = 'idle', actionRequestBadge, reviewRequestButton }: ArchiveToolbarProps) {
    const viewOptions = [
        { id: 'hierarchy', label: '계층 보기' },
        { id: 'folder', label: '9개 폴더 통합 보기' },
    ] as const;
    const matchingLabel = matchingStatus === 'running' ? '매칭 중...' : matchingStatus === 'done' ? '재매칭' : '매칭';
    const validationLabel = validationStatus === 'running' ? '현장사진 검증 중...' : validationStatus === 'done' ? '현장사진 재검증' : '현장사진 검증';

    return (<div data-ui="archive-toolbar.1" style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginBottom: 10 }}>
        <span data-ui="archive-toolbar.2" style={{ fontSize: 14, fontWeight: 800, color: C.g400 }}>보기 방식</span>
        {viewOptions.map((item, index) => (<span key={item.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
            <button data-ui="archive-toolbar.3" onClick={() => onViewModeChange(item.id as ArchiveViewMode)} style={{ padding: 0, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: viewMode === item.id ? 900 : 800, background: 'transparent', color: viewMode === item.id ? C.primary : C.g600 }}>
              {item.label}
            </button>
            {index < viewOptions.length - 1 && <span style={{ color: C.g100, fontSize: 14, fontWeight: 800 }}>|</span>}
          </span>))}
        <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {actionRequestBadge && <button type="button" className={actionRequestBadge.pulse ? 'action-request-pulse' : undefined} onClick={actionRequestBadge.onClick} style={{ border: `1px solid ${C.danger}`, borderRadius: 999, padding: '9px 14px', background: C.dangerBg, color: C.danger, fontFamily: 'inherit', fontSize: 13, fontWeight: 900, cursor: 'pointer', boxShadow: 'none', whiteSpace: 'nowrap' }}>
            {actionRequestBadge.label}
          </button>}
          {reviewRequestButton && <button type="button" onClick={reviewRequestButton.onClick} disabled={reviewRequestButton.disabled} style={{ border: 'none', borderRadius: 999, padding: '9px 14px', background: reviewRequestButton.disabled ? C.g100 : C.primary, color: reviewRequestButton.disabled ? C.g400 : C.white, fontFamily: 'inherit', fontSize: 13, fontWeight: 900, cursor: reviewRequestButton.disabled ? 'not-allowed' : 'pointer', boxShadow: reviewRequestButton.disabled ? 'none' : `0 6px 14px ${C.primaryShadow}`, whiteSpace: 'nowrap' }}>
            {reviewRequestButton.label}
          </button>}
          <button data-ui="archive-toolbar.4" type="button" onClick={onRunMatching} disabled={matchingStatus === 'running'} style={{ border: `1px solid ${C.g200}`, borderRadius: 999, padding: '9px 14px', background: matchingStatus === 'done' ? C.bg : C.white, color: matchingStatus === 'done' ? C.primary : C.g600, fontFamily: 'inherit', fontSize: 13, fontWeight: 900, cursor: matchingStatus === 'running' ? 'wait' : 'pointer', boxShadow: `0 6px 14px ${C.primaryShadow}` }}>
            {matchingLabel}
          </button>
          {canRunArchiveTools && <button data-ui="archive-toolbar.5" type="button" onClick={onRunPhotoValidation} disabled={validationStatus === 'running'} style={{ border: 'none', borderRadius: 999, padding: '9px 14px', background: validationStatus === 'done' ? C.bg : C.primary, color: validationStatus === 'done' ? C.primary : C.white, fontFamily: 'inherit', fontSize: 13, fontWeight: 900, cursor: validationStatus === 'running' ? 'wait' : 'pointer', boxShadow: validationStatus === 'done' ? 'none' : `0 6px 14px ${C.primaryShadow}` }}>
            {validationLabel}
          </button>}
        </div>
      </div>);
}
