import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '@/store/uiStore';

export function ThemeToggle() {
  const { t } = useTranslation();
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const label = theme === 'dark' ? t('header.themeToLight') : t('header.themeToDark');
  const Icon = theme === 'dark' ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted transition-colors hover:text-text"
    >
      <Icon aria-hidden className="size-4" />
    </button>
  );
}
