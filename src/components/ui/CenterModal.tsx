import { C } from '../../lib/theme';
import Button from './Button';
import Modal from './Modal';
interface CenterModalProps {
    open: boolean;
    title: string;
    body: React.ReactNode;
    actionLabel: string;
    onAction: () => void;
    maxWidth?: number | string;
}

const normalizeModalBody = (body: React.ReactNode) => {
    if (typeof body !== 'string') return body;
    return body.replace(/^\d{3}(?:\s+[^\n]+)?\n/, '');
};

export default function CenterModal({ open, title, body, actionLabel, onAction, maxWidth = 460, }: CenterModalProps) {
    const modalBody = normalizeModalBody(body);
    return (<Modal open={open} zIndex={920} maxWidth={maxWidth}>
      <div data-ui="center-modal.1" style={{
            background: C.white,
            borderRadius: 12,
            boxShadow: '0 22px 52px rgba(31, 47, 39, .18)',
            border: `1px solid ${C.g200}`,
            overflow: 'hidden',
        }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '20px 22px 17px', borderBottom: `1px solid ${C.g100}` }}>
          <div data-ui="center-modal.2" aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 999, background: C.bg, color: C.primary, border: `1px solid ${C.g200}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', fontSize: 17, fontWeight: 800, lineHeight: 1 }}>!</div>
          <div style={{ minWidth: 0 }}>
            <div data-ui="center-modal.3" style={{ fontSize: 19, fontWeight: 800, color: C.g800, lineHeight: 1.35, marginBottom: 6 }}>{title}</div>
            <div data-ui="center-modal.4" style={{ fontSize: 14, fontWeight: 700, color: C.g600, lineHeight: 1.65 }}>
              {typeof modalBody === 'string' ? <div style={{ whiteSpace: 'pre-line' }}>{modalBody}</div> : modalBody}
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
