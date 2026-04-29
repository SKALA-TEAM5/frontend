import type { ArchiveSeed } from '../types/domain';

const KEYS = {
  archiveSeed: (projectId: string) => `sl_archive_seed:${projectId}`,
  matchReady: (projectId: string) => `sl_match_ready:${projectId}`,
} as const;

const isBrowser = () => typeof window !== 'undefined';

export const workflowStorage = {
  getArchiveSeed(projectId: string): ArchiveSeed | null {
    if (!isBrowser()) return null;
    try {
      return JSON.parse(window.localStorage.getItem(KEYS.archiveSeed(projectId)) || 'null');
    } catch {
      return null;
    }
  },
  setArchiveSeed(projectId: string, seed: ArchiveSeed | null) {
    if (!isBrowser()) return;
    window.localStorage.setItem(KEYS.archiveSeed(projectId), JSON.stringify(seed));
  },
  getMatchReady(projectId: string): boolean {
    if (!isBrowser()) return false;
    return window.localStorage.getItem(KEYS.matchReady(projectId)) === 'true';
  },
  setMatchReady(projectId: string, value: boolean) {
    if (!isBrowser()) return;
    window.localStorage.setItem(KEYS.matchReady(projectId), String(value));
  },
};
