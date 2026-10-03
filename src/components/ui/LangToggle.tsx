import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGS } from '@/i18n';

export function LangToggle() {
  const { t, i18n } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t('header.language')}
      className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5 text-xs font-semibold"
    >
      {SUPPORTED_LANGS.map((lang) => {
        const active = i18n.resolvedLanguage === lang;
        return (
          <button
            key={lang}
            type="button"
            aria-pressed={active}
            onClick={() => void i18n.changeLanguage(lang)}
            className={`rounded-md px-2.5 py-1 transition-colors ${
              active ? 'bg-accent text-accent-fg' : 'text-muted hover:text-text'
            }`}
          >
            {lang.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
