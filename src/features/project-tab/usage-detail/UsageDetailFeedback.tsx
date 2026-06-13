import Card from '../../../components/ui/Card';
import { C } from '../../../lib/theme';
import type { UsageDetailLoadingMessage, UsageDetailVerificationStep } from './usage-statement-detail-types';

type PhotoValidationNotice = { type: 'ok' | 'bad'; message: string } | null;

interface UsageDetailNoticesProps {
  matchingError: string;
  actionError: string;
  matchingNotice: string;
  photoValidationNotice: PhotoValidationNotice;
  onDismissMatchingError: () => void;
  onDismissActionError: () => void;
  onDismissNotices: () => void;
}

export function UsageDetailNotices({
  matchingError,
  actionError,
  matchingNotice,
  photoValidationNotice,
  onDismissMatchingError,
  onDismissActionError,
  onDismissNotices,
}: UsageDetailNoticesProps) {
  return (
    <>
      {matchingError && (
        <DismissibleNotice tone="danger" onDismiss={onDismissMatchingError}>
          {matchingError}
        </DismissibleNotice>
      )}
      {actionError && (
        <DismissibleNotice tone="danger" onDismiss={onDismissActionError}>
          {actionError}
        </DismissibleNotice>
      )}
      {(matchingNotice || photoValidationNotice) && (
        <Card style={{ marginBottom: 12, padding: '12px 14px', background: photoValidationNotice?.type === 'bad' ? C.dangerBg : C.bg, border: `1px solid ${photoValidationNotice?.type === 'bad' ? '#FFCDD2' : C.light}` }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'start', gap: 12 }}>
            <div style={{ display: 'grid', gap: 5, minWidth: 0 }}>
              {matchingNotice && <div style={{ fontSize: 14, fontWeight: 800, color: photoValidationNotice?.type === 'bad' ? C.danger : C.primary, lineHeight: 1.5 }}>{matchingNotice}</div>}
              {photoValidationNotice && <div style={{ fontSize: 14, fontWeight: 800, color: photoValidationNotice.type === 'bad' ? C.danger : C.primary, lineHeight: 1.5 }}>{photoValidationNotice.message}</div>}
            </div>
            <DismissButton onClick={onDismissNotices} />
          </div>
        </Card>
      )}
    </>
  );
}

interface UsageDetailVerificationOverlayProps {
  step: UsageDetailVerificationStep | null;
  message: UsageDetailLoadingMessage | null;
}

const verificationSteps: Array<{ id: UsageDetailVerificationStep; label: string }> = [
  { id: 'ocr', label: 'OCR/link agent' },
  { id: 'safety', label: 'safety_doc_agent' },
  { id: 'vision', label: 'vision model' },
];

export function UsageDetailVerificationOverlay({ step, message }: UsageDetailVerificationOverlayProps) {
  if (!step || !message) return null;

  const stepIndex = verificationSteps.findIndex((item) => item.id === step);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'grid', placeItems: 'center', padding: 24, background: 'rgba(247, 252, 248, .62)', backdropFilter: 'blur(1px)' }}>
      <div style={{ width: 'min(100%, 680px)', background: C.white, borderRadius: 18, border: `1px solid ${C.g200}`, boxShadow: '0 18px 44px rgba(0,0,0,.18)', padding: 22 }}>
        <div className="usage-detail-verification-loader">
          <div className="usage-detail-loader-ocean" aria-hidden="true" />
          <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: C.g800 }}>{message.title}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.g600, lineHeight: 1.55 }}>{message.body}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 4 }}>
              {verificationSteps.map((item, index) => {
                const active = index === stepIndex;
                const done = index < stepIndex;

                return (
                  <div key={item.id} style={{ border: `1px solid ${active ? C.primary : done ? C.light : C.g200}`, borderRadius: 999, background: active ? C.bg : done ? '#F4FBF6' : C.white, color: active ? C.primary : done ? C.ok : C.g400, padding: '7px 8px', textAlign: 'center', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {done ? '완료 · ' : active ? '진행 · ' : ''}{item.label}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DismissibleNotice({
  tone,
  children,
  onDismiss,
}: {
  tone: 'danger';
  children: string;
  onDismiss: () => void;
}) {
  return (
    <Card style={{ marginBottom: 12, padding: '12px 14px', background: tone === 'danger' ? C.dangerBg : C.bg, border: `1px solid ${tone === 'danger' ? '#FFCDD2' : C.light}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: tone === 'danger' ? C.danger : C.primary, lineHeight: 1.5 }}>{children}</div>
        <DismissButton onClick={onDismiss} />
      </div>
    </Card>
  );
}

function DismissButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ border: 'none', background: 'transparent', color: C.g400, cursor: 'pointer', fontSize: 19, lineHeight: 1 }}>
      ×
    </button>
  );
}
