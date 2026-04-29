import { C } from '../../lib/theme';

interface ChevronIconProps {
  direction?: 'up' | 'down' | 'left' | 'right';
  size?: number;
  color?: string;
}

export default function ChevronIcon({ direction = 'down', size = 16, color = C.g400 }: ChevronIconProps) {
  const path =
    direction === 'up'
      ? 'M6 15L12 9L18 15'
      : direction === 'left'
        ? 'M15 6L9 12L15 18'
        : direction === 'right'
          ? 'M9 6L15 12L9 18'
          : 'M6 9L12 15L18 9';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d={path}
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
