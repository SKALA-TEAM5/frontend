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
    const sizes: Record<ButtonSize, React.CSSProperties> = {
        xs: { fontSize: 14, padding: '5px 9px', borderRadius: 9 },
        sm: { fontSize: 14, padding: '7px 14px' },
        md: { fontSize: 17, padding: '13px 24px' },
        lg: { fontSize: 18, padding: '14px 28px' },
    };
    const variants: Record<ButtonVariant, React.CSSProperties> = {
        primary: { background: C.primary, color: '#fff' },
        outline: { background: 'transparent', color: C.primary, border: `1.5px solid ${C.primary}` },
        ghost: { background: C.bg, color: C.primary },
        subtle: { background: C.g100, color: C.g800 },
    };
    return (<button data-ui="button.1" type={type} disabled={disabled} onClick={onClick} style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            fontFamily: 'inherit',
            fontWeight: 700,
            cursor: disabled ? 'not-allowed' : 'pointer',
            border: 'none',
            borderRadius: 12,
            transition: 'all .15s',
            outline: 'none',
            opacity: disabled ? 0.45 : 1,
            width: full ? '100%' : undefined,
            ...sizes[size],
            ...variants[variant],
            ...style,
        }} onMouseEnter={(e) => {
            if (!disabled)
                e.currentTarget.style.filter = 'brightness(1.08)';
        }} onMouseLeave={(e) => {
            e.currentTarget.style.filter = '';
        }}>
    {children}
    </button>);
}
