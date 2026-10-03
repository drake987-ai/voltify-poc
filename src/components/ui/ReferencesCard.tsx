import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { REFERENCE_IDS, REFERENCE_URLS } from '@/lib/references';
import { Card } from './Card';

/** The cited sources, each with what it supports in this PoC and what is deliberately not taken from it. */
export function ReferencesCard() {
  const { t } = useTranslation();
  return (
    <Card>
      <h2 className="text-base font-semibold">{t('references.title')}</h2>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{t('references.intro')}</p>
      <ul className="mt-3 space-y-3">
        {REFERENCE_IDS.map((id) => (
          <li key={id} className="rounded-lg border border-border bg-surface-2 p-3">
            <a
              href={REFERENCE_URLS[id]}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-start gap-1.5 text-sm font-semibold text-accent underline"
            >
              {t(`references.items.${id}.title`)}
              <ExternalLink aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              <span className="sr-only">{t('references.newTab')}</span>
            </a>
            <p className="mt-1 text-xs text-muted">{t(`references.items.${id}.source`)}</p>
            <p className="mt-2 text-sm leading-snug">
              <span className="font-semibold">{t('references.use')}: </span>
              {t(`references.items.${id}.use`)}
            </p>
            <p className="mt-1 text-sm leading-snug text-muted">
              <span className="font-semibold text-text">{t('references.caution')}: </span>
              {t(`references.items.${id}.caution`)}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
