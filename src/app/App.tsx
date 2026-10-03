import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import NotFoundPage from '@/pages/NotFoundPage';
import { useUiStore } from '@/store/uiStore';
import { allPaths, ROUTES } from './routes';

export default function App() {
  const theme = useUiStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/fleet" replace />} />
          {ROUTES.flatMap((route) =>
            allPaths(route).map((path) => <Route key={path} path={path} element={route.element} />),
          )}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
