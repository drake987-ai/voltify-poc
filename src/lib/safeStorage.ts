// localStorage can throw or be empty (private mode, blocked site data), so every
// access is wrapped and the app must render correctly without it.
export const safeStorage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* storage unavailable: preference simply is not remembered */
    }
  },
};

export const STORAGE_KEYS = {
  theme: 'voltify.theme',
  lang: 'voltify.lang',
  sidebarCollapsed: 'voltify.sidebarCollapsed',
} as const;
