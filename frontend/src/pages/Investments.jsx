import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { api } from "../api";
import { eur, eurSigned, fmtDate, pct, colorFor } from "../format";
import { useApi, useApp, PageHead, Stat, Modal, Field, Empty, Loading, ErrorBox, NumInput, Notice } from "../components/ui";

const REGIMES = { exit_tax: "Exit tax 38% + deemed disposal (Irish/EU funds & ETFs)", cgt: "CGT 33% (shares, some non-EU funds)", pension: "Inside a pension (tax-free growth)", none: "Not taxed / other" };

export default function Investments() {
  const { toast, meta, bump } = useApp();
  const holdings = useApi("/api/holdings");
  const accounts = useApi("/api/accounts");
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  if (holdings.error) return <ErrorBox error={holdings.error} />;
  if (!holdings.data || !accounts.data) return <Loading />;
  const hs = holdings.data;
  const invAccounts = accounts.data.filter((a) => ["brokerage", "pension"].includes(a.type));
  const value = hs.reduce((s, h) => s + h.value, 0);
  const cost = hs.reduce((s, h) => s + h.cost_basis, 0);
  const upcoming = hs.filter((h) => h.next_deemed_disposal).sort((a, b) => a.next_deemed_disposal.localeCompare(b.next_deemed_disposal));
  const refresh = async () => {
    setBusy(true);
    try { const r = await api.post("/api/prices/refresh"); toast(`Updated ${r.updated.length} prices${r.failed.length ? `, ${r.failed.length} failed` : ""}`); holdings.reload(); bump(); }
    catch (e) { toast(e.message); } finally { setBusy(false); }
  };
  const byAccount = invAccounts.map((a) => ({ name: a.name, value: hs.filter((h) => h.account_id === a.id).reduce((s, h) => s + h.value, 0) })).filter((x) => x.value > 0);
  return (
    <>
      <PageHead title="Investments" sub="ETFs, shares and funds, including the funds inside your pensions">
        {!meta?.offline && <button className="btn" onClick={refresh} disabled={busy}><RefreshCw />{busy ? "Updating…" : "Update prices"}</button>}
        <button className="btn primary" onClick={() => setEditing({})}><Plus />Add holding</button>
      </PageHead>
      {!hs.length ? <div className="card"><Empty title="No holdings yet" action={<button className="btn primary" onClick={() => setEditing({})}><Plus />Add holding</button>}>
        Add an investment account (e.g. Trading 212, Degiro) on the Accounts page, then add what you hold. Give it a ticker like VWCE.DE and PIFA can fetch prices.</Empty></div> : <>
        <div className="grid stats">
          <Stat label="Value" value={eur(value)} />
          <Stat label="Gain / loss" value={eurSigned(value - cost)} tone={value >= cost ? "pos" : "neg"} foot={cost ? pct(value / cost - 1) : ""} />
          <Stat label="Paid in" value={eur(cost)} />
          <Stat label="Next deemed disposal" value={upcoming[0] ? fmtDate(upcoming[0].next_deemed_disposal) : "None"} foot={upcoming[0] ? `${upcoming[0].name.slice(0, 28)} · ~${eur(upcoming[0].deemed_disposal_tax_estimate, 0)} tax` : "No exit-tax holdings with dates"} />
        </div>
        <div className="grid split">
          <div className="card card-pad">
            <div className="card-head"><h2>Holdings</h2></div>
            <div className="table-wrap"><table className="simple-table">
              <thead><tr><th>Holding</th><th className="r">Units</th><th className="r">Price</th><th className="r">Value</th><th className="r">Gain</th></tr></thead>
              <tbody>{hs.map((h) => (
                <tr key={h.id} className="clickable" onClick={() => setEditing(h)}>
                  <td><div style={{ fontWeight: 550 }}>{h.name}</div><div className="muted" style={{ fontSize: 12 }}>{h.symbol || h.isin || "No ticker"} · {h.account_name} · {h.tax_regime === "exit_tax" ? "Exit tax" : h.tax_regime === "cgt" ? "CGT" : h.tax_regime === "pension" ? "Pension" : "Other"}</div></td>
                  <td className="r num">{h.units.toLocaleString("en-IE", { maximumFractionDigits: 3 })}</td>
                  <td className="r num">{eur(h.price, 2)}<div className="muted" style={{ fontSize: 11 }}>{h.price_date ? fmtDate(h.price_date, { day: "numeric", month: "short" }) : ""}</div></td>
                  <td className="r num" style={{ fontWeight: 600 }}>{eur(h.value)}</td>
                  <td className={`r num ${h.gain >= 0 ? "pos" : "neg"}`}>{eurSigned(h.gain)}<div style={{ fontSize: 11 }}>{h.gain_pct != null ? `${h.gain_pct}%` : ""}</div></td>
                </tr>))}</tbody>
            </table></div>
          </div>
          <div className="stack">
            <div className="card card-pad">
              <div className="card-head"><h2>By account</h2></div>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart><Pie data={byAccount} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="95%" stroke="none" isAnimationActive={false}>
                  {byAccount.map((a) => <Cell key={a.name} fill={colorFor(a.name)} />)}</Pie><Tooltip formatter={(v) => eur(v)} /></PieChart>
              </ResponsiveContainer>
              {byAccount.map((a) => <div key={a.name} className="kv"><span style={{ display: "flex", gap: 6, alignItems: "center" }}><span className="dot" style={{ background: colorFor(a.name) }} />{a.name}</span><b className="num">{eur(a.value)}</b></div>)}
            </div>
            <div className="card card-pad">
              <div className="card-head"><h2>Irish tax on these holdings</h2></div>
              <p className="ink2" style={{ margin: "0 0 8px", fontSize: 13 }}>Irish and EU-domiciled ETFs (ISINs starting IE or LU) pay 38% exit tax on gains, and every 8 years you're taxed as if you sold. Direct shares pay 33% CGT with €1,270 a year tax-free. You must declare and pay these yourself on your Form 11 or 12.</p>
              {upcoming.slice(0, 4).map((h) => <div key={h.id} className="kv"><span>{h.name.slice(0, 32)}</span><span className="num">{fmtDate(h.next_deemed_disposal)}</span></div>)}
            </div>
          </div>
        </div>
      </>}
      {editing && <HoldingModal holding={editing} accounts={invAccounts} onClose={() => setEditing(null)} onSaved={(m) => { setEditing(null); toast(m); holdings.reload(); bump(); }} />}
    </>
  );
}

