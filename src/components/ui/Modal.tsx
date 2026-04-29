interface ModalProps {
    open: boolean;
    onClose?: () => void;
    children: React.ReactNode;
    zIndex?: number;
    maxWidth?: number | string;
}
export default function Modal({ open, onClose, children, zIndex = 900, maxWidth = 620, }: ModalProps) {
    if (!open)
        return null;
    return (<div data-ui="modal.1" onClick={onClose} style={{
            position: 'fixed',
            inset: 0,
            background: 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex,
            padding: 24,
        }}>
      <div data-ui="modal.2" onClick={(e) => e.stopPropagation()} className="screen-enter" style={{
            width: '100%',
            maxWidth,
        }}>
        {children}
      </div>
    </div>);
}
