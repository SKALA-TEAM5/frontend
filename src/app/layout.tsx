import type { Metadata } from 'next';
import '../styles.css';
export const metadata: Metadata = {
    title: 'i-veri',
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
