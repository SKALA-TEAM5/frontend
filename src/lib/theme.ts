'use client';

import { useCallback, useEffect, useState } from 'react';

export type AppThemeId = 'green' | 'blue';

type ThemePalette = {
  label: string;
  primary: string;
  mid: string;
  light: string;
  bg: string;
  soft: string;
  white: string;
  g100: string;
  g200: string;
  g400: string;
  g600: string;
  g800: string;
  ok: string;
  primaryShadow: string;
};

export const APP_THEME_STORAGE_KEY = 'she.app.theme';

export const APP_THEMES: Record<AppThemeId, ThemePalette> = {
  green: {
    label: '초록',
    primary: '#1B5E3B',
    mid: '#2E7D52',
    light: '#4CAF78',
    bg: '#E8F5E9',
    soft: '#F0FAF3',
    white: '#FFFFFF',
    g100: '#F1F5F2',
    g200: '#c9e8d3',
    g400: '#6F8E78',
    g600: '#5A726A',
    g800: '#2A3B32',
    ok: '#2E7D52',
    primaryShadow: 'rgba(27,94,59,.16)',
  },
  blue: {
    label: '파랑',
    primary: '#1D4ED8',
    mid: '#2563EB',
    light: '#60A5FA',
    bg: '#EFF6FF',
    soft: '#F5F9FF',
    white: '#FFFFFF',
    g100: '#EEF4FF',
    g200: '#BFDBFE',
    g400: '#64748B',
    g600: '#475569',
    g800: '#172554',
    ok: '#2563EB',
    primaryShadow: 'rgba(29,78,216,.16)',
  },
};

export const C = {
  primary: 'var(--c-primary)',
  mid: 'var(--c-mid)',
  light: 'var(--c-light)',
  bg: 'var(--c-bg)',
  soft: 'var(--c-soft)',
  white: 'var(--c-white)',
  g100: 'var(--c-g100)',
  g200: 'var(--c-g200)',
  g400: 'var(--c-g400)',
  g600: 'var(--c-g600)',
  g800: 'var(--c-g800)',
  danger: '#E53935',
  dangerBg: '#FFF5F5',
  warn: '#F57C00',
  warnBg: '#FFF8F0',
  ok: 'var(--c-ok)',
  primaryShadow: 'var(--c-primary-shadow)',
};

const isThemeId = (value: string | null): value is AppThemeId => Boolean(value && value in APP_THEMES);

export const applyAppTheme = (themeId: AppThemeId) => {
  if (typeof document === 'undefined') return;
  const palette = APP_THEMES[themeId];
  const root = document.documentElement;
  root.dataset.theme = themeId;
  root.style.setProperty('--c-primary', palette.primary);
  root.style.setProperty('--c-mid', palette.mid);
  root.style.setProperty('--c-light', palette.light);
  root.style.setProperty('--c-bg', palette.bg);
  root.style.setProperty('--c-soft', palette.soft);
  root.style.setProperty('--c-white', palette.white);
  root.style.setProperty('--c-g100', palette.g100);
  root.style.setProperty('--c-g200', palette.g200);
  root.style.setProperty('--c-g400', palette.g400);
  root.style.setProperty('--c-g600', palette.g600);
  root.style.setProperty('--c-g800', palette.g800);
  root.style.setProperty('--c-ok', palette.ok);
  root.style.setProperty('--c-primary-shadow', palette.primaryShadow);
};

export const useAppTheme = () => {
  const [themeId, setThemeId] = useState<AppThemeId>('green');

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(APP_THEME_STORAGE_KEY);
    const nextTheme = isThemeId(storedTheme) ? storedTheme : 'green';
    setThemeId(nextTheme);
    applyAppTheme(nextTheme);
  }, []);

  const updateTheme = useCallback((nextTheme: AppThemeId) => {
    setThemeId(nextTheme);
    window.localStorage.setItem(APP_THEME_STORAGE_KEY, nextTheme);
    applyAppTheme(nextTheme);
  }, []);

  return { themeId, setThemeId: updateTheme };
};
