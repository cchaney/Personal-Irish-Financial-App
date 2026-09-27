import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard, ReceiptText, ArrowLeftRight, ChartPie, TrendingUp, Landmark, ChartLine, PiggyBank,
  HandCoins, FlaskConical, Sparkles, CircleHelp, Settings as SettingsIcon, Ellipsis, ShieldCheck, Sun, Moon,
} from "lucide-react";
import { api } from "./api";
import { AppCtx, presetRange } from "./components/ui";
import { applyTheme, currentTheme } from "./theme";
import Emergency from "./pages/Emergency";
import Overview from "./pages/Overview";
import Transactions from "./pages/Transactions";
import CashFlow from "./pages/CashFlow";
import Spending from "./pages/Spending";
import NetWorth from "./pages/NetWorth";
import Accounts from "./pages/Accounts";
import Investments from "./pages/Investments";
import Pensions from "./pages/Pensions";
import Loans from "./pages/Loans";
import Simulator from "./pages/Simulator";
import Coach from "./pages/Coach";
import Settings from "./pages/Settings";

const PAGES = {
  overview: { label: "Overview", icon: LayoutDashboard, el: Overview },
  transactions: { label: "Transactions", icon: ReceiptText, el: Transactions, badge: "needs_review" },
  cashflow: { label: "Cash flow", icon: ArrowLeftRight, el: CashFlow },
  spending: { label: "Spending", icon: ChartPie, el: Spending },
  networth: { label: "Net worth", icon: TrendingUp, el: NetWorth },
  accounts: { label: "Accounts", icon: Landmark, el: Accounts },
  investments: { label: "Investments", icon: ChartLine, el: Investments, section: "Wealth" },
  pensions: { label: "Pensions", icon: PiggyBank, el: Pensions },
  emergency: { label: "Emergency fund", icon: ShieldCheck, el: Emergency },
  loans: { label: "Loans", icon: HandCoins, el: Loans },
  simulator: { label: "Simulator", icon: FlaskConical, el: Simulator, section: "Plan" },
  coach: { label: "AI coach", icon: Sparkles, el: Coach },
  settings: { label: "Settings", icon: SettingsIcon, el: Settings },
};
const MOBILE_TABS = ["transactions", "cashflow", "spending", "networth"];

function Logo() {
  return (
    <div className="brand">
      <span className="brand-mark"><ShieldCheck /></span>
      <div><div className="brand-name">PIFA</div><div className="brand-sub">Irish Finances</div></div>
    </div>
  );
}

const parseHash = () => {
  const [path, query] = window.location.hash.replace(/^#\/?/, "").split("?");
  return { page: PAGES[path] ? path : "overview", query: Object.fromEntries(new URLSearchParams(query || "")) };
};

export default function App() {
  const [route, setRoute] = useState(parseHash());
  const [period, setPeriod] = useState({ preset: "ytd", ...presetRange("ytd") });
  const [meta, setMeta] = useState(null);
  const [counts, setCounts] = useState({ needs_review: 0, uncategorised: 0 });
  const [toastMsg, setToastMsg] = useState(null);
  const [sheet, setSheet] = useState(false);
  const [version, setVersion] = useState(0);
  const [theme, setTheme] = useState(currentTheme());
  const toggleTheme = useCallback(() => { const t = theme === "dark" ? "light" : "dark"; applyTheme(t); setTheme(t); }, [theme]);

  useEffect(() => {
    const h = () => { setRoute(parseHash()); setSheet(false); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  useEffect(() => { api.get("/api/meta").then(setMeta).catch(() => {}); }, []);
  const refreshCounts = useCallback(() => api.get("/api/transactions/counts").then(setCounts).catch(() => {}), []);
  useEffect(() => { refreshCounts(); }, [refreshCounts, version, route.page]);

  const toast = useCallback((m) => { setToastMsg(m); setTimeout(() => setToastMsg(null), 2600); }, []);
  const go = useCallback((page, query) => {
    const q = query ? "?" + new URLSearchParams(query).toString() : "";
    window.location.hash = `/${page}${q}`;
  }, []);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const ctx = useMemo(() => ({ period, setPeriod, meta, toast, go, counts, refreshCounts, version, bump, query: route.query, theme, toggleTheme }),
    [period, meta, toast, go, counts, refreshCounts, version, bump, route.query, theme, toggleTheme]);
  const Page = PAGES[route.page].el;

  const navItem = (key) => {
    const p = PAGES[key];
    const Icon = p.icon;
    const n = p.badge ? counts[p.badge] : 0;
    return (
      <button key={key} className={`nav-item ${route.page === key && !(key === "transactions" && route.query.status) ? "active" : ""}`}
        onClick={() => go(key)}>
        <Icon />{p.label}{n > 0 && <span className="badge num">{n}</span>}
      </button>
    );
  };
  const uncatActive = route.page === "transactions" && route.query.status === "uncategorised";
  const uncatItem = (
    <button key="uncat" className={`nav-item ${uncatActive ? "active" : ""}`} onClick={() => go("transactions", { status: "uncategorised" })}>
      <CircleHelp />Uncategorised{counts.uncategorised > 0 && <span className="badge soft num">{counts.uncategorised}</span>}
    </button>
  );

  const keys = Object.keys(PAGES).filter((k) => k !== "settings");
  return (
    <AppCtx.Provider value={ctx}>
      <div className="app">
        <aside className="sidebar">
          <Logo />
          {keys.map((k) => (
            <div key={k}>
              {PAGES[k].section && <div className="nav-section">{PAGES[k].section}</div>}
              {navItem(k)}
              {k === "accounts" && uncatItem}
            </div>
          ))}
          <div className="sidebar-foot">
            {navItem("settings")}
            <button className="nav-item" onClick={toggleTheme}>{theme === "dark" ? <Sun /> : <Moon />}{theme === "dark" ? "Light mode" : "Dark mode"}</button>
            <div className="sidebar-note">Personal Irish Financial App<br />Private · runs on your computer</div>
          </div>
        </aside>
        <main className="main">
          <div className="page"><Page key={route.page + (route.query.status || "") + theme} /></div>
        </main>

        <nav className="tabbar" aria-label="Main">
          {MOBILE_TABS.map((k) => {
            const p = PAGES[k]; const Icon = p.icon; const n = p.badge ? counts[p.badge] : 0;
            return (
              <button key={k} className={route.page === k ? "on" : ""} onClick={() => go(k)}>
                <Icon />{p.label}{n > 0 && <span className="badge num">{n}</span>}
              </button>
            );
          })}
          <button className={!MOBILE_TABS.includes(route.page) ? "on" : ""} onClick={() => setSheet(true)}>
            <Ellipsis />More{counts.uncategorised > 0 && <span className="badge num">{counts.uncategorised}</span>}
          </button>
        </nav>
        {sheet && (
          <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && setSheet(false)}>
            <div className="sheet">
              {["overview", "accounts", "investments", "pensions", "emergency", "loans", "simulator", "coach", "settings"].map(navItem)}
              {uncatItem}
            </div>
          </div>
        )}
        {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
      </div>
    </AppCtx.Provider>
  );
}
