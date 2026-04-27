import type { Metadata } from 'next';
import '../styles.css';
export const metadata: Metadata = {
    title: '산업안전관리비 증빙 검증 시스템',
    icons: {
        icon: '/uploads/character.ico',
    },
};
export default function RootLayout({ children, }: Readonly<{
    children: React.ReactNode;
}>) {
    return (<html lang="ko">
      <body>{children}</body>
    </html>);
}
