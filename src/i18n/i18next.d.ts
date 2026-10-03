import 'i18next';
import type vi from './vi.json';

// Typed keys: a typo in t('...') fails the build instead of showing a raw key.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof vi };
  }
}
