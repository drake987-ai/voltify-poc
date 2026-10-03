import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAsync } from '@/hooks/useAsync';
import { useDebounced } from '@/hooks/useDebounced';
import type { ABResult } from '@/eval/timeline';
import { AbView } from '@/pages/ab/AbView';
import { SandboxControls } from '@/pages/sandbox/SandboxControls';
import { DEFAULT_SANDBOX, sandboxSpec, type SandboxParams } from '@/pages/sandbox/scenario';
import { runABAsync } from '@/workers/client';

export default function SandboxPage() {
  const { t } = useTranslation();
  const [params, setParams] = useState<SandboxParams>(DEFAULT_SANDBOX);
  // A slider being dragged changes the value many times a second; the run starts once it settles.
  const settled = useDebounced(params, 350);
  const spec = sandboxSpec(settled);
  const key = JSON.stringify(spec);
  const state = useAsync(() => runABAsync(spec), key);
  const changing = settled !== params || state.status === 'loading';

  // The last finished run stays on screen, dimmed, while the next one is computed (no jump of the page).
  const [shown, setShown] = useState<{ key: string; ab: ABResult } | null>(null);
  useEffect(() => {
    if (state.status === 'ready') setShown({ key, ab: state.data });
  }, [state, key]);

  return (
    <>
      <PageHeader page="sandbox" dataSource={{ kind: 'simulated' }} />
      <div className="space-y-4">
        <SandboxControls params={params} onChange={setParams} />

        {changing ? (
          <p className="text-sm text-muted" aria-busy="true" role="status">
            {t('sandbox.running')}
          </p>
        ) : null}
        {state.status === 'error' ? (
          <Card className="text-sm text-risk-danger" role="alert">
            {t('state.error', { message: state.message })}
          </Card>
        ) : null}
        {shown ? (
          <div className={changing ? 'pointer-events-none space-y-4 opacity-50' : 'space-y-4'}>
            <AbView key={shown.key} ab={shown.ab} harshCase={false} />
            <Card>
              <h2 className="text-base font-semibold">{t('sandbox.notes.title')}</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted">
                <li>{t('sandbox.notes.same')}</li>
                <li>{t('sandbox.notes.short')}</li>
                <li>{t('sandbox.notes.limits')}</li>
              </ul>
            </Card>
          </div>
        ) : null}
      </div>
    </>
  );
}
