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
        xs: { fontSize: 12, padding: '7px 12px' },
        sm: { fontSize: 14, padding: '9px 18px' },
        md: { fontSize: 17, padding: '13px 26px' },
        lg: { fontSize: 18, padding: '15px 30px' },
    };
    const variants: Record<ButtonVariant, React.CSSProperties> = {
        primary: { background: C.primary, color: '#fff', boxShadow: '0 10px 22px rgba(27, 94, 59, .24)' },
        outline: { background: C.white, color: C.g600, border: `1px solid ${C.g200}`, boxShadow: '0 8px 18px rgba(31, 55, 43, .10)' },
        ghost: { background: C.bg, color: C.primary, border: `1px solid ${C.g200}` },
        subtle: { background: C.g100, color: C.g800, border: `1px solid ${C.g200}` },
    };
    return (<button data-ui="button.1" type={type} disabled={disabled} onClick={onClick} style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            fontFamily: 'inherit',
            fontWeight: 900,
            cursor: disabled ? 'not-allowed' : 'pointer',
            border: 'none',
            borderRadius: 999,
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
