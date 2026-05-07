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
            borderRadius: 6,
            border: '1px solid #c9e8d3',
            padding: 24,
            boxShadow: '0 10px 22px rgba(31,55,43,.06)',
            cursor: onClick ? 'pointer' : 'default',
            transition: 'box-shadow .18s',
            ...style,
        }} draggable={draggable} onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd} onMouseEnter={(e) => {
            if (onClick)
                e.currentTarget.style.boxShadow = '0 12px 24px rgba(31,55,43,.10)';
        }} onMouseLeave={(e) => {
            if (onClick)
                e.currentTarget.style.boxShadow = '0 10px 22px rgba(31,55,43,.06)';
        }} onClick={onClick}>
      {children}
    </div>);
}
