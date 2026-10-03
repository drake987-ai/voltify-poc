import { useTranslation } from 'react-i18next';
import { LangToggle } from '@/components/ui/LangToggle';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

export function Header() {
  const { t } = useTranslation();
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4">
      <p className="hidden min-w-0 truncate text-sm text-muted md:block">{t('app.tagline')}</p>
      <div className="ml-auto flex items-center gap-2">
        <LangToggle />
        <ThemeToggle />
      </div>
    </header>
  );
}
