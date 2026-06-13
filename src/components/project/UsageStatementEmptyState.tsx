import type { ReactNode } from 'react';
import { C } from '../../lib/theme';

interface UsageStatementEmptyStateProps {
  title: string;
  children?: ReactNode;
  minHeight?: number;
  cardWidth?: number;
  titleMarginBottom?: number;
}

export default function UsageStatementEmptyState({
  title,
  children,
  minHeight = 360,
  cardWidth = 420,
  titleMarginBottom = 9,
}: UsageStatementEmptyStateProps) {
  return (
    <div style={{ minHeight, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: `min(100%, ${cardWidth}px)`, border: `1px solid ${C.g200}`, borderRadius: 12, background: C.white, padding: '34px 28px', textAlign: 'center', boxShadow: '0 10px 24px rgba(31,47,39,.05)' }}>
        <div style={{ fontSize: 19, fontWeight: 800, color: C.g800, marginBottom: titleMarginBottom }}>{title}</div>
        {children}
      </div>
    </div>
  );
}
