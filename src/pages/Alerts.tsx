import { useState } from 'preact/hooks';
import { money, settings, spot, t, toDisplay, updateNotify, updateSettings, unitLabel, rates } from '../store.ts';
import { alertState, clearHistory, history, isIos, isStandalone, permission, rearmTarget, requestPermission, sendNtfy, testNotification } from '../notify.ts';
import { Card, Icon, Segmented, Toggle } from '../components/ui.tsx';
import { addTarget } from './Advice.tsx';
import { formatMoney, timeAgo } from '../lib/format.ts';
import { UNIT_TEXT } from '../lib/i18n.ts';
import { priceIn } from '../lib/alerts.ts';

function PermissionCard() {
  const p = permission.value;
  const n = settings.value.notify;
  const enable = async () => {
    const ok = await requestPermission();
    updateNotify({ enabled: ok });
  };
  return (
    <Card title={t('alerts.notifications')}>
      {p === 'unsupported' ? (
        <p>{isIos() && !isStandalone() ? t('alerts.iosHint') : t('alerts.unsupported')}</p>
      ) : p === 'denied' ? (
        <p>{t('alerts.denied')}</p>
      ) : p === 'granted' ? (
        <>
          <Toggle label={t('alerts.sendMe')} checked={n.enabled} onChange={(v) => updateNotify({ enabled: v })} />
          <button class="btn btn-ghost" onClick={testNotification}>{t('alerts.testBtn')}</button>
        </>
      ) : (
        <>
          <p>{t('alerts.intro')}</p>
          <button class="btn btn-primary" onClick={enable}>
            <Icon name="bell" size={18} /> {t('alerts.turnOn')}
          </button>
        </>
      )}
      <p class="muted small">{t('alerts.bgNote')}</p>
    </Card>
  );
}

