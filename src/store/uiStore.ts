import { create } from 'zustand';
import { safeStorage, STORAGE_KEYS } from '@/lib/safeStorage';

export type Theme = 'dark' | 'light';

interface UiState {
  theme: Theme;
  sidebarCollapsed: boolean;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  toggleSidebar: () => void;
}

function readTheme(): Theme {
  return safeStorage.get(STORAGE_KEYS.theme) === 'light' ? 'light' : 'dark';
}

// Language lives in i18next (single source of truth), not here.
export const useUiStore = create<UiState>((set, get) => ({
  theme: readTheme(),
  sidebarCollapsed: safeStorage.get(STORAGE_KEYS.sidebarCollapsed) === '1',
  setTheme: (theme) => {
    safeStorage.set(STORAGE_KEYS.theme, theme);
    // Apply to the page synchronously so anything that reads CSS variables while re-rendering
    // (the charts) already sees the new palette.
    if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', theme);
    set({ theme });
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
  toggleSidebar: () => {
    const next = !get().sidebarCollapsed;
    safeStorage.set(STORAGE_KEYS.sidebarCollapsed, next ? '1' : '0');
    set({ sidebarCollapsed: next });
  },
}));
