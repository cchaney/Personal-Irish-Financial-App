import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid, Legend } from "recharts";
import { eur, eurSigned, compact, monthLabel, pct } from "../format";
import { useApi, useApp, PageHead, Stat, Loading, ErrorBox, Empty } from "../components/ui";
import { InsightList } from "./Coach";

export default function Overview() {
  const { go, version } = useApp();
  const { data, error, loading } = useApi("/api/overview", null, [version]);
  if (error) return <ErrorBox error={error} />;
  if (loading && !data) return <Loading />;
  const nw = data.net_worth;
  if (!nw.assets && !nw.liabilities) {
    return (
      <>
        <PageHead title="Welcome to PIFA" sub="Your Personal Irish Financial App. Everything stays on this computer." />
        <div className="card"><Empty title="Let's get your numbers in" action={<div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <button className="btn primary" onClick={() => go("accounts")}>Add an account</button>
          <button className="btn" onClick={() => go("settings")}>Load demo data</button></div>}>
          Add your accounts, import a CSV from your bank, and enter your pensions and investments. Or load demo data first to see how everything works.
        </Empty></div>
      </>
    );
  }
  const h = data.history;
  const change = h.length > 1 ? h[h.length - 1].net_worth - h[0].net_worth : 0;
  const avg = data.averages;
  const rate = avg.income ? (avg.income - avg.spending) / avg.income : null;
  return (
    <>
      <PageHead title="Overview" sub="Your money at a glance" />
      <div className="grid stats">
        <Stat label="Net worth" value={eur(nw.net_worth)} foot={h.length > 1 ? <span className={change >= 0 ? "pos" : "neg"}>{eurSigned(change)} in 12 months</span> : ""} />
        <Stat label="Monthly take-home" dot="#1FA971" value={eur(avg.income, 0)} foot={`Average of last ${avg.months || 0} full months`} />
        <Stat label="Monthly spending" dot="#DC4C3E" value={eur(avg.spending, 0)} foot={rate != null ? `You keep ${pct(rate, 0)}` : ""} />
        <Stat label="Pensions" value={eur(data.pensions.total, 0)} foot={data.pensions.relief_on_headroom > 0 ? `${eur(data.pensions.relief_on_headroom, 0)} tax relief unused` : "Using your full relief"} />
      </div>
      <div className="grid split" style={{ marginBottom: 14 }}>
        <div className="card card-pad">
          <div className="card-head"><h2>Net worth</h2><button className="btn ghost" onClick={() => go("networth")}>Details</button></div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={h} margin={{ left: 4, right: 8 }}>
              <defs><linearGradient id="ov" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#F26B2A" stopOpacity={0.22} /><stop offset="100%" stopColor="#F26B2A" stopOpacity={0.02} /></linearGradient></defs>
              <CartesianGrid vertical={false} stroke="#ECEAE6" />
              <XAxis dataKey="month" tickFormatter={monthLabel} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={compact} tickLine={false} axisLine={false} width={52} domain={["auto", "auto"]} />
              <Tooltip formatter={(v) => eur(v, 0)} labelFormatter={monthLabel} />
              <Area type="monotone" dataKey="net_worth" name="Net worth" stroke="#F26B2A" strokeWidth={2} fill="url(#ov)" dot={{ r: 2.5, fill: "#F26B2A" }} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="stackbar" style={{ marginTop: 12 }}>
            {[["cash", "#2F6FDB"], ["investments", "#8B5CF6"], ["pension", "#1E8E3E"], ["property", "#E9A21A"], ["other_asset", "#9CA3AF"]].map(([k, c]) => nw.groups[k] ? <div key={k} style={{ width: `${nw.groups[k] / nw.assets * 100}%`, background: c }} /> : null)}
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5 }}>
            {[["cash", "Cash", "#2F6FDB"], ["investments", "Investments", "#8B5CF6"], ["pension", "Pensions", "#1E8E3E"], ["property", "Property", "#E9A21A"], ["debt", "Debts", "#DC4C3E"]].map(([k, l, c]) => nw.groups[k] ? <span key={k} style={{ display: "flex", gap: 5, alignItems: "center" }}><span className="dot" style={{ background: c }} />{l} <b className="num">{eur(nw.groups[k], 0)}</b></span> : null)}
          </div>
        </div>
        <div className="card card-pad">
          <div className="card-head"><h2>Top suggestions</h2><button className="btn ghost" onClick={() => go("coach")}>See all</button></div>
          <InsightList items={data.insights} compact />
        </div>
      </div>
      <div className="card card-pad">
        <div className="card-head"><h2>Cash flow, last 6 months</h2><button className="btn ghost" onClick={() => go("cashflow")}>Details</button></div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data.cashflow} margin={{ left: 4, right: 8 }}>
            <CartesianGrid vertical={false} stroke="#ECEAE6" />
            <XAxis dataKey="month" tickFormatter={monthLabel} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={compact} tickLine={false} axisLine={false} width={48} />
            <Tooltip formatter={(v, n) => [eur(v, 0), n]} labelFormatter={monthLabel} /><Legend />
            <Bar dataKey="income" name="Income" fill="#1FA971" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="spending" name="Spending" fill="#DC4C3E" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="saved_invested" name="Invested" fill="#8B5CF6" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
