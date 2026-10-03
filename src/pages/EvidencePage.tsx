import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import type { SuiteResult } from '@/eval/evidence';
import { EvidenceView } from '@/pages/evidence/EvidenceView';
import { runEvidenceAsync } from '@/workers/client';

type State =
  | { status: 'running'; done: number; total: number }
  | { status: 'ready'; results: SuiteResult[] }
  | { status: 'error'; message: string };

export default function EvidencePage() {
  const { t } = useTranslation();
  const [state, setState] = useState<State>({ status: 'running', done: 0, total: 0 });

  useEffect(() => {
    let cancelled = false;
    runEvidenceAsync((done, total) => {
      if (!cancelled) setState((s) => (s.status === 'ready' ? s : { status: 'running', done, total }));
    }).then(
      (results) => !cancelled && setState({ status: 'ready', results }),
      (e: unknown) => !cancelled && setState({ status: 'error', message: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <PageHeader page="evidence" dataSource={{ kind: 'simulated' }} />
      <Card className="mb-4 border-accent/40">
        <p className="text-sm leading-relaxed">{t('evidence.banner')}</p>
      </Card>
      {state.status === 'running' ? (
        <Card aria-busy="true" role="status">
          <p className="text-sm text-muted">{t('evidence.running', { done: state.done, total: state.total })}</p>
          <progress className="mt-2 h-2 w-full accent-[var(--c-accent)]" value={state.done} max={Math.max(1, state.total)} />
        </Card>
      ) : state.status === 'error' ? (
        <Card className="text-sm text-risk-danger" role="alert">
          {t('state.error', { message: state.message })}
        </Card>
      ) : (
        <EvidenceView results={state.results} />
      )}
    </>
  );
}
