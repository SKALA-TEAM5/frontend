'use client';

import { useCallback, useEffect, useState } from 'react';

export type AppThemeId = 'default' | 'sky' | 'lavender' | 'mint';

type ThemePalette = {
  label: string;
  gradient: string;
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
  default: {
    label: 'Default',
    gradient: 'linear-gradient(135deg, #8EE7B5 0%, #145A3B 100%)',
    primary: '#145A3B',
    mid: '#247257',
    light: '#7DB49A',
    bg: '#EEF6F2',
    soft: '#FCFDFD',
    white: '#FFFFFF',
    g100: '#EEF2F0',
    g200: '#D5DDD8',
    g400: '#7A8A81',
    g600: '#52635A',
    g800: '#1F2F27',
    ok: '#247257',
    primaryShadow: 'rgba(20,90,59,.13)',
  },
  sky: {
    label: 'Sky',
    gradient: 'linear-gradient(135deg, #65E2D1 0%, #2F7DDE 100%)',
    primary: '#2472B8',
    mid: '#2E91C8',
    light: '#8ECBE6',
    bg: '#EEF8FC',
    soft: '#FCFEFF',
    white: '#FFFFFF',
    g100: '#EDF5F8',
    g200: '#D4E7EF',
    g400: '#6D8996',
    g600: '#4C6570',
    g800: '#1E3440',
    ok: '#2472B8',
    primaryShadow: 'rgba(36,114,184,.14)',
  },
  lavender: {
    label: 'Lavender',
    gradient: 'linear-gradient(135deg, #F06AE9 0%, #7C2DFF 100%)',
    primary: '#7054D8',
    mid: '#8B6BEA',
    light: '#C2B4F6',
    bg: '#F6F3FF',
    soft: '#FEFCFF',
    white: '#FFFFFF',
    g100: '#F0EDF8',
    g200: '#DED7EF',
    g400: '#7B728E',
    g600: '#5C536E',
    g800: '#2F2940',
    ok: '#7054D8',
    primaryShadow: 'rgba(112,84,216,.14)',
  },
  mint: {
    label: 'Mint',
    gradient: 'linear-gradient(135deg, #66E7C1 0%, #1FAF89 100%)',
    primary: '#168767',
    mid: '#22A47F',
    light: '#8ADCC4',
    bg: '#EFFAF6',
    soft: '#FCFEFD',
    white: '#FFFFFF',
    g100: '#EEF6F2',
    g200: '#D5E9DF',
    g400: '#728B80',
    g600: '#506A5E',
    g800: '#1D342B',
    ok: '#168767',
    primaryShadow: 'rgba(22,135,103,.14)',
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
  danger: '#C2413F',
  dangerBg: '#FFF6F5',
  warn: '#B7791F',
  warnBg: '#FFF9EA',
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
  const [themeId, setThemeId] = useState<AppThemeId>('default');

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(APP_THEME_STORAGE_KEY);
    const nextTheme = isThemeId(storedTheme) ? storedTheme : 'default';
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
