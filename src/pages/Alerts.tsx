import { useState } from 'preact/hooks';
import { money, settings, spot, toDisplay, updateNotify, updateSettings, unitLabel, rates } from '../store.ts';
import { alertState, clearHistory, history, isIos, isStandalone, permission, rearmTarget, requestPermission, sendNtfy, testNotification } from '../notify.ts';
import { Card, Icon, Segmented, Toggle } from '../components/ui.tsx';
import { addTarget } from './Advice.tsx';
import { formatMoney, timeAgo } from '../lib/format.ts';
import { UNITS } from '../lib/units.ts';
import { priceIn } from '../lib/alerts.ts';

function PermissionCard() {
  const p = permission.value;
  const n = settings.value.notify;
  const enable = async () => {
    const ok = await requestPermission();
    updateNotify({ enabled: ok });
  };
  return (
    <Card title="Notifications">
      {p === 'unsupported' ? (
        <p>
          {isIos() && !isStandalone()
            ? '📱 On iPhone/iPad: tap the Share button, choose "Add to Home Screen", then open GoldAlert from your home screen to enable notifications.'
            : 'This browser does not support notifications. Alerts will still show inside the app.'}
        </p>
      ) : p === 'denied' ? (
        <p>🚫 Notifications are blocked. Allow them for this site in your browser settings, then reload.</p>
      ) : p === 'granted' ? (
        <>
          <Toggle label="Send me notifications" checked={n.enabled} onChange={(v) => updateNotify({ enabled: v })} />
          <button class="btn btn-ghost" onClick={testNotification}>Send a test notification</button>
        </>
      ) : (
        <>
          <p>Get notified about big price moves, good times to buy or sell, and your price targets.</p>
          <button class="btn btn-primary" onClick={enable}>
            <Icon name="bell" size={18} /> Turn on notifications
          </button>
        </>
      )}
      <p class="muted small">
        Notifications work while the app is open or in the background. For alerts when your phone is locked and the app is closed, set up free phone push below.
      </p>
    </Card>
  );
}

function RulesCard() {
  const n = settings.value.notify;
  return (
    <Card title="What should I be alerted about?">
      <Toggle label="Buy / sell advice changes" checked={n.signals} onChange={(v) => updateNotify({ signals: v })} />
      <div class="slider">
        <div class="slider-head">
          <span>Big price moves</span>
          <b>{n.bigMovePct > 0 ? `≥ ${n.bigMovePct}% in a day` : 'Off'}</b>
        </div>
        <input type="range" min="0" max="5" step="0.25" value={n.bigMovePct} onInput={(e) => updateNotify({ bigMovePct: parseFloat((e.target as HTMLInputElement).value) })} />
        <div class="muted small">Gold usually moves less than 1% a day. 1–2% is a big move.</div>
      </div>
    </Card>
  );
}