function HoldingModal({ holding, accounts, onClose, onSaved }) {
  const isNew = !holding.id;
  const [f, setF] = useState({ account_id: holding.account_id || accounts[0]?.id, name: holding.name || "", symbol: holding.symbol || "", isin: holding.isin || "",
    units: holding.units ?? "", cost_basis: holding.cost_basis ?? "", price: holding.price ?? "", tax_regime: holding.tax_regime || "exit_tax",
    purchase_date: holding.purchase_date || "", sri: holding.sri || 5, asset_class: holding.asset_class || "equity" });
  const [err, setErr] = useState(null);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? v.target.value : v }));
  const acc = accounts.find((a) => a.id === Number(f.account_id));
  const save = async () => {
    const body = { ...f, account_id: Number(f.account_id), units: Number(f.units) || 0, cost_basis: Number(f.cost_basis) || 0, price: Number(f.price) || 0,
      sri: Number(f.sri), purchase_date: f.purchase_date || null, tax_regime: acc?.type === "pension" ? "pension" : f.tax_regime };
    try { if (isNew) await api.post("/api/holdings", body); else await api.put(`/api/holdings/${holding.id}`, body); onSaved(isNew ? "Holding added" : "Holding saved"); }
    catch (e) { setErr(e.message); }
  };
  const del = async () => { if (confirm("Delete this holding?")) { await api.del(`/api/holdings/${holding.id}`); onSaved("Holding deleted"); } };
  if (!accounts.length) return <Modal title="Add holding" onClose={onClose}><Notice>First add an investment account or pension on the Accounts page.</Notice></Modal>;
  return (
    <Modal title={isNew ? "Add holding" : holding.name} onClose={onClose}
      footer={<>{!isNew && <button className="btn danger" onClick={del}><Trash2 />Delete</button>}<div className="right"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>{isNew ? "Add holding" : "Save"}</button></div></>}>
      {err && <><Notice warn>{err}</Notice><br /></>}
      <div className="form">
        <Field label="Account"><select className="select" value={f.account_id} onChange={set("account_id")}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <Field label="Name"><input className="input" value={f.name} onChange={set("name")} placeholder="Vanguard FTSE All-World" /></Field>
        <Field label="Ticker (optional)" help="Yahoo Finance format: VWCE.DE, CSPX.AS, IWDA.AS, AAPL"><input className="input" value={f.symbol} onChange={set("symbol")} /></Field>
        <Field label="ISIN (optional)"><input className="input" value={f.isin} onChange={set("isin")} placeholder="IE00BK5BQT80" /></Field>
        <Field label="Units held"><NumInput value={f.units} onChange={set("units")} /></Field>
        <Field label="Price per unit (€)" help="Updated automatically if there's a ticker"><NumInput value={f.price} onChange={set("price")} /></Field>
        <Field label="Total paid (€)"><NumInput value={f.cost_basis} onChange={set("cost_basis")} /></Field>
        <Field label="First bought" help="Used for the 8-year deemed disposal date"><input className="input" type="date" value={f.purchase_date || ""} onChange={set("purchase_date")} /></Field>
        {acc?.type !== "pension" && <Field label="How it's taxed" full><select className="select" value={f.tax_regime} onChange={set("tax_regime")}>{Object.entries(REGIMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>}
        <Field label="Risk rating (1–7)"><select className="select" value={f.sri} onChange={set("sri")}>{[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n}>{n}</option>)}</select></Field>
      </div>
    </Modal>
  );
}
