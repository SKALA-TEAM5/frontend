import { useEffect, useRef } from 'react';

interface ModalProps {
    open: boolean;
    onClose?: () => void;
    children: React.ReactNode;
    zIndex?: number;
    maxWidth?: number | string;
}
export default function Modal({ open, onClose, children, zIndex = 900, maxWidth = 620, }: ModalProps) {
    const dialogRef = useRef<HTMLDivElement | null>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);
    useEffect(() => {
        if (!open)
            return;
        previousFocusRef.current = document.activeElement as HTMLElement | null;
        dialogRef.current?.focus();
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape')
                onClose?.();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            previousFocusRef.current?.focus?.();
        };
    }, [open, onClose]);
    if (!open)
        return null;
    return (<div data-ui="modal.1" onClick={onClose} style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, .12)',
            backdropFilter: 'blur(.5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex,
            padding: 24,
        }}>
      <div
        ref={dialogRef}
        data-ui="modal.2"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="screen-enter"
        style={{
            width: '100%',
            maxWidth,
        }}>
        {children}
      </div>
    </div>);
}
