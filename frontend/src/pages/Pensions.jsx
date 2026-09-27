import { useState } from "react";
import { Plus, FlaskConical } from "lucide-react";
import { eur, pct } from "../format";
import { useApi, useApp, PageHead, Stat, Empty, Loading, ErrorBox, Notice } from "../components/ui";
import { AccountModal } from "./Accounts";

export default function Pensions() {
  const { go, toast, meta, bump } = useApp();
  const { data, error, loading, reload } = useApi("/api/pensions");
  const [editing, setEditing] = useState(null);
  if (error) return <ErrorBox error={error} />;
  if (loading && !data) return <Loading />;
  const used = data.employee_annual, max = data.max_relievable;
  const products = meta?.pension_products || {};
  const r = meta?.rules;
  return (
    <>
      <PageHead title="Pensions" sub="Your pension pots, contributions and Irish tax relief">
        <button className="btn" onClick={() => go("simulator")}><FlaskConical />Project my pension</button>
        <button className="btn primary" onClick={() => setEditing({})}><Plus />Add pension</button>
      </PageHead>
      {!data.pots.length ? <div className="card"><Empty title="No pensions recorded" action={<button className="btn primary" onClick={() => setEditing({})}><Plus />Add pension</button>}>
        Add each pot from your latest statement: company scheme, PRSA, AVC, old employer schemes or My Future Fund. Irish providers don't offer data feeds, so update the value when you get a statement.</Empty></div> : <>
        <div className="grid stats">
          <Stat label="Total in pensions" value={eur(data.total)} />
          <Stat label="You pay in a year" value={eur(data.employee_annual, 0)} foot={`${eur(data.employee_annual * (1 - data.marginal_rate), 0)} after tax relief`} />
          <Stat label="Employer & State add" value={eur(data.employer_annual, 0)} foot="A year" />
          <Stat label="Unused tax relief" value={eur(data.relief_on_headroom, 0)} tone={data.relief_on_headroom > 0 ? "neg" : "pos"} foot={data.headroom > 0 ? `On ${eur(data.headroom, 0)} more you could pay in` : "You're using your full limit"} />
        </div>
        <div className="grid split">
          <div className="card card-pad">
            <div className="card-head"><h2>Your pots</h2></div>
            <table className="simple-table">
              <thead><tr><th>Pension</th><th className="hide-sm">Fund</th><th className="r">You / employer a year</th><th className="r">Value</th></tr></thead>
              <tbody>{data.pots.map((p) => (
                <tr key={p.id} className="clickable" onClick={() => setEditing(p)}>
                  <td><div style={{ fontWeight: 550 }}>{p.name}</div><div className="muted" style={{ fontSize: 12 }}>{p.institution} · {products[p.meta?.product_type] || "Pension"}</div></td>
                  <td className="hide-sm ink2">{p.meta?.fund_name || "—"}{p.meta?.sri ? <div className="muted" style={{ fontSize: 12 }}>Risk {p.meta.sri}/7 · {p.meta.annual_fee_pct}% fee</div> : null}</td>
                  <td className="r num">{eur(p.employee_annual, 0)} / {eur(p.employer_annual, 0)}</td>
                  <td className="r num" style={{ fontWeight: 600 }}>{eur(p.value)}</td>
                </tr>))}</tbody>
            </table>
          </div>
          <div className="card card-pad">
            <div className="card-head"><div><h2>Tax relief this year</h2><div className="hint">Age {Math.floor(data.age)}: up to {pct(data.relief_pct_for_age, 0)} of salary (max €115,000 counted), relieved at {pct(data.marginal_rate, 0)}</div></div></div>
            <div className="meter" aria-label="Relief used">
              <div style={{ width: `${Math.min(100, (used / (max || 1)) * 100)}%`, background: "var(--pos)" }} />
            </div>
            <div className="kv" style={{ marginTop: 10 }}><span>You contribute</span><b className="num">{eur(used, 0)}</b></div>
            <div className="kv"><span>Most you can get relief on</span><b className="num">{eur(max, 0)}</b></div>
            <div className="kv"><span>Room left</span><b className="num">{eur(data.headroom, 0)}</b></div>
            <div className="kv"><span>Cost to you after relief</span><b className="num">{eur(data.net_cost_of_headroom, 0)}</b></div>
            <br />
            <Notice>Top up with an AVC (through your employer) or a PRSA. A lump sum paid before the 31 October tax return deadline (mid-November on ROS) can be claimed against the previous year.</Notice>
          </div>
        </div>
        {r && <div className="card card-pad" style={{ marginTop: 14 }}>
          <div className="card-head"><h2>Irish pension rules for {r.tax_year}</h2></div>
          <div className="grid three">
            <div><div className="kv"><span>State Pension (Contributory)</span><b className="num">{eur(r.state_pension_weekly)}/week</b></div>
              <div className="kv"><span>State Pension age</span><b>{r.state_pension_age}</b></div></div>
            <div><div className="kv"><span>Tax-free lump sum</span><b>25%, up to €200,000</b></div>
              <div className="kv"><span>Standard Fund Threshold</span><b className="num">{eur(r.standard_fund_threshold_2026, 0)}</b></div></div>
            <div><div className="kv"><span>My Future Fund 2026–28</span><b>1.5% + 1.5% + 0.5%</b></div>
              <div className="kv"><span>Rising to (2035+)</span><b>6% + 6% + 2%</b></div></div>
          </div>
          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Relief limits by age: under 30 15%, 30–39 20%, 40–49 25%, 50–54 30%, 55–59 35%, 60+ 40%. Check with Revenue or a Qualified Financial Adviser before making big decisions.</p>
        </div>}
      </>}
      {editing && <AccountModal account={editing} defaultType="pension" onClose={() => setEditing(null)} onSaved={(m) => { setEditing(null); toast(m); reload(); bump(); }} />}
    </>
  );
}
