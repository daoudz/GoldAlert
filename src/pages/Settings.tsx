import { installEvent, refreshCandles, refreshFx, settings, sources, status, updateSettings } from '../store.ts';
import { isIos, isStandalone } from '../notify.ts';
import { Card, Icon, Segmented } from '../components/ui.tsx';
import { CURRENCIES, KARATS, UNITS } from '../lib/units.ts';
import type { Karat, Unit } from '../lib/types.ts';
import { timeAgo } from '../lib/format.ts';

export function SettingsPage() {
  const st = settings.value;
  const ev = installEvent.value;
  const install = async () => {
    ev.prompt();
    await ev.userChoice;
    installEvent.value = null;
  };
  return (
    <div class="grid">
      <div class="col">
        <Card title="Display">
          <label class="field">
            <span>Currency</span>
            <select value={st.currency} onChange={(e) => updateSettings({ currency: (e.target as HTMLSelectElement).value })}>
              {CURRENCIES.map((c) => (
                <option value={c.code}>
                  {c.flag} {c.code} — {c.name}
                </option>
              ))}
            </select>
          </label>
          <div class="field">
            <span>Weight unit</span>
            <Segmented<Unit> value={st.unit} options={(Object.keys(UNITS) as Unit[]).map((u) => ({ value: u, label: UNITS[u].label }))} onChange={(u) => updateSettings({ unit: u })} />
          </div>
          <div class="field">
            <span>Gold purity (karat)</span>
            <Segmented<Karat> value={st.karat} options={KARATS.map((k) => ({ value: k.k, label: `${k.k}K` }))} onChange={(k) => updateSettings({ karat: k })} />
          </div>
          <div class="field">
            <span>Theme</span>
            <Segmented<'dark' | 'light'> value={st.theme} options={[{ value: 'dark', label: '🌙 Dark' }, { value: 'light', label: '☀️ Light' }]} onChange={(t) => updateSettings({ theme: t })} />
          </div>
          <label class="field">
            <span>Live price refresh</span>
            <select value={st.refreshSec} onChange={(e) => updateSettings({ refreshSec: Number((e.target as HTMLSelectElement).value) })}>
              <option value={15}>Every 15 seconds</option>
              <option value={30}>Every 30 seconds</option>
              <option value={60}>Every minute</option>
              <option value={300}>Every 5 minutes</option>
            </select>
          </label>
        </Card>

        <Card title="Install the app">
          {isStandalone() ? (
            <p>✅ GoldAlert is installed on this device.</p>
          ) : ev ? (
            <>
              <p>Install GoldAlert on your home screen for a full-screen app experience and better notifications.</p>
              <button class="btn btn-primary" onClick={install}><Icon name="download" size={18} /> Install app</button>
            </>
          ) : isIos() ? (
            <p>📱 Tap the <b>Share</b> button in Safari and choose <b>Add to Home Screen</b>.</p>
          ) : (
            <p>Use your browser menu and choose <b>Install app</b> or <b>Add to Home screen</b>.</p>
          )}
        </Card>
      </div>

      <div class="col">
        <Card title="Data" right={<button class="icon-btn" aria-label="Refresh" onClick={() => { refreshCandles(); refreshFx(); }}><Icon name="refresh" size={18} /></button>}>
          <div class="kv">
            <span>Live price</span><b>{sources.value.spot ?? '—'}</b>
            <span>Price history</span><b>{sources.value.candles ?? '—'}</b>
            <span>Exchange rates</span><b>{sources.value.fx ?? 'built-in'}</b>
            <span>Last update</span><b>{status.value.lastOk ? timeAgo(status.value.lastOk) : '—'}</b>
          </div>
          {status.value.error && <p class="small warn">⚠ {status.value.error}</p>}
          <p class="muted small">
            Live price is the international spot price (XAU). History comes from PAX Gold (PAXG), a token backed by physical gold that trades 24/7,
            adjusted to match spot. Local shop prices include extra fees and can differ slightly.
          </p>
        </Card>
        <Card title="About">
          <p class="small">
            GoldAlert shows live gold prices and gives simple buy / wait / sell guidance based on trends, momentum and a 7-day forecast.
          </p>
          <p class="muted small">© {new Date().getFullYear()} <b>90studio</b>. All rights reserved.</p>
          <p class="disclaimer">
            <Icon name="info" size={16} /> For information only — not financial advice. Past patterns do not guarantee future prices.
          </p>
        </Card>
      </div>
    </div>
  );
}
