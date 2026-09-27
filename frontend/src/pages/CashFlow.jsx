import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { eur, pct } from "../format";
import { useApi, useApp, PageHead, PeriodPicker, periodParams, Stat, Seg, BarList, Empty, Loading, ErrorBox } from "../components/ui";
import Sankey from "../components/Sankey";

export default function CashFlow() {
  const { period, go } = useApp();
  const { data, error, loading } = useApi("/api/reports/cashflow", periodParams(period));
  const [view, setView] = useState(window.innerWidth < 820 ? "pl" : "sankey");
  const [expBy, setExpBy] = useState("group");
  if (error) return <ErrorBox error={error} />;
  if (loading && !data) return <Loading />;
  const none = !data.income && !data.expenses;
  const cats = data.groups.flatMap((g) => g.categories.map((c) => ({ ...c, color: g.color, group: g.name })))
    .sort((a, b) => b.amount - a.amount);
  return (
    <>
      <PageHead title="Cash flow" sub="Where the money comes from and goes. Transfers and money you invest aren't counted as spending."><PeriodPicker /></PageHead>
      {none ? <div className="card"><Empty title="No income or spending in this period" action={<button className="btn primary" onClick={() => go("transactions")}>Go to transactions</button>}>Import transactions or pick a different period.</Empty></div> : <>
        <div className="grid stats">
          <Stat label="Income" dot="#1FA971" value={eur(data.income)} />
          <Stat label="Expenses" dot="#DC4C3E" value={eur(data.expenses)} />
          <Stat label={data.net >= 0 ? "Left over" : "Shortfall"} value={eur(data.net)} tone={data.net >= 0 ? "pos" : "neg"} foot="Saved, invested or still in your accounts" />
          <Stat label="Savings rate" value={pct(data.savings_rate)} foot="Of income kept" />
        </div>
        <div className="card card-pad" style={{ marginBottom: 14 }}>
          <div className="card-head"><h2>Where the money went</h2><Seg options={[["sankey", "Sankey"], ["pl", "Profit & loss"]]} value={view} onChange={setView} /></div>
          {view === "sankey" ? <div style={{ overflowX: "auto" }}><div style={{ minWidth: 640 }}><Sankey data={data} /></div></div> : <ProfitLoss data={data} />}
        </div>
        <div className="grid two">
          <div className="card card-pad">
            <div className="card-head"><h2>Income</h2></div>
            <BarList rows={data.sources.map((s) => ({ ...s, color: "#1FA971" }))} total={data.income} />
          </div>
          <div className="card card-pad">
            <div className="card-head"><h2>Expenses</h2><Seg options={[["group", "Group"], ["category", "Category"]]} value={expBy} onChange={setExpBy} /></div>
            <BarList rows={expBy === "group" ? data.groups : cats} total={data.expenses}
              onClick={(r) => expBy === "category" && go("transactions", { category: r.name })} />
          </div>
        </div>
      </>}
    </>
  );
}

function ProfitLoss({ data }) {
  const [open, setOpen] = useState({});
  const base = data.income || 1;
  return (
    <div>
      <div className="pl-row head"><span>Category</span><span className="r">% of income</span><span className="r">Amount</span></div>
      <div className="pl-row total"><span>Income</span><span /><span className="r num">{eur(data.income)}</span></div>
      {data.sources.map((s) => <div key={s.name} className="pl-row sub"><span>{s.name}</span><span className="r num muted">{pct(s.amount / base)}</span><span className="r num">{eur(s.amount)}</span></div>)}
      <div className="pl-row total"><span>Expenses</span><span className="r num">{pct(data.expenses / base)}</span><span className="r num">{eur(-data.expenses)}</span></div>
      {data.groups.map((g) => (
        <div key={g.name}>
          <div className="pl-row" style={{ cursor: "pointer" }} onClick={() => setOpen((o) => ({ ...o, [g.name]: !o[g.name] }))}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>{open[g.name] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<span className="dot" style={{ background: g.color }} />{g.name}</span>
            <span className="r num muted">{pct(g.amount / base)}</span><span className="r num">{eur(-g.amount)}</span>
          </div>
          {open[g.name] && g.categories.map((c) => <div key={c.name} className="pl-row sub"><span style={{ paddingLeft: 22 }}>{c.name}</span><span className="r num muted">{pct(c.amount / base)}</span><span className="r num">{eur(-c.amount)}</span></div>)}
        </div>
      ))}
      <div className="pl-row total"><span>Net</span><span className="r num">{pct(data.net / base)}</span><span className={`r num ${data.net >= 0 ? "pos" : "neg"}`}>{eur(data.net)}</span></div>
    </div>
  );
}
