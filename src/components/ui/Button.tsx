import { useState } from 'react';
import { C } from '../../lib/theme';
type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'subtle';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';
interface ButtonProps {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: ButtonVariant;
    size?: ButtonSize;
    full?: boolean;
    disabled?: boolean;
    style?: React.CSSProperties;
    type?: 'button' | 'submit' | 'reset';
}
export default function Button({ children, onClick, variant = 'primary', size = 'md', full, disabled, style, type = 'button', }: ButtonProps) {
    const [hovered, setHovered] = useState(false);
    const sizes: Record<ButtonSize, React.CSSProperties> = {
        xs: { fontSize: 13, padding: '6px 11px', minHeight: 30 },
        sm: { fontSize: 14, padding: '8px 16px', minHeight: 34 },
        md: { fontSize: 16, padding: '10px 22px', minHeight: 40 },
        lg: { fontSize: 17, padding: '12px 26px', minHeight: 46 },
    };
    const variants: Record<ButtonVariant, React.CSSProperties> = {
        primary: { background: C.primary, color: '#fff', border: `1px solid ${C.primary}`, boxShadow: '0 6px 14px var(--c-primary-shadow)' },
        outline: { background: C.white, color: C.primary, border: `1px solid ${C.light}`, boxShadow: 'none' },
        ghost: { background: C.bg, color: C.primary, border: `1px solid ${C.g200}`, boxShadow: 'none' },
        subtle: { background: C.g100, color: C.g800, border: `1px solid ${C.g200}`, boxShadow: 'none' },
    };
    const hoverStyle: React.CSSProperties = hovered && !disabled ? {
        filter: variant === 'primary' ? 'brightness(1.04)' : 'none',
        boxShadow: variant === 'primary' ? '0 8px 18px var(--c-primary-shadow)' : '0 2px 8px rgba(31, 47, 39, .08)',
        transform: 'translateY(-1px)',
    } : {};
    return (<button data-ui="button.1" type={type} disabled={disabled} onClick={onClick} style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            fontFamily: 'inherit',
            fontWeight: 650,
            cursor: disabled ? 'not-allowed' : 'pointer',
            border: '1px solid transparent',
            borderRadius: 999,
            transition: 'background .15s, border-color .15s, color .15s, box-shadow .15s, filter .15s, transform .15s',
            outline: 'none',
            opacity: disabled ? 0.45 : 1,
            width: full ? '100%' : undefined,
            ...sizes[size],
            ...variants[variant],
            ...hoverStyle,
            ...style,
        }} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
    {children}
    </button>);
}
