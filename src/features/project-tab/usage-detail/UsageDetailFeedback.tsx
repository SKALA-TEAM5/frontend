import { useEffect, useMemo, useRef, useState } from 'react';
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

const verificationSteps: Array<{ id: UsageDetailVerificationStep; label: string; minimumProgress: number }> = [
  { id: 'ocr', label: '증빙 연결 확인', minimumProgress: 8 },
  { id: 'safety', label: '필수 증빙 확인', minimumProgress: 36 },
  { id: 'vision', label: '현장사진 확인', minimumProgress: 68 },
];

export function UsageDetailVerificationOverlay({ step, message }: UsageDetailVerificationOverlayProps) {
  const startedAtRef = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const active = Boolean(step && message);

  useEffect(() => {
    if (!active) {
      startedAtRef.current = null;
      setElapsedMs(0);
      return;
    }
    if (startedAtRef.current == null) {
      startedAtRef.current = Date.now();
    }
    const timerId = window.setInterval(() => {
      setElapsedMs(Date.now() - (startedAtRef.current || Date.now()));
    }, 160);
    return () => window.clearInterval(timerId);
  }, [active]);

  const progress = useMemo(() => {
    const stepMeta = verificationSteps.find((item) => item.id === step);
    const elapsedProgress = Math.min(92, 10 + (elapsedMs / 14000) * 82);
    return Math.round(Math.max(stepMeta?.minimumProgress || 6, elapsedProgress));
  }, [elapsedMs, step]);

  if (!step || !message) return null;

  const stepIndex = verificationSteps.findIndex((item) => item.id === step);
  const stepLabel = verificationSteps[stepIndex]?.label || '검증 진행';

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'grid', placeItems: 'center', padding: 24, background: 'rgba(247, 252, 248, .62)', backdropFilter: 'blur(1px)' }}>
      <div style={{ width: 'min(100%, 680px)', background: C.white, borderRadius: 18, border: `1px solid ${C.g200}`, boxShadow: '0 18px 44px rgba(0,0,0,.18)', padding: 22 }}>
        <div className="usage-detail-verification-loader">
          <div className="usage-detail-loader-ocean" aria-hidden="true" />
          <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: C.g800 }}>{message.title}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.g600, lineHeight: 1.55 }}>{message.body}</div>
            <div style={{ display: 'grid', gap: 8, marginTop: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: C.g500 }}>{stepIndex + 1}/3 · {stepLabel}</div>
                <div style={{ fontSize: 12, fontWeight: 900, color: C.primary, fontVariantNumeric: 'tabular-nums' }}>{progress}%</div>
              </div>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                aria-label="유효성 검증 진행률"
                style={{ height: 10, borderRadius: 999, background: C.g100, border: `1px solid ${C.g200}`, overflow: 'hidden' }}
              >
                <div style={{ width: `${progress}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${C.primary}, #56B881)`, transition: 'width 180ms linear' }} />
              </div>
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
