'use client';

import { FormEvent, KeyboardEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { C } from '../lib/theme';
import { useCurrentUser } from '../lib/dev-user';
import { login, toAppRole } from '../lib/auth-api';

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 46,
  border: `1px solid ${C.g200}`,
  borderRadius: 12,
  padding: '0 14px',
  background: C.white,
  color: C.g800,
  fontFamily: 'inherit',
  fontSize: 15,
  fontWeight: 800,
  outline: 'none',
};

export default function LoginPage() {
  const router = useRouter();
  const { setCurrentRole } = useCurrentUser();
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const result = await login(employeeNumber.trim(), password);
      const role = toAppRole(result.user.roleCode);
      setError('');
      setCurrentRole(role, {
        id: String(result.user.id),
        name: result.user.realName,
      });
      router.replace(role === 'she_manager' ? '/dashboard' : '/projects');
    } catch (error) {
      setError(error instanceof Error ? error.message : '사번 또는 비밀번호를 확인해 주세요.');
      return;
    }
  };

  const submitLoginOnEnter = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    const target = event.target as HTMLElement;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') return;
    event.preventDefault();
    event.currentTarget.requestSubmit();
  };

  return (
    <main data-ui="login.1" style={{ minHeight: '100vh', background: C.soft, display: 'grid', placeItems: 'center', padding: 24 }}>
      <Card style={{ width: 'min(420px, 100%)', padding: '34px 32px' }}>
        <div data-ui="login.2" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <img src="/uploads/character.png" alt="veri" style={{ width: 42, height: 42, borderRadius: 13, objectFit: 'cover', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: C.primary, lineHeight: 1.2 }}>i-veri</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.g400, marginTop: 3 }}>로그인</div>
          </div>
        </div>

        <form data-ui="login.3" onSubmit={submitLogin} onKeyDown={submitLoginOnEnter} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input
            aria-label="사번"
            value={employeeNumber}
            onChange={(event) => setEmployeeNumber(event.target.value)}
            placeholder="사번"
            autoComplete="username"
            style={inputStyle}
          />
          <input
            aria-label="비밀번호"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="비밀번호"
            type="password"
            autoComplete="current-password"
            style={inputStyle}
          />
          {error && <div data-ui="login.4" style={{ fontSize: 13, color: C.danger, fontWeight: 800 }}>{error}</div>}
          <Button type="submit" style={{ width: '100%', height: 46, marginTop: 4 }}>
            로그인
          </Button>
        </form>

        <div data-ui="login.5" style={{ marginTop: 18, padding: '12px 14px', borderRadius: 12, background: C.g100, color: C.g600, fontSize: 12, fontWeight: 800, lineHeight: 1.55 }}>
          백엔드 등록 계정의 사번과 비밀번호로 로그인해 주세요.
        </div>
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Link href="/signup" style={{ fontSize: 14, fontWeight: 900, color: C.primary, textDecoration: 'none' }}>
            회원가입
          </Link>
        </div>
      </Card>
    </main>
  );
}
