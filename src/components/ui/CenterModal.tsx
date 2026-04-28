import { C } from '../../lib/theme';
import Button from './Button';
import Modal from './Modal';
interface CenterModalProps {
    open: boolean;
    title: string;
    body: string;
    actionLabel: string;
    onAction: () => void;
}
export default function CenterModal({ open, title, body, actionLabel, onAction, }: CenterModalProps) {
    return (<Modal open={open} zIndex={920} maxWidth={420}>
      <div data-ui="components-ui-center-modal.div-1" style={{
            background: C.white,
            borderRadius: 24,
            boxShadow: '0 18px 40px rgba(0,0,0,.16)',
            border: `1px solid ${C.g200}`,
            padding: '28px 26px',
            textAlign: 'center',
        }}>
        <div data-ui="components-ui-center-modal.div-2" style={{ fontSize: 40, marginBottom: 10 }}>!</div>
        <div data-ui="components-ui-center-modal.div-3" style={{ fontSize: 24, fontWeight: 800, color: C.g800, marginBottom: 8 }}>{title}</div>
        <div data-ui="components-ui-center-modal.div-4" style={{ fontSize: 16, color: C.g400, lineHeight: 1.7, marginBottom: 18 }}>{body}</div>
        <Button size="md" onClick={onAction}>
          {actionLabel}
        </Button>
      </div>
    </Modal>);
}
