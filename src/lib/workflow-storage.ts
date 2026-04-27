import type { ArchiveSeed } from '../types/domain';

const KEYS = {
  archiveSeed: 'sl_archive_seed',
  matchReady: 'sl_match_ready',
} as const;

const isBrowser = () => typeof window !== 'undefined';

export const workflowStorage = {
  getArchiveSeed(): ArchiveSeed | null {
    if (!isBrowser()) return null;
    try {
      return JSON.parse(window.localStorage.getItem(KEYS.archiveSeed) || 'null');
    } catch {
      return null;
    }
  },
  setArchiveSeed(seed: ArchiveSeed | null) {
    if (!isBrowser()) return;
    window.localStorage.setItem(KEYS.archiveSeed, JSON.stringify(seed));
  },
  getMatchReady(): boolean {
    if (!isBrowser()) return false;
    return window.localStorage.getItem(KEYS.matchReady) === 'true';
  },
  setMatchReady(value: boolean) {
    if (!isBrowser()) return;
    window.localStorage.setItem(KEYS.matchReady, String(value));
  },
};
