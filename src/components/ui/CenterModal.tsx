import { C } from '../../lib/theme';
import Button from './Button';
import Modal from './Modal';
interface CenterModalProps {
    open: boolean;
    title: string;
    body: React.ReactNode;
    actionLabel: string;
    onAction: () => void;
}

const parseStatusMessage = (body: React.ReactNode) => {
    if (typeof body !== 'string') return null;
    const match = body.match(/^(\d{3})(?:\s+([^\n]+))?\n([\s\S]+)$/);
    if (!match) return null;
    return {
        code: match[1],
        name: match[2] || '',
        message: match[3],
    };
};

export default function CenterModal({ open, title, body, actionLabel, onAction, }: CenterModalProps) {
    const statusMessage = parseStatusMessage(body);
    return (<Modal open={open} zIndex={920} maxWidth={460}>
      <div data-ui="center-modal.1" style={{
            background: C.white,
            borderRadius: 12,
            boxShadow: '0 22px 52px rgba(31, 47, 39, .18)',
            border: `1px solid ${C.g200}`,
            overflow: 'hidden',
        }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '20px 22px 17px', borderBottom: `1px solid ${C.g100}` }}>
          <div data-ui="center-modal.2" aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 999, background: C.bg, color: C.primary, border: `1px solid ${C.g200}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', fontSize: 16, fontWeight: 900, lineHeight: 1 }}>!</div>
          <div style={{ minWidth: 0 }}>
            <div data-ui="center-modal.3" style={{ fontSize: 18, fontWeight: 900, color: C.g800, lineHeight: 1.35, marginBottom: 6 }}>{title}</div>
            <div data-ui="center-modal.4" style={{ fontSize: 13, fontWeight: 800, color: C.g600, lineHeight: 1.65 }}>
              {statusMessage ? (
                <div style={{ display: 'grid', gap: 9 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', minHeight: 22, borderRadius: 999, border: `1px solid ${C.danger}`, background: C.dangerBg, color: C.danger, padding: '3px 8px', fontSize: 11, fontWeight: 900, lineHeight: 1 }}>{[statusMessage.code, statusMessage.name].filter(Boolean).join(' ')}</span>
                  </div>
                  <div style={{ whiteSpace: 'pre-line' }}>{statusMessage.message}</div>
                </div>
              ) : body}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 22px 18px', background: '#FAFBFA' }}>
          <Button size="sm" onClick={onAction} style={{ minWidth: 84, boxShadow: 'none' }}>
            {actionLabel}
          </Button>
        </div>
      </div>
    </Modal>);
}
