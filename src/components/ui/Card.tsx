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
    return (<div data-ui="card.1" style={{
            background: '#FFFFFF',
            borderRadius: 12,
            border: '1px solid var(--c-g200)',
            padding: 24,
            boxShadow: '0 1px 2px rgba(31,47,39,.05), 0 14px 34px rgba(31,47,39,.05)',
            cursor: onClick ? 'pointer' : 'default',
            transition: 'box-shadow .18s, border-color .18s, transform .18s',
            ...style,
        }} draggable={draggable} onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd} onMouseEnter={(e) => {
            if (onClick)
                e.currentTarget.style.boxShadow = '0 2px 5px rgba(31,47,39,.07), 0 18px 38px rgba(31,47,39,.08)';
        }} onMouseLeave={(e) => {
            if (onClick)
                e.currentTarget.style.boxShadow = '0 1px 2px rgba(31,47,39,.05), 0 14px 34px rgba(31,47,39,.05)';
        }} onClick={onClick}>
      {children}
    </div>);
}
