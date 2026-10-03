import { useTranslation } from 'react-i18next';
import { formatNumber } from '@/lib/format';
import { chargeStateAt, type ChargeSeries } from './cabinetChart';

/** The charge counts as finished at this SOC, the same threshold as the "time to full" figure. */
const FULL_SOC = 0.98;

interface CabinetMockProps {
  title: string;
  slot: string;
  batteryId: string;
  series: ChargeSeries;
  tS: number;
  /** Whether the platform is allowed to cut this cabinet's charging current. */
  managed: boolean;
}

/** One slot of a swap-station cabinet: its little display, with the pack's temperature and the current it is given. */
export function CabinetMock({ title, slot, batteryId, series, tS, managed }: CabinetMockProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'vi';
  const n = (x: number, dp = 0) => formatNumber(x, lang, dp);
  const s = chargeStateAt(series, tS);

  // Status is a label and an icon-like glyph, not a colour alone.
  let status: { glyph: string; text: string; tone: string };
  if (!s) status = { glyph: '○', text: t('intervention.cabinet.status.idle'), tone: 'text-slate-400' };
  else if (s.over || s.soc >= FULL_SOC) status = { glyph: '■', text: t('intervention.cabinet.status.finished'), tone: 'text-sky-300' };
  else if (s.scale < 0.95) status = { glyph: '▼', text: t('intervention.cabinet.status.reduced', { percent: Math.round(s.scale * 100) }), tone: 'text-emerald-300' };
  else if (s.tempC >= 45) status = { glyph: '▲', text: t('intervention.cabinet.status.hot'), tone: 'text-amber-300' };
  else status = { glyph: '●', text: t('intervention.cabinet.status.charging'), tone: 'text-emerald-300' };

  return (
    <figure
      className={`rounded-xl border-2 p-3 ${managed ? 'border-accent/60' : 'border-border'} bg-slate-900 text-slate-100`}
      aria-label={title}
    >
      <figcaption className="flex items-baseline justify-between gap-2 text-xs text-slate-400">
        <span className="text-sm font-semibold text-slate-100">{title}</span>
        <span>
          {t('intervention.cabinet.slot', { slot })} · #{batteryId}
        </span>
      </figcaption>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-800 p-2">
          <p className="text-[11px] text-slate-400">{t('twin.readout.coreTemp')}</p>
          <p className="text-xl font-bold">{s ? `${n(s.tempC, 1)} °C` : '—'}</p>
        </div>
        <div className="rounded-lg bg-slate-800 p-2">
          <p className="text-[11px] text-slate-400">{t('intervention.cabinet.currentNow')}</p>
          <p className="text-xl font-bold">{s ? `${n(s.currentA, 1)} A` : '—'}</p>
        </div>
        <div className="rounded-lg bg-slate-800 p-2">
          <p className="text-[11px] text-slate-400">{t('twin.readout.soc')}</p>
          <p className="text-xl font-bold">{s ? `${n(s.soc * 100)} %` : '—'}</p>
        </div>
      </div>
      <p className={`mt-3 flex items-center gap-2 text-sm font-semibold ${status.tone}`} role="status">
        <span aria-hidden>{status.glyph}</span>
        {status.text}
      </p>
    </figure>
  );
}
