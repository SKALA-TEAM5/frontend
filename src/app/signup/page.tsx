'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { C } from '../../lib/theme';
import { type DevUserRole } from '../../lib/dev-user';

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

export default function SignupPage() {
  const router = useRouter();
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<DevUserRole>('project_manager');
  const [error, setError] = useState('');

  const submitSignup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!employeeNumber.trim() || !name.trim() || !password.trim()) {
      setError('사번, 이름, 비밀번호를 모두 입력해 주세요.');
      return;
    }
    setError('');
    router.replace('/');
  };

  return (
    <main data-ui="signup.1" style={{ minHeight: '100vh', background: C.soft, display: 'grid', placeItems: 'center', padding: 24 }}>
      <Card style={{ width: 'min(440px, 100%)', padding: '34px 32px' }}>
        <div data-ui="signup.2" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <img src="/uploads/character.png" alt="산안비 검증" style={{ width: 42, height: 42, borderRadius: 13, objectFit: 'cover', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: C.primary, lineHeight: 1.2 }}>산안비 검증</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.g400, marginTop: 3 }}>회원가입</div>
          </div>
        </div>

        <form data-ui="signup.3" onSubmit={submitSignup} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input aria-label="사번" value={employeeNumber} onChange={(event) => setEmployeeNumber(event.target.value)} placeholder="사번" autoComplete="username" style={inputStyle} />
          <input aria-label="이름" value={name} onChange={(event) => setName(event.target.value)} placeholder="이름" autoComplete="name" style={inputStyle} />
          <input aria-label="비밀번호" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="비밀번호" type="password" autoComplete="new-password" style={inputStyle} />
          <select aria-label="권한" value={role} onChange={(event) => setRole(event.target.value as DevUserRole)} style={inputStyle}>
            <option value="project_manager">프로젝트 담당자</option>
            <option value="she_manager">SHE 담당자</option>
          </select>
          {error && <div data-ui="signup.4" style={{ fontSize: 13, color: C.danger, fontWeight: 800 }}>{error}</div>}
          <Button type="submit" style={{ width: '100%', height: 46, marginTop: 4 }}>
            가입하기
          </Button>
        </form>

        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Link href="/" style={{ fontSize: 14, fontWeight: 900, color: C.primary, textDecoration: 'none' }}>
            로그인으로 돌아가기
          </Link>
        </div>
      </Card>
    </main>
  );
}
