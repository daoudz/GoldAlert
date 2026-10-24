import { useEffect, useState } from 'preact/hooks';
import { Home } from './pages/Home.tsx';
import { ChartPage } from './pages/Chart.tsx';
import { Advice } from './pages/Advice.tsx';
import { Alerts } from './pages/Alerts.tsx';
import { SettingsPage } from './pages/Settings.tsx';
import { Icon, Logo } from './components/ui.tsx';
import { money, settings, spot, status, toDisplay, updateSettings } from './store.ts';
import { toasts } from './notify.ts';
import { CURRENCIES } from './lib/units.ts';

const TABS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'chart', label: 'Chart', icon: 'chart' },
  { id: 'advice', label: 'Advice', icon: 'advice' },
  { id: 'alerts', label: 'Alerts', icon: 'bell' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
] as const;
type Tab = (typeof TABS)[number]['id'];

function useHashTab(): Tab {
  const read = (): Tab => {
    const h = location.hash.replace(/^#\/?/, '') as Tab;
    return TABS.some((t) => t.id === h) ? h : 'home';
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
    document.title = s ? `${money(toDisplay(s.price))} · GoldAlert` : 'GoldAlert — Live Gold Prices';
  }, [s?.price, st.currency, st.unit, st.karat]);

  return (
    <div class="app">
      <header class="topbar">
        <a href="#/home" class="brand">
          <Logo />
          <span>
            Gold<b>Alert</b>
          </span>
        </a>
        <nav class="tabs" aria-label="Main">
          {TABS.map((t) => (
            <a href={`#/${t.id}`} class={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined}>
              <Icon name={t.icon} />
              <span>{t.label}</span>
            </a>
          ))}
        </nav>
        <select class="cur-pill" value={st.currency} aria-label="Currency" onChange={(e) => updateSettings({ currency: (e.target as HTMLSelectElement).value })}>
          {CURRENCIES.map((c) => (
            <option value={c.code}>
              {c.flag} {c.code}
            </option>
          ))}
        </select>
      </header>
      {status.value.error && !s && <div class="banner">⚠ Can't reach price servers. Check your connection — retrying automatically.</div>}
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
        {toasts.value.map((t) => (
          <div class={`toast ${t.kind}`} onClick={() => (toasts.value = toasts.value.filter((x) => x.id !== t.id))}>
            <b>{t.title}</b>
            <span>{t.body}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
