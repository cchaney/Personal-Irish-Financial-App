import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard, ReceiptText, ArrowLeftRight, ChartPie, TrendingUp, Landmark, ChartLine, PiggyBank,
  HandCoins, FlaskConical, Sparkles, CircleHelp, Settings as SettingsIcon, Ellipsis,
} from "lucide-react";
import { api } from "./api";
import { AppCtx, presetRange } from "./components/ui";
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
  loans: { label: "Loans", icon: HandCoins, el: Loans },
  simulator: { label: "Simulator", icon: FlaskConical, el: Simulator, section: "Plan" },
  coach: { label: "AI coach", icon: Sparkles, el: Coach },
  settings: { label: "Settings", icon: SettingsIcon, el: Settings },
};
const MOBILE_TABS = ["transactions", "cashflow", "spending", "networth"];

function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#1F2A24" />
      <path d="M7 21.5c3.2 1.6 14.8 1.6 18 0l-1.6 3c-4.6 1.4-10.2 1.4-14.8 0z" fill="#F26B2A" />
      <path d="M16 5v14.5M16 6.5l7 11H16" stroke="#F6F5F3" strokeWidth="2" fill="none" strokeLinejoin="round" />
    </svg>
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

  const ctx = useMemo(() => ({ period, setPeriod, meta, toast, go, counts, refreshCounts, version, bump, query: route.query }),
    [period, meta, toast, go, counts, refreshCounts, version, bump, route.query]);
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
          <div className="brand"><Logo />PIFA</div>
          {keys.map((k) => (
            <div key={k}>
              {PAGES[k].section && <div className="nav-section">{PAGES[k].section}</div>}
              {navItem(k)}
              {k === "accounts" && uncatItem}
            </div>
          ))}
          <div className="sidebar-foot">{navItem("settings")}</div>
        </aside>
        <main className="main">
          <div className="page"><Page key={route.page + (route.query.status || "")} /></div>
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
              {["overview", "accounts", "investments", "pensions", "loans", "simulator", "coach", "settings"].map(navItem)}
              {uncatItem}
            </div>
          </div>
        )}
        {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
      </div>
    </AppCtx.Provider>
  );
}
