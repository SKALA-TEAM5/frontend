import Link from 'next/link';
import { C } from '../../lib/theme';
import { CURRENT_USER } from '../../lib/project-data';
import { ROLE_LABELS } from '../../lib/permissions';
interface AppFrameProps {
    title: string;
    description?: string;
    actions?: React.ReactNode;
    children: React.ReactNode;
}
export default function AppFrame({ title, description, actions, children }: AppFrameProps) {
    return (<div data-ui="components-common-app-frame.div-1" style={{ minHeight: '100vh', background: C.soft }}>
      <header data-ui="components-common-app-frame.header-1" style={{ position: 'sticky', top: 0, zIndex: 20, background: 'rgba(255,255,255,.94)', backdropFilter: 'blur(10px)', borderBottom: `1px solid ${C.g200}` }}>
        <div data-ui="components-common-app-frame.div-2" style={{ maxWidth: 1400, margin: '0 auto', padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18 }}>
          <div data-ui="components-common-app-frame.div-3" style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div data-ui="components-common-app-frame.div-4" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img data-ui="components-common-app-frame.img-1" src="/uploads/character.png" alt="산안비 검증" style={{ width: 34, height: 34, borderRadius: 10, objectFit: 'cover' }}/>
              <div data-ui="components-common-app-frame.div-5">
                <div data-ui="components-common-app-frame.div-6" style={{ fontSize: 13, fontWeight: 900, color: C.primary }}>산안비 검증</div>
                <div data-ui="components-common-app-frame.div-7" style={{ fontSize: 10, color: C.g400 }}>프로젝트 운영 대시보드</div>
              </div>
            </div>
            <nav data-ui="components-common-app-frame.nav-1" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {[
            { href: '/dashboard', label: '대시보드' },
            { href: '/projects', label: '프로젝트' },
        ].map((item) => (<Link key={item.href} href={item.href} style={{ padding: '9px 14px', borderRadius: 10, textDecoration: 'none', color: C.g600, fontSize: 13, fontWeight: 700 }}>
                  {item.label}
                </Link>))}
            </nav>
          </div>
          <div data-ui="components-common-app-frame.div-8" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {actions}
            <div data-ui="components-common-app-frame.div-9" style={{ textAlign: 'right' }}>
              <div data-ui="components-common-app-frame.div-10" style={{ fontSize: 12, fontWeight: 700, color: C.g800 }}>{CURRENT_USER.name}</div>
              <div data-ui="components-common-app-frame.div-11" style={{ fontSize: 11, color: C.g400 }}>{ROLE_LABELS[CURRENT_USER.role]}</div>
            </div>
          </div>
        </div>
      </header>
      <main data-ui="components-common-app-frame.main-1" style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 28px 40px' }}>
        <div data-ui="components-common-app-frame.div-12" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, marginBottom: 24 }}>
          <div data-ui="components-common-app-frame.div-13">
            <h1 data-ui="components-common-app-frame.h1-1" style={{ fontSize: 30, fontWeight: 900, color: C.g800, letterSpacing: '-0.04em', lineHeight: 1.1 }}>{title}</h1>
            {description && <p data-ui="components-common-app-frame.p-1" style={{ marginTop: 8, fontSize: 14, color: C.g400 }}>{description}</p>}
          </div>
        </div>
        {children}
      </main>
    </div>);
}
