import { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from "recharts";
import { ChevronRight, ChevronDown, Camera } from "lucide-react";
import { api } from "../api";
import { eur, eurSigned, compact, monthLabel } from "../format";
import { useApi, useApp, PageHead, PeriodPicker, periodParams, Stat, Seg, Loading, ErrorBox, Empty } from "../components/ui";

export default function NetWorth() {
  const { period, go, toast } = useApp();
  const { data, error, loading, reload } = useApi("/api/reports/networth", periodParams(period));
  const [view, setView] = useState("net");
  if (error) return <ErrorBox error={error} />;
  if (loading && !data) return <Loading />;
  const snap = async () => { await api.post("/api/snapshot"); toast("Recorded today's balances"); reload(); };
  const minY = Math.min(...data.history.map((h) => h.net_worth), 0);
  return (
    <>
      <PageHead title="Net worth" sub="Everything you own minus everything you owe">
        <button className="btn" onClick={snap} title="Save today's balances to the history"><Camera />Record today</button><PeriodPicker />
      </PageHead>
      {!data.assets && !data.liabilities ? <div className="card"><Empty title="No accounts yet" action={<button className="btn primary" onClick={() => go("accounts")}>Add an account</button>}>Add your bank accounts, savings, investments, pensions and loans to track your net worth.</Empty></div> : <>
        <div className="grid stats">
          <Stat label="Net worth" value={eur(data.net_worth)} foot="Today" />
          <Stat label="Change this period" dot={data.change >= 0 ? "#1FA971" : "#DC4C3E"} value={eurSigned(data.change)} tone={data.change >= 0 ? "pos" : "neg"} foot={data.since ? `Since ${monthLabel(data.since)}` : ""} />
          <Stat label="Assets" value={eur(data.assets)} />
          <Stat label="Liabilities" value={eur(data.liabilities)} />
        </div>
        <div className="card card-pad" style={{ marginBottom: 14 }}>
          <div className="card-head"><div><h2>Net worth over time</h2><div className="hint">Built from month-end balances. Use "Record today" after updating balances.</div></div>
            <Seg options={[["net", "Net worth"], ["split", "Assets vs debts"]]} value={view} onChange={setView} /></div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data.history} margin={{ left: 4, right: 8, top: 6 }}>
              <defs><linearGradient id="nw" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#F26B2A" stopOpacity={0.22} /><stop offset="100%" stopColor="#F26B2A" stopOpacity={0.02} /></linearGradient></defs>
              <CartesianGrid vertical={false} stroke="#ECEAE6" />
              <XAxis dataKey="month" tickFormatter={monthLabel} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={compact} tickLine={false} axisLine={false} width={52} domain={view === "net" ? [Math.floor(minY * 0.95 / 1000) * 1000, "auto"] : [0, "auto"]} />
              <Tooltip formatter={(v, n) => [eur(v, 0), n]} labelFormatter={monthLabel} />
              {view === "net" ? <Area type="monotone" dataKey="net_worth" name="Net worth" stroke="#F26B2A" strokeWidth={2} fill="url(#nw)" dot={{ r: 2.5, fill: "#F26B2A" }} isAnimationActive={false} />
                : [<Area key="a" type="monotone" dataKey="assets" name="Assets" stroke="#1FA971" fill="#1FA971" fillOpacity={0.1} isAnimationActive={false} />,
                  <Area key="l" type="monotone" dataKey="liabilities" name="Liabilities" stroke="#DC4C3E" fill="#DC4C3E" fillOpacity={0.1} isAnimationActive={false} />,
                  <Legend key="lg" />]}
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="grid two">
          <TypeList title="Assets" rows={data.assets_by_type} total={data.assets} />
          <TypeList title="Liabilities" rows={data.liabilities_by_type} total={data.liabilities} />
        </div>
      </>}
    </>
  );
}

function TypeList({ title, rows, total }) {
  const [open, setOpen] = useState({});
  const { go } = useApp();
  return (
    <div className="card card-pad">
      <div className="card-head"><h2>{title}</h2><b className="num">{eur(total)}</b></div>
      {total > 0 && <div className="stackbar">{rows.map((r) => <div key={r.name} style={{ width: `${(r.total / total) * 100}%`, background: r.color }} title={r.name} />)}</div>}
      {!rows.length && <p className="muted">None</p>}
      {rows.map((r) => (
        <div key={r.name} className="acc-group">
          <button onClick={() => setOpen((o) => ({ ...o, [r.name]: !o[r.name] }))}>
            {open[r.name] ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<span className="dot" style={{ background: r.color }} />{r.name}<span className="muted num">{r.accounts.length}</span>
            <span className="total num">{eur(r.total)}</span>
          </button>
          {open[r.name] && r.accounts.map((a) => (
            <div key={a.id} className="acc-row" onClick={() => go("accounts")}><span>{a.name}</span><span className="muted">{a.institution}</span><span className="v num">{eur(a.value)}</span></div>
          ))}
        </div>
      ))}
    </div>
  );
}
