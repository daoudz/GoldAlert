import { useEffect, useState } from 'preact/hooks';
import { Home } from './pages/Home.tsx';
import { ChartPage } from './pages/Chart.tsx';
import { Advice } from './pages/Advice.tsx';
import { Alerts } from './pages/Alerts.tsx';
import { SettingsPage } from './pages/Settings.tsx';
import { Icon, Logo } from './components/ui.tsx';
import { money, settings, spot, status, t, toDisplay, updateSettings } from './store.ts';
import { toasts } from './notify.ts';
import { CURRENCIES } from './lib/units.ts';
import { LANGUAGES } from './lib/i18n.ts';
import type { Lang } from './lib/types.ts';

const TABS = [
  { id: 'home', labelKey: 'nav.home', icon: 'home' },
  { id: 'chart', labelKey: 'nav.chart', icon: 'chart' },
  { id: 'advice', labelKey: 'nav.advice', icon: 'advice' },
  { id: 'alerts', labelKey: 'nav.alerts', icon: 'bell' },
  { id: 'settings', labelKey: 'nav.settings', icon: 'settings' },
] as const;
type Tab = (typeof TABS)[number]['id'];

function useHashTab(): Tab {
  const read = (): Tab => {
    const h = location.hash.replace(/^#\/?/, '') as Tab;
    return TABS.some((x) => x.id === h) ? h : 'home';
  };
  const [tab, setTab] = useState<Tab>(read);
  useEffect(() => {
    const on = () => {
      setTab(read());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return tab;
}

export function App() {
  const tab = useHashTab();
  const s = spot.value;
  const st = settings.value;
  useEffect(() => {
    document.title = s ? `${money(toDisplay(s.price))} · GoldAlert` : t('app.title');
  }, [s?.price, st.currency, st.unit, st.karat, st.lang]);

  return (
    <div class="app">
      <header class="topbar">
        <a href="#/home" class="brand">
          <Logo />
          <span>
            Gold<b>Alert</b>
          </span>
        </a>
        <nav class="tabs" aria-label={t('nav.main')}>
          {TABS.map((x) => (
            <a href={`#/${x.id}`} class={tab === x.id ? 'on' : ''} aria-current={tab === x.id ? 'page' : undefined}>
              <Icon name={x.icon} />
              <span>{t(x.labelKey)}</span>
            </a>
          ))}
        </nav>
        <div class="top-actions">
          <select class="cur-pill" value={st.lang} aria-label={t('settings.language')} onChange={(e) => updateSettings({ lang: (e.target as HTMLSelectElement).value as Lang })}>
            {LANGUAGES.map((l) => (
              <option value={l.code}>
                {l.flag} {l.native}
              </option>
            ))}
          </select>
          <select class="cur-pill" value={st.currency} aria-label={t('settings.currency')} onChange={(e) => updateSettings({ currency: (e.target as HTMLSelectElement).value })}>
            {CURRENCIES.map((c) => (
              <option value={c.code}>
                {c.flag} {c.code}
              </option>
            ))}
          </select>
        </div>
      </header>
      {status.value.error && !s && <div class="banner">{t('banner.offline')}</div>}
      <main>
        {tab === 'home' && <Home />}
        {tab === 'chart' && <ChartPage />}
        {tab === 'advice' && <Advice />}
        {tab === 'alerts' && <Alerts />}
        {tab === 'settings' && <SettingsPage />}
        <footer class="footer muted small">
          © {new Date().getFullYear()} <b>90studio</b> · GoldAlert
        </footer>
      </main>
      <div class="toasts" aria-live="polite">
        {toasts.value.map((x) => (
          <div class={`toast ${x.kind}`} onClick={() => (toasts.value = toasts.value.filter((y) => y.id !== x.id))}>
            <b>{x.title}</b>
            <span>{x.body}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