function RulesCard() {
  const n = settings.value.notify;
  return (
    <Card title={t('alerts.rulesTitle')}>
      <Toggle label={t('alerts.signalsToggle')} checked={n.signals} onChange={(v) => updateNotify({ signals: v })} />
      <div class="slider">
        <div class="slider-head">
          <span>{t('alerts.bigMoves')}</span>
          <b>{n.bigMovePct > 0 ? t('alerts.bigMoveVal', { pct: n.bigMovePct }) : t('alerts.off')}</b>
        </div>
        <input type="range" min="0" max="5" step="0.25" value={n.bigMovePct} onInput={(e) => updateNotify({ bigMovePct: parseFloat((e.target as HTMLInputElement).value) })} />
        <div class="muted small">{t('alerts.bigMoveHint')}</div>
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
  const ut = UNIT_TEXT[st.lang] ?? UNIT_TEXT.en;
  const add = () => {
    const v = parseFloat(value);
    if (!v || v <= 0) return;
    addTarget(dir, v);
    setValue('');
  };
  return (
    <Card title={t('alerts.targetsTitle')}>
      <p class="muted small">{t('alerts.current', { price: s ? money(current) : '—', unit: unitLabel() })}</p>
      <div class="target-form">
        <Segmented<'below' | 'above'> small value={dir} options={[{ value: 'below', label: t('alerts.dropsBelow') }, { value: 'above', label: t('alerts.risesAbove') }]} onChange={setDir} />
        <input type="number" inputMode="decimal" placeholder={s ? current.toFixed(2) : t('alerts.pricePlaceholder')} value={value} onInput={(e) => setValue((e.target as HTMLInputElement).value)} />
        <button class="btn btn-primary" onClick={add} aria-label={t('alerts.add')}><Icon name="plus" size={18} /> {t('alerts.add')}</button>
      </div>
      {st.notify.targets.length === 0 ? (
        <div class="empty small">{t('alerts.emptyTargets')}</div>
      ) : (
        <ul class="targets">
          {st.notify.targets.map((tg) => {
            const now = s ? priceIn(s.price, rates.value, tg) : null;
            const hit = fired.includes(tg.id);
            const tPrice = formatMoney(tg.price, tg.currency, false, st.lang);
            const nowStr = now != null ? formatMoney(now, tg.currency, false, st.lang) : '—';
            return (
              <li class={hit ? 'hit' : ''}>
                <span class={`dir ${tg.direction}`}>{tg.direction === 'below' ? '▼' : '▲'}</span>
                <div>
                  <b>{tg.direction === 'below' ? t('alerts.targetBelow', { price: tPrice }) : t('alerts.targetAbove', { price: tPrice })}</b>
                  <div class="muted small">
                    {t('alerts.targetMeta', { karat: tg.karat, perUnit: ut[tg.unit].per, now: nowStr })}
                    {hit && t('alerts.reached')}
                  </div>
                </div>
                {hit && <button class="btn btn-sm btn-ghost" onClick={() => rearmTarget(tg.id)}>{t('alerts.rearm')}</button>}
                <button class="icon-btn" aria-label={t('alerts.delete')} onClick={() => updateNotify({ targets: st.notify.targets.filter((x) => x.id !== tg.id) })}>
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
    setMsg(t('alerts.sending'));
    const s = spot.value;
    const ok = await sendNtfy(
      st.ntfyTopic,
      t('alerts.testNotifTitle'),
      s ? t('alerts.testPushBody', { price: money(toDisplay(s.price)), unit: unitLabel() }) : t('alerts.testNotifTitle'),
    );
    setMsg(ok ? t('alerts.sentOk') : t('alerts.sendErr'));
  };
  return (
    <Card title={t('alerts.pushTitle')}>
      <p class="small">
        {t('alerts.pushIntro')} (<a href="https://ntfy.sh" target="_blank" rel="noopener">ntfy.sh</a>)
      </p>
      <ol class="steps small">
        <li>
          {t('alerts.step1')} (<a href="https://play.google.com/store/apps/details?id=io.heckel.ntfy" target="_blank" rel="noopener">Android</a> / <a href="https://apps.apple.com/app/ntfy/id1625396347" target="_blank" rel="noopener">iPhone</a>).
        </li>
        <li>
          {t('alerts.step2')}
          <div class="target-form">
            <input type="text" dir="ltr" placeholder="e.g. goldalert-x7k2p9" value={st.ntfyTopic} onInput={(e) => updateSettings({ ntfyTopic: (e.target as HTMLInputElement).value.trim() })} />
            <button class="btn btn-ghost" onClick={gen}>{t('alerts.generate')}</button>
          </div>
        </li>
        <li>
          {t('alerts.step3')}{st.ntfyTopic && <> (<a href={`https://ntfy.sh/${st.ntfyTopic}`} target="_blank" rel="noopener">{t('alerts.openWeb')}</a>)</>}.
        </li>
        <li>
          {t('alerts.step4')} <code>ALERT_CURRENCY</code> ({st.currency}), <code>ALERT_UNIT</code> ({st.unit}), <code>ALERT_KARAT</code> ({st.karat}), <code>ALERT_LANG</code> ({st.lang}), <code>BIG_MOVE_PCT</code> ({st.notify.bigMovePct || 1}).
        </li>
      </ol>
      <button class="btn btn-primary" disabled={!st.ntfyTopic} onClick={test}>{t('alerts.sendTestPush')}</button>
      {msg && <p class="small">{msg}</p>}
    </Card>
  );
}

function HistoryCard() {
  const h = history.value;
  const st = settings.value;
  return (
    <Card title={t('alerts.historyTitle')} right={h.length > 0 && <button class="link" onClick={clearHistory}>{t('alerts.clear')}</button>}>
      {h.length === 0 ? (
        <div class="empty small">{t('alerts.emptyHistory')}</div>
      ) : (
        <ul class="history">
          {h.slice(0, 20).map((x) => (
            <li>
              <b>{x.title}</b>
              <p class="small">{x.body}</p>
              <span class="muted small">{timeAgo(x.time, Date.now(), st.lang)}</span>
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
