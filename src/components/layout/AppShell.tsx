import { Suspense, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation } from 'react-router-dom';
import { findRoute } from '@/app/routes';
import { Footer } from './Footer';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export function AppShell() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const routeId = findRoute(pathname)?.id;

  useEffect(() => {
    document.title = routeId ? `${t(`pages.${routeId}.title`)} · Voltify` : 'Voltify';
  }, [routeId, t]);

  return (
    <div className="flex h-full overflow-hidden bg-bg text-text">
      {/* A button (not an #anchor) because the app uses hash routing. */}
      <button
        type="button"
        onClick={() => mainRef.current?.focus()}
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-accent-fg"
      >
        {t('header.skipToContent')}
      </button>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main ref={mainRef} tabIndex={-1} className="flex-1 overflow-y-auto p-4 outline-none lg:p-6">
          <Suspense fallback={<p className="text-sm text-muted">{t('state.loadingPage')}</p>}>
            <Outlet />
          </Suspense>
        </main>
        <Footer />
      </div>
    </div>
  );
}
