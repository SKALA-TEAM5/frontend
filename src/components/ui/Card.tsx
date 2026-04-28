interface CardProps {
    children: React.ReactNode;
    style?: React.CSSProperties;
    onClick?: () => void;
    draggable?: boolean;
    onDragStart?: (event: React.DragEvent<HTMLDivElement>) => void;
    onDragOver?: (event: React.DragEvent<HTMLDivElement>) => void;
    onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
    onDragEnd?: (event: React.DragEvent<HTMLDivElement>) => void;
}
export default function Card({ children, style, onClick, draggable, onDragStart, onDragOver, onDrop, onDragEnd }: CardProps) {
    return (<div data-ui="components-ui-card.div-1" style={{
            background: '#FFFFFF',
            borderRadius: 20,
            padding: 24,
            boxShadow: '0 2px 16px rgba(27,94,59,.07)',
            cursor: onClick ? 'pointer' : 'default',
            transition: 'box-shadow .18s',
            ...style,
        }} draggable={draggable} onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd} onMouseEnter={(e) => {
            if (onClick)
                e.currentTarget.style.boxShadow = '0 6px 28px rgba(27,94,59,.13)';
        }} onMouseLeave={(e) => {
            if (onClick)
                e.currentTarget.style.boxShadow = '0 2px 16px rgba(27,94,59,.07)';
        }} onClick={onClick}>
      {children}
    </div>);
}
