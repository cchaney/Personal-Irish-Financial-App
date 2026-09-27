import { useEffect, useState } from "react";
import { C } from "../theme";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from "recharts";
import { Plus } from "lucide-react";
import { api } from "../api";
import { eur, compact } from "../format";
import { useApi, useApp, PageHead, Stat, Empty, Loading, ErrorBox, Notice, Seg } from "../components/ui";
import { AccountModal, TYPE_LABELS } from "./Accounts";

const monthsToDate = (m) => { const d = new Date(); d.setMonth(d.getMonth() + m); return d.toLocaleDateString("en-IE", { month: "short", year: "numeric" }); };

export default function Loans() {
  const { toast, bump } = useApp();
  const accounts = useApi("/api/accounts");
  const [extra, setExtra] = useState(100);
  const [strategy, setStrategy] = useState("avalanche");
  const [sim, setSim] = useState(null);
  const [editing, setEditing] = useState(null);
  const debts = (accounts.data || []).filter((a) => a.is_liability && a.value > 0);
  useEffect(() => {
    if (!accounts.data) return;
    const t = setTimeout(() => api.post("/api/simulate/debt", { extra_monthly: Number(extra) || 0 }).then(setSim), 150);
    return () => clearTimeout(t);
  }, [extra, accounts.data]);
  if (accounts.error) return <ErrorBox error={accounts.error} />;
  if (!accounts.data) return <Loading />;
  const total = debts.reduce((s, d) => s + d.value, 0);
  const monthly = debts.reduce((s, d) => s + d.min_payment, 0);
  const yearlyInterest = debts.reduce((s, d) => s + d.value * d.interest_rate / 100, 0);
  const chosen = sim?.[strategy];
  const base = sim?.minimum_only;
  const chart = [];
  if (sim) {
    const n = Math.max(base.timeline.length, chosen.timeline.length);
    for (let i = 0; i < n; i += 1) chart.push({ month: i + 1, "Minimum payments": base.timeline[i]?.total ?? 0, [`With €${extra} extra`]: chosen.timeline[i]?.total ?? 0 });
  }
  return (
    <>
      <PageHead title="Loans" sub="Credit cards, loans and mortgages, and how fast you can clear them">
        <button className="btn primary" onClick={() => setEditing({})}><Plus />Add debt</button>
      </PageHead>
      {!debts.length ? <div className="card"><Empty title="No debts recorded" action={<button className="btn primary" onClick={() => setEditing({})}><Plus />Add debt</button>}>If you have a credit card balance, car loan, credit union loan or mortgage, add it with its interest rate and monthly repayment.</Empty></div> : <>
        <div className="grid stats">
          <Stat label="Total owed" value={eur(total)} />
          <Stat label="Monthly repayments" value={eur(monthly)} />
          <Stat label="Interest a year" value={eur(yearlyInterest, 0)} tone="neg" foot="At current balances" />
          <Stat label="Debt-free" value={base ? monthsToDate(base.months) : "…"} foot="Paying the minimums" />
        </div>
        <div className="grid split">
          <div className="card card-pad">
            <div className="card-head"><div><h2>Payoff plan</h2><div className="hint">Extra money each month on top of your repayments</div></div>
              <Seg options={[["avalanche", "Highest interest first"], ["snowball", "Smallest balance first"]]} value={strategy} onChange={setStrategy} /></div>
            <div className="slider-row" style={{ marginBottom: 12 }}>
              <input type="range" min={0} max={1000} step={25} value={extra} onChange={(e) => setExtra(e.target.value)} aria-label="Extra per month" />
              <b className="num">{eur(Number(extra), 0)}/mo</b>
            </div>
            {chosen && <>
              <div className="grid three" style={{ marginBottom: 12 }}>
                <div><div className="muted" style={{ fontSize: 12 }}>Debt-free</div><b>{monthsToDate(chosen.months)}</b><div className="pos" style={{ fontSize: 12 }}>{base.months - chosen.months} months sooner</div></div>
                <div><div className="muted" style={{ fontSize: 12 }}>Total interest</div><b className="num">{eur(chosen.total_interest, 0)}</b><div className="pos" style={{ fontSize: 12 }}>Saves {eur(base.total_interest - chosen.total_interest, 0)}</div></div>
                <div><div className="muted" style={{ fontSize: 12 }}>Order</div><div style={{ fontSize: 12.5 }}>{chosen.order.map((o) => o.name).join(" → ")}</div></div>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chart}><CartesianGrid vertical={false} stroke={C.grid} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tickFormatter={(m) => (m % 12 === 0 ? `${m / 12}y` : "")} interval={0} />
                  <YAxis tickFormatter={compact} tickLine={false} axisLine={false} width={48} />
                  <Tooltip formatter={(v) => eur(v, 0)} labelFormatter={(m) => `Month ${m}`} /><Legend />
                  <Line dataKey="Minimum payments" stroke="#9CA3AF" dot={false} strokeWidth={2} isAnimationActive={false} />
                  <Line dataKey={`With €${extra} extra`} stroke={C.accent} dot={false} strokeWidth={2} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
              {chosen.warnings.map((w) => <Notice key={w} warn>{w}</Notice>)}
            </>}
          </div>
          <div className="card card-pad">
            <div className="card-head"><h2>Your debts</h2></div>
            {debts.sort((a, b) => b.interest_rate - a.interest_rate).map((d) => (
              <div key={d.id} className="kv" style={{ cursor: "pointer", padding: "10px 0" }} onClick={() => setEditing(d)}>
                <span><b style={{ fontWeight: 560 }}>{d.name}</b><div className="muted" style={{ fontSize: 12 }}>{TYPE_LABELS[d.type]} · {d.interest_rate}% · {eur(d.min_payment, 0)}/mo</div></span>
                <b className="num">{eur(d.value)}</b>
              </div>
            ))}
            <br /><Notice>Highest interest first saves the most money. Smallest balance first clears individual debts sooner, which some people find motivating.</Notice>
          </div>
        </div>
      </>}
      {editing && <AccountModal account={editing} defaultType="credit_card" onClose={() => setEditing(null)} onSaved={(m) => { setEditing(null); toast(m); accounts.reload(); bump(); }} />}
    </>
  );
}