function TargetsCard() {
  const st = settings.value;
  const s = spot.value;
  const current = s ? toDisplay(s.price) : 0;
  const [dir, setDir] = useState<'below' | 'above'>('below');
  const [value, setValue] = useState('');
  const fired = alertState.value.firedTargets ?? [];
  const add = () => {
    const v = parseFloat(value);
    if (!v || v <= 0) return;
    addTarget(dir, v);
    setValue('');
  };
  return (
    <Card title="Price alerts">
      <p class="muted small">Current: {s ? money(current) : '—'} · {unitLabel()}</p>
      <div class="target-form">
        <Segmented<'below' | 'above'> small value={dir} options={[{ value: 'below', label: 'Drops below' }, { value: 'above', label: 'Rises above' }]} onChange={setDir} />
        <input type="number" inputMode="decimal" placeholder={s ? current.toFixed(2) : 'Price'} value={value} onInput={(e) => setValue((e.target as HTMLInputElement).value)} />
        <button class="btn btn-primary" onClick={add} aria-label="Add alert"><Icon name="plus" size={18} /> Add</button>
      </div>
      {st.notify.targets.length === 0 ? (
        <div class="empty small">No price alerts yet. Tip: the Advice tab suggests good buy/sell prices.</div>
      ) : (
        <ul class="targets">
          {st.notify.targets.map((t) => {
            const now = s ? priceIn(s.price, rates.value, t) : null;
            const hit = fired.includes(t.id);
            return (
              <li class={hit ? 'hit' : ''}>
                <span class={`dir ${t.direction}`}>{t.direction === 'below' ? '▼' : '▲'}</span>
                <div>
                  <b>{t.direction === 'below' ? 'Below' : 'Above'} {formatMoney(t.price, t.currency)}</b>
                  <div class="muted small">
                    {t.karat}K per {UNITS[t.unit].label.toLowerCase()} · now {now != null ? formatMoney(now, t.currency) : '—'}
                    {hit && ' · ✅ reached'}
                  </div>
                </div>
                {hit && <button class="btn btn-sm btn-ghost" onClick={() => rearmTarget(t.id)}>Re-arm</button>}
                <button class="icon-btn" aria-label="Delete" onClick={() => updateNotify({ targets: st.notify.targets.filter((x) => x.id !== t.id) })}>
                  <Icon name="trash" size={18} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function PushCard() {
  const st = settings.value;
  const [msg, setMsg] = useState('');
  const gen = () => updateSettings({ ntfyTopic: `goldalert-${Math.random().toString(36).slice(2, 12)}` });
  const test = async () => {
    setMsg('Sending…');
    const s = spot.value;
    const ok = await sendNtfy(st.ntfyTopic, '🔔 GoldAlert test', s ? `Gold is ${money(toDisplay(s.price))} (${unitLabel()}). Push works!` : 'Push works!');
    setMsg(ok ? '✅ Sent! Check your phone.' : '⚠ Could not send. Check the topic name.');
  };
  return (
    <Card title="📲 Phone push (even when the app is closed)">
      <p class="small">
        Uses the free <a href="https://ntfy.sh" target="_blank" rel="noopener">ntfy</a> app plus a scheduled GitHub Action that checks gold every 30 minutes — no server or account needed.
      </p>
      <ol class="steps small">
        <li>Install the <b>ntfy</b> app (<a href="https://play.google.com/store/apps/details?id=io.heckel.ntfy" target="_blank" rel="noopener">Android</a> / <a href="https://apps.apple.com/app/ntfy/id1625396347" target="_blank" rel="noopener">iPhone</a>).</li>
        <li>
          Pick a secret topic name:
          <div class="target-form">
            <input type="text" placeholder="e.g. goldalert-x7k2p9" value={st.ntfyTopic} onInput={(e) => updateSettings({ ntfyTopic: (e.target as HTMLInputElement).value.trim() })} />
            <button class="btn btn-ghost" onClick={gen}>Generate</button>
          </div>
        </li>
        <li>In the ntfy app tap <b>+</b> and subscribe to that topic{st.ntfyTopic && <> (or <a href={`https://ntfy.sh/${st.ntfyTopic}`} target="_blank" rel="noopener">open it on the web</a>)</>}.</li>
        <li>In your GitHub repo: <b>Settings → Secrets and variables → Actions</b> → add secret <code>NTFY_TOPIC</code> with the same name. Optional variables: <code>ALERT_CURRENCY</code> ({st.currency}), <code>ALERT_UNIT</code> ({st.unit}), <code>ALERT_KARAT</code> ({st.karat}), <code>BIG_MOVE_PCT</code> ({st.notify.bigMovePct || 1}).</li>
      </ol>
      <button class="btn btn-primary" disabled={!st.ntfyTopic} onClick={test}>Send test push</button>
      {msg && <p class="small">{msg}</p>}
    </Card>
  );
}

function HistoryCard() {
  const h = history.value;
  return (
    <Card title="Recent alerts" right={h.length > 0 && <button class="link" onClick={clearHistory}>Clear</button>}>
      {h.length === 0 ? (
        <div class="empty small">No alerts yet.</div>
      ) : (
        <ul class="history">
          {h.slice(0, 20).map((x) => (
            <li>
              <b>{x.title}</b>
              <p class="small">{x.body}</p>
              <span class="muted small">{timeAgo(x.time)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function Alerts() {
  return (
    <div class="grid">
      <div class="col">
        <PermissionCard />
        <RulesCard />
        <TargetsCard />
      </div>
      <div class="col">
        <PushCard />
        <HistoryCard />
      </div>
    </div>
  );
}
