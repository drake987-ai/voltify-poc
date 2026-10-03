import { PanelLeftClose, PanelLeftOpen, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { NAV_GROUPS, ROUTES } from '@/app/routes';
import { useUiStore } from '@/store/uiStore';

export function Sidebar() {
  const { t } = useTranslation();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  // Below the lg breakpoint (tablet) the sidebar is always icon-only; on lg+ the
  // user can collapse it manually. Labels stay in the DOM (sr-only) so every
  // link keeps its accessible name.
  const labelClass = collapsed ? 'sr-only' : 'sr-only lg:not-sr-only';

  return (
    <aside
      className={`flex w-16 shrink-0 flex-col border-r border-border bg-surface transition-[width] ${
        collapsed ? '' : 'lg:w-64'
      }`}
    >
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <Zap aria-hidden className="size-6 shrink-0 text-accent" />
        <span className={`${labelClass} text-lg font-semibold tracking-tight`}>{t('app.name')}</span>
      </div>

      <nav aria-label={t('nav.label')} className="flex-1 space-y-4 overflow-y-auto p-2">
        {NAV_GROUPS.map((group) => (
          <div key={group}>
            <p
              className={`px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted ${
                collapsed ? 'hidden' : 'hidden lg:block'
              }`}
            >
              {t(`nav.groups.${group}`)}
            </p>
            <ul className="space-y-0.5">
              {ROUTES.filter((route) => route.group === group).map((route) => {
                const Icon = route.icon;
                const label = t(`nav.items.${route.id}`);
                return (
                  <li key={route.id}>
                    <NavLink
                      to={route.path}
                      title={label}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-accent/15 text-accent'
                            : 'text-muted hover:bg-surface-2 hover:text-text'
                        }`
                      }
                    >
                      <Icon aria-hidden className="size-5 shrink-0" />
                      <span className={labelClass}>{label}</span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="hidden border-t border-border p-2 lg:block">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={t('header.toggleSidebar')}
          title={t('header.toggleSidebar')}
          className="flex w-full items-center justify-center rounded-lg px-3 py-2 text-muted transition-colors hover:bg-surface-2 hover:text-text"
        >
          {collapsed ? (
            <PanelLeftOpen aria-hidden className="size-5" />
          ) : (
            <PanelLeftClose aria-hidden className="size-5" />
          )}
        </button>
      </div>
    </aside>
  );
}
