import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { safeStorage, STORAGE_KEYS } from '@/lib/safeStorage';
import vi from './vi.json';
import en from './en.json';

export const SUPPORTED_LANGS = ['vi', 'en'] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

function initialLang(): Lang {
  const saved = safeStorage.get(STORAGE_KEYS.lang);
  return saved === 'en' ? 'en' : 'vi';
}

// Resources are bundled (not fetched) so the demo works offline.
void i18n.use(initReactI18next).init({
  resources: { vi: { translation: vi }, en: { translation: en } },
  lng: initialLang(),
  fallbackLng: 'vi',
  interpolation: { escapeValue: false },
  saveMissing: import.meta.env.DEV,
  missingKeyHandler: (languages, _namespace, key) => {
    console.error(`[i18n] missing key "${key}" for ${languages.join(', ')}`);
  },
});

i18n.on('languageChanged', (lng) => {
  safeStorage.set(STORAGE_KEYS.lang, lng);
  document.documentElement.setAttribute('lang', lng);
});

export default i18n;
