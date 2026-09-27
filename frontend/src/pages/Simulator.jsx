import { useEffect, useMemo, useState } from "react";
import { C } from "../theme";
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";
import { api } from "../api";
import { eur, pct, compact } from "../format";
import { useApi, PageHead, Seg, Loading, ErrorBox, Notice, Field } from "../components/ui";

function Slider({ label, value, onChange, min, max, step = 1, fmt = (v) => v, help }) {
  return (
    <Field label={label} help={help}>
      <div className="slider-row">
        <input type="range" min={min} max={max} step={step} value={value ?? 0} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
        <input className="input num" type="number" step={step} value={value ?? ""} onChange={(e) => onChange(Number(e.target.value))} aria-label={`${label} value`} />
      </div>
      <div className="muted num" style={{ fontSize: 12, marginTop: -2 }}>{fmt(value)}</div>
    </Field>
  );
}

function useSim(url, params) {
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);
  const key = JSON.stringify(params);
  useEffect(() => {
    if (!params) return;
    const t = setTimeout(() => api.post(url, params).then((r) => { setRes(r); setErr(null); }).catch((e) => setErr(e.message)), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, key]);
  return [res, err];
}

function FanChart({ rows, xKey, real, extra }) {
  const s = real ? "_real" : "";
  const data = useMemo(() => rows.map((r) => ({
    x: r[xKey], outer: [r["p10" + s], r["p90" + s]], inner: [r["p25" + s], r["p75" + s]], median: r["p50" + s],
    contributed: r.contributed, expected: real ? r.expected_real : r.expected, ...(extra ? extra(r) : {}),
  })), [rows, xKey, real, s, extra]);
  const tip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div className="card" style={{ padding: "8px 10px", fontSize: 12 }}>
        <b>{xKey === "age" ? `Age ${label}` : label}</b>
        <div>Likely (median): <b className="num">{eur(p.median, 0)}</b></div>
        <div className="muted num">Middle half: {eur(p.inner[0], 0)} – {eur(p.inner[1], 0)}</div>
        <div className="muted num">9 in 10: {eur(p.outer[0], 0)} – {eur(p.outer[1], 0)}</div>
        <div className="muted num">Paid in: {eur(p.contributed, 0)}</div>
      </div>
    );
  };
  return (
    <ResponsiveContainer width="100%" height={330}>
      <ComposedChart data={data} margin={{ left: 4, right: 8, top: 6 }}>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="x" tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tickFormatter={compact} tickLine={false} axisLine={false} width={56} />
        <Tooltip content={tip} />
        <Area dataKey="outer" stroke="none" fill={C.accent} fillOpacity={0.1} isAnimationActive={false} />
        <Area dataKey="inner" stroke="none" fill={C.accent} fillOpacity={0.2} isAnimationActive={false} />
        <Line dataKey="median" stroke={C.accent} strokeWidth={2.2} dot={false} isAnimationActive={false} />
        {!real && <Line dataKey="contributed" stroke={C.muted} strokeDasharray="4 4" dot={false} isAnimationActive={false} />}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export default function Simulator() {
  const defaults = useApi("/api/simulate/defaults");
  const [tab, setTab] = useState("pension");
  const [p, setP] = useState(null);
  const [inv, setInv] = useState(null);
  const [real, setReal] = useState(true);
  useEffect(() => { if (defaults.data) { setP(defaults.data.pension); setInv(defaults.data.investment); } }, [defaults.data]);
  const [pRes, pErr] = useSim("/api/simulate/pension", tab === "pension" ? p : null);
  const [iRes, iErr] = useSim("/api/simulate/investment", tab === "investment" ? inv : null);
  if (defaults.error) return <ErrorBox error={defaults.error} />;
  if (!p || !inv) return <Loading />;
  const setPk = (k) => (v) => setP((s) => ({ ...s, [k]: v }));
  const setIk = (k) => (v) => setInv((s) => ({ ...s, [k]: v }));
  const sri = defaults.data.sri;
  const applySri = (setter) => (n) => setter((s) => ({ ...s, expected_return: sri[n].return, volatility: sri[n].volatility }));

  return (
    <>
      <PageHead title="Simulator" sub="2,000 possible futures for your money, based on how markets have behaved. Starts from your real balances.">
        <Seg options={[["pension", "Pension"], ["investment", "Investments"]]} value={tab} onChange={setTab} />
        <Seg options={[[true, "Today's money"], [false, "Future euros"]]} value={real} onChange={setReal} />
      </PageHead>

      {defaults.data.example && tab === "pension" && <div style={{ marginBottom: 14 }}><Notice>You haven't added a pension yet, so this starts from example contributions (5% from you, 5% from an employer). Add your pensions and details in Settings to start from your real numbers.</Notice></div>}
      {tab === "pension" ? (
        <div className="grid sim-grid">
          <div className="card card-pad stack">
            <div className="form" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Field label="Age now"><input className="input num" type="number" value={p.current_age} onChange={(e) => setPk("current_age")(Number(e.target.value))} /></Field>
              <Field label="Retire at"><input className="input num" type="number" value={p.retirement_age} onChange={(e) => setPk("retirement_age")(Number(e.target.value))} /></Field>
              <Field label="Pension pots now"><input className="input num" type="number" value={p.current_pot} onChange={(e) => setPk("current_pot")(Number(e.target.value))} /></Field>
              <Field label="Gross salary"><input className="input num" type="number" value={p.salary} onChange={(e) => setPk("salary")(Number(e.target.value))} /></Field>
            </div>
            <Slider label="You pay (% of salary)" value={p.employee_pct} onChange={setPk("employee_pct")} min={0} max={40} step={0.5} fmt={(v) => `${eur(p.salary * v / 100, 0)} a year`} />
            <Slider label="Employer pays (%)" value={p.employer_pct} onChange={setPk("employer_pct")} min={0} max={20} step={0.5} fmt={(v) => `${eur(p.salary * v / 100, 0)} a year`} />
            <Slider label="Extra per month (AVC)" value={p.extra_monthly} onChange={setPk("extra_monthly")} min={0} max={2000} step={25} fmt={(v) => `${eur(v, 0)}/month`} />
            <Field label="Fund risk rating">
              <select className="select" onChange={(e) => applySri(setP)(Number(e.target.value))} defaultValue="">
                <option value="" disabled>Pick 1–7 to set growth and ups-and-downs</option>
                {Object.entries(sri).map(([n, a]) => <option key={n} value={n}>{n} — {a.return}% growth, {a.volatility}% swings</option>)}
              </select>
            </Field>
            <Slider label="Expected growth (% a year)" value={p.expected_return} onChange={setPk("expected_return")} min={0} max={12} step={0.1} fmt={(v) => `${v}% before fees`} />
            <Slider label="Volatility (%)" value={p.volatility} onChange={setPk("volatility")} min={0} max={30} step={0.5} fmt={(v) => `Typical yearly swing ±${v}%`} />
            <Slider label="Annual fees (%)" value={p.annual_fee} onChange={setPk("annual_fee")} min={0} max={2.5} step={0.05} fmt={(v) => `${v}%`} />
            <Slider label="Retirement income goal" value={p.target_income} onChange={setPk("target_income")} min={0} max={120000} step={1000} fmt={(v) => `${eur(v, 0)} a year in today's money, incl. State Pension`} />
            <Slider label="De-risk over final years" value={p.lifestyle_years} onChange={setPk("lifestyle_years")} min={0} max={15} fmt={(v) => (v ? `Glides to cautious over ${v} years` : "No lifestyling")} />
            <label style={{ display: "flex", gap: 8, fontSize: 13 }}><input type="checkbox" checked={p.include_state_pension} onChange={(e) => setPk("include_state_pension")(e.target.checked)} />Include full State Pension (€299.30/week from 66)</label>
            <button className="btn" onClick={() => setP(defaults.data.pension)}>Reset to my numbers</button>
          </div>
          <div className="stack">
            {pErr && <ErrorBox error={pErr} />}
            {pRes && <>
              <div className="grid stats" style={{ marginBottom: 0 }}>
                <div className="card stat"><div className="label">Pot at {pRes.at_retirement.age}</div><div className="value num">{eur(pRes.at_retirement[real ? "pot_today_money" : "pot_nominal"].p50, 0)}</div><div className="foot num">Likely range {compact(pRes.at_retirement[real ? "pot_today_money" : "pot_nominal"].p10)}–{compact(pRes.at_retirement[real ? "pot_today_money" : "pot_nominal"].p90)}</div></div>
                <div className="card stat"><div className="label">Yearly income in retirement</div><div className="value num">{eur(pRes.at_retirement.total_income_today_money.p50, 0)}</div><div className="foot">Today's money, incl. State Pension</div></div>
                <div className="card stat"><div className="label">Tax-free lump sum</div><div className="value num">{eur(pRes.at_retirement.lump_sum_today_money.p50, 0)}</div><div className="foot">Today's money, after lump-sum tax</div></div>
                <div className="card stat"><div className="label">Chance of hitting your goal</div><div className={`value num ${pRes.at_retirement.chance_of_meeting_target >= 0.7 ? "pos" : pRes.at_retirement.chance_of_meeting_target >= 0.4 ? "" : "neg"}`}>{pRes.at_retirement.chance_of_meeting_target == null ? "—" : pct(pRes.at_retirement.chance_of_meeting_target, 0)}</div><div className="foot">{eur(p.target_income, 0)} a year</div></div>
              </div>
              <div className="card card-pad">
                <div className="card-head"><div><h2>Your pension pot over time</h2><div className="hint">Line: the middle outcome. Dark band: half of outcomes. Light band: 9 in 10. Dashed: what you and your employer paid in.</div></div></div>
                <FanChart rows={pRes.years} xKey="age" real={real} />
              </div>
              <div className="grid two">
                <div className="card card-pad">
                  <div className="card-head"><h2>What it costs you</h2></div>
                  <div className="kv"><span>You pay in (to {p.retirement_age})</span><b className="num">{eur(pRes.totals.employee, 0)}</b></div>
                  <div className="kv"><span>Tax relief you get back</span><b className="num pos">{eur(pRes.totals.tax_relief, 0)}</b></div>
                  <div className="kv"><span>Real cost to you</span><b className="num">{eur(pRes.totals.net_cost_to_you, 0)}</b></div>
                  <div className="kv"><span>Employer pays in</span><b className="num pos">{eur(pRes.totals.employer, 0)}</b></div>
                  <div className="kv"><span>Your tax rate for relief</span><b>{pct(pRes.marginal_rate, 0)}</b></div>
                </div>
                <div className="card card-pad">
                  <div className="card-head"><h2>In retirement (today's money)</h2></div>
                  <div className="kv"><span>From your pension (drawn to age {p.drawdown_to_age})</span><b className="num">{eur(pRes.at_retirement.arf_income_today_money.p50, 0)}/yr</b></div>
                  <div className="kv"><span>State Pension</span><b className="num">{eur(pRes.at_retirement.state_pension, 0)}/yr</b></div>
                  <div className="kv"><span>Share of final salary replaced</span><b>{pct(pRes.at_retirement.replacement_ratio_median, 0)}</b></div>
                  {pRes.at_retirement.bridge_years_before_state_pension > 0 && <Notice warn>Retiring at {p.retirement_age} leaves {pRes.at_retirement.bridge_years_before_state_pension} years before the State Pension starts at 66. Income before then comes only from your own savings.</Notice>}
                  {pRes.at_retirement.chance_over_sft > 0.05 && <Notice warn>There's a {pct(pRes.at_retirement.chance_over_sft, 0)} chance your pot exceeds the Standard Fund Threshold ({eur(pRes.at_retirement.sft_limit, 0)}), where extra tax applies.</Notice>}
                </div>
              </div>
            </>}
          </div>
        </div>
      ) : (
        <div className="grid sim-grid">
          <div className="card card-pad stack">
            <div className="form" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Field label="Starting amount"><input className="input num" type="number" value={inv.initial} onChange={(e) => setIk("initial")(Number(e.target.value))} /></Field>
              <Field label="Monthly"><input className="input num" type="number" value={inv.monthly} onChange={(e) => setIk("monthly")(Number(e.target.value))} /></Field>
            </div>
            <Slider label="Years" value={inv.years} onChange={setIk("years")} min={1} max={45} fmt={(v) => `${v} years`} />
            <Field label="How it's taxed">
              <select className="select" value={inv.tax_regime} onChange={(e) => setIk("tax_regime")(e.target.value)}>
                <option value="exit_tax">ETF / fund: 38% exit tax + deemed disposal</option>
                <option value="cgt">Shares: 33% CGT on sale</option>
                <option value="gross">Inside a pension: no tax on growth</option>
                <option value="deposit">Deposit account: 33% DIRT</option>
              </select>
            </Field>
            <Field label="Risk rating">
              <select className="select" onChange={(e) => applySri(setInv)(Number(e.target.value))} defaultValue="">
                <option value="" disabled>Pick 1–7</option>
                {Object.entries(sri).map(([n, a]) => <option key={n} value={n}>{n} — {a.return}% growth, {a.volatility}% swings</option>)}
              </select>
            </Field>
            <Slider label="Expected growth (%)" value={inv.expected_return} onChange={setIk("expected_return")} min={0} max={12} step={0.1} fmt={(v) => `${v}% a year before fees`} />
            <Slider label="Volatility (%)" value={inv.volatility} onChange={setIk("volatility")} min={0} max={35} step={0.5} fmt={(v) => `±${v}% typical year`} />
            <Slider label="Fees (%)" value={inv.annual_fee} onChange={setIk("annual_fee")} min={0} max={2} step={0.01} fmt={(v) => `${v}% a year`} />
            {inv.tax_regime === "deposit" && <Slider label="Deposit rate (%)" value={inv.deposit_rate} onChange={setIk("deposit_rate")} min={0} max={6} step={0.1} fmt={(v) => `${v}% AER`} />}
            <button className="btn" onClick={() => setInv(defaults.data.investment)}>Reset to my numbers</button>
          </div>
          <div className="stack">
            {iErr && <ErrorBox error={iErr} />}
            {iRes && <>
              <div className="grid stats" style={{ marginBottom: 0 }}>
                <div className="card stat"><div className="label">After tax, if sold</div><div className="value num">{eur((real ? iRes.final_today_money : iRes.final).p50, 0)}</div><div className="foot num">Likely {compact((real ? iRes.final_today_money : iRes.final).p10)}–{compact((real ? iRes.final_today_money : iRes.final).p90)}</div></div>
                <div className="card stat"><div className="label">You pay in</div><div className="value num">{eur(iRes.total_contributed, 0)}</div></div>
                <div className="card stat"><div className="label">Tax paid along the way</div><div className="value num">{eur(iRes.median_tax_paid_along_the_way, 0)}</div><div className="foot">{inv.tax_regime === "exit_tax" ? "Deemed disposals every 8 years" : inv.tax_regime === "deposit" ? "DIRT on interest" : "None before selling"}</div></div>
                <div className="card stat"><div className="label">Chance of ending with less than you paid in</div><div className="value num">{pct(iRes.chance_of_loss, 0)}</div></div>
              </div>
              <div className="card card-pad">
                <div className="card-head"><div><h2>Value after tax over time</h2><div className="hint">What you'd have if you sold that year, after Irish tax.</div></div></div>
                <FanChart rows={iRes.years} xKey="year" real={real} />
              </div>
              <div className="card card-pad">
                <div className="card-head"><div><h2>Same money, different wrappers</h2><div className="hint">Median result after tax in future euros, same markets and contributions. Pension figure is before drawdown tax, and the money is locked until at least 60.</div></div></div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart layout="vertical" data={[
                    { n: "Inside a pension", v: iRes.compare_wrappers.gross.median_after_tax },
                    { n: "Shares (CGT)", v: iRes.compare_wrappers.cgt.median_after_tax },
                    { n: "ETF (exit tax)", v: iRes.compare_wrappers.exit_tax.median_after_tax },
                    { n: "Deposit (DIRT)", v: iRes.compare_wrappers.deposit.median_after_tax },
                  ]} margin={{ left: 10, right: 30 }}>
                    <XAxis type="number" tickFormatter={compact} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="n" width={120} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v) => eur(v, 0)} />
                    <Bar dataKey="v" radius={[0, 6, 6, 0]} isAnimationActive={false}>
                      {["#1E8E3E", "#2F6FDB", C.accent, "#9CA3AF"].map((c) => <Cell key={c} fill={c} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>}
          </div>
        </div>
      )}
      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>Projections use random yearly returns with the growth and volatility you set. They're estimates to compare choices, not predictions or advice. Irish tax rules are for 2026 and can change.</p>
    </>
  );
}
