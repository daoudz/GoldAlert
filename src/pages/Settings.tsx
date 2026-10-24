import { installEvent, refreshCandles, refreshFx, settings, sources, status, t, updateSettings } from '../store.ts';
import { isIos, isStandalone } from '../notify.ts';
import { Card, Icon, Segmented } from '../components/ui.tsx';
import { CURRENCIES, KARATS, UNITS } from '../lib/units.ts';
import { currencyName, LANGUAGES, UNIT_TEXT } from '../lib/i18n.ts';
import type { Karat, Lang, Unit } from '../lib/types.ts';
import { timeAgo } from '../lib/format.ts';

export function SettingsPage() {
  const st = settings.value;
  const ev = installEvent.value;
  const ut = UNIT_TEXT[st.lang] ?? UNIT_TEXT.en;
  const install = async () => {
    ev.prompt();
    await ev.userChoice;
    installEvent.value = null;
  };
  return (
    <div class="grid">
      <div class="col">
        <Card title={t('settings.display')}>
          <div class="field">
            <span>{t('settings.language')}</span>
            <Segmented<Lang>
              value={st.lang}
              options={LANGUAGES.map((l) => ({ value: l.code, label: `${l.flag} ${l.native}` }))}
              onChange={(lang) => updateSettings({ lang })}
            />
          </div>
          <label class="field">
            <span>{t('settings.currency')}</span>
            <select value={st.currency} onChange={(e) => updateSettings({ currency: (e.target as HTMLSelectElement).value })}>
              {CURRENCIES.map((c) => (
                <option value={c.code}>
                  {c.flag} {c.code} — {currencyName(c.code, c.name, st.lang)}
                </option>
              ))}
            </select>
          </label>
          <div class="field">
            <span>{t('settings.unit')}</span>
            <Segmented<Unit> value={st.unit} options={(Object.keys(UNITS) as Unit[]).map((u) => ({ value: u, label: ut[u].label }))} onChange={(u) => updateSettings({ unit: u })} />
          </div>
          <div class="field">
            <span>{t('settings.karat')}</span>
            <Segmented<Karat> value={st.karat} options={KARATS.map((k) => ({ value: k.k, label: `${k.k}K` }))} onChange={(k) => updateSettings({ karat: k })} />
          </div>
          <div class="field">
            <span>{t('settings.theme')}</span>
            <Segmented<'dark' | 'light'> value={st.theme} options={[{ value: 'dark', label: t('settings.dark') }, { value: 'light', label: t('settings.light') }]} onChange={(th) => updateSettings({ theme: th })} />
          </div>
          <label class="field">
            <span>{t('settings.refresh')}</span>
            <select value={st.refreshSec} onChange={(e) => updateSettings({ refreshSec: Number((e.target as HTMLSelectElement).value) })}>
              <option value={15}>{t('settings.every15s')}</option>
              <option value={30}>{t('settings.every30s')}</option>
              <option value={60}>{t('settings.every1m')}</option>
              <option value={300}>{t('settings.every5m')}</option>
            </select>
          </label>
        </Card>

        <Card title={t('settings.installTitle')}>
          {isStandalone() ? (
            <p>{t('settings.installed')}</p>
          ) : ev ? (
            <>
              <p>{t('settings.installDesc')}</p>
              <button class="btn btn-primary" onClick={install}><Icon name="download" size={18} /> {t('settings.installBtn')}</button>
            </>
          ) : isIos() ? (
            <p>{t('settings.installIos')}</p>
          ) : (
            <p>{t('settings.installBrowser')}</p>
          )}
        </Card>
      </div>

      <div class="col">
        <Card title={t('settings.dataTitle')} right={<button class="icon-btn" aria-label={t('settings.refreshAria')} onClick={() => { refreshCandles(); refreshFx(); }}><Icon name="refresh" size={18} /></button>}>
          <div class="kv">
            <span>{t('settings.livePrice')}</span><b>{sources.value.spot ?? '—'}</b>
            <span>{t('settings.priceHistory')}</span><b>{sources.value.candles ?? '—'}</b>
            <span>{t('settings.fxRates')}</span><b>{sources.value.fx ?? t('settings.builtIn')}</b>
            <span>{t('settings.lastUpdate')}</span><b>{status.value.lastOk ? timeAgo(status.value.lastOk, Date.now(), st.lang) : '—'}</b>
          </div>
          {status.value.error && <p class="small warn">⚠ {status.value.error}</p>}
          <p class="muted small">{t('settings.dataNote')}</p>
        </Card>
        <Card title={t('settings.aboutTitle')}>
          <p class="small">{t('settings.aboutDesc')}</p>
          <p class="muted small">© {new Date().getFullYear()} <b>90studio</b>. {t('settings.rights')}</p>
          <p class="disclaimer">
            <Icon name="info" size={16} /> <span>{t('settings.aboutDisclaimer')}</span>
          </p>
        </Card>
      </div>
    </div>
  );
}
