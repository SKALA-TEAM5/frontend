'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { C } from '../../lib/theme';
import { useCurrentUser } from '../../lib/dev-user';

interface AppFrameProps {
    title: string;
    description?: string;
    actions?: React.ReactNode;
    mainClassName?: string;
    children: React.ReactNode;
}

const headerNavItems = [
    { href: '/dashboard', label: '대시보드' },
    { href: '/projects', label: '전체 프로젝트' },
];

export default function AppFrame({ description, actions, mainClassName, children }: AppFrameProps) {
    const { user } = useCurrentUser();
    const pathname = usePathname();
    const hasHeaderContent = Boolean(description || actions);
    const isNavActive = (href: string) => pathname === href || (href === '/projects' && pathname.startsWith('/projects'));
    const headerLinkStyle = (active = false): React.CSSProperties => ({
      color: active ? C.primary : C.g400,
      textDecoration: 'none',
      fontSize: 13,
      fontWeight: 900,
      lineHeight: 1,
      whiteSpace: 'nowrap',
    });

    return (
      <div data-ui="app-frame.1" style={{ minHeight: '100vh', background: C.soft, '--app-left-offset': '0px' } as React.CSSProperties}>
        <header className="app-global-header">
          <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 11, fontWeight: 900, color: C.g800, fontSize: 17, textDecoration: 'none' }}>
            <img src="/uploads/character.png" alt="i-veri" style={{ width: 34, height: 34, objectFit: 'contain' }} />
            <span>i-veri</span>
            <span style={{ color: '#2F73B7', fontSize: 22 }}>WorkPlace</span>
          </Link>

          <nav aria-label="상단 메뉴" style={{ display: 'flex', alignItems: 'center', gap: 24, minWidth: 0 }}>
            {headerNavItems.map((item) => {
              const active = isNavActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={headerLinkStyle(active)}
                >
                  {item.label}
                </Link>
              );
            })}
            <span
              title={`${user.name} 사용자`}
              style={headerLinkStyle(false)}
            >
              사용자
            </span>
          </nav>
        </header>

        <main data-ui="app-frame.18" className={mainClassName ? `app-main ${mainClassName}` : 'app-main'}>
          {hasHeaderContent && (
            <div data-ui="app-frame.19" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
              <div data-ui="app-frame.20" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                {description && <div data-ui="app-frame.21" style={{ fontSize: 14, color: C.g400, fontWeight: 700 }}>{description}</div>}
              </div>
              {actions && <div data-ui="app-frame.22" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>{actions}</div>}
            </div>
          )}
          {children}
        </main>
      </div>
    );
}
