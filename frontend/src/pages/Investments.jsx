import { useState } from "react";
import { Plus, RefreshCw, Trash2, Upload, Download } from "lucide-react";
import { api } from "../api";
import { eur, eurSigned, fmtDate } from "../format";
import { useApi, useApp, PageHead, Modal, Field, Empty, Loading, ErrorBox, NumInput, Notice } from "../components/ui";

const TYPES = { etf: "ETF", stock: "Stock", crypto: "Crypto", fund: "Fund", bond: "Bond", other: "Other" };
const TYPE_TAX = { etf: "exit_tax", fund: "exit_tax", stock: "cgt", crypto: "cgt", bond: "cgt", other: "none" };
const REGIMES = { exit_tax: "Exit tax 38% + deemed disposal every 8 years", cgt: "Capital gains tax 33%", pension: "Inside a pension (no tax on growth)", none: "Not taxed / other" };
const pctText = (n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)} %`;

export default function Investments() {
  const { toast, meta, bump } = useApp();
  const holdings = useApi("/api/holdings");
  const accounts = useApi("/api/accounts");
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false);
  if (holdings.error) return <ErrorBox error={holdings.error} />;
  if (!holdings.data || !accounts.data) return <Loading />;
  const hs = holdings.data;
  const invAccounts = accounts.data.filter((a) => ["brokerage", "pension"].includes(a.type));
  const value = hs.reduce((s, h) => s + h.value, 0);
  const cost = hs.reduce((s, h) => s + h.cost_basis, 0);
  const gain = value - cost;
  const manyAccounts = new Set(hs.map((h) => h.account_id)).size > 1;
  const upcoming = hs.filter((h) => h.next_deemed_disposal).sort((a, b) => a.next_deemed_disposal.localeCompare(b.next_deemed_disposal));
  const reload = () => { holdings.reload(); bump(); };
  const refresh = async () => {
    setBusy(true);
    try { const r = await api.post("/api/prices/refresh"); toast(`Updated ${r.updated.length} prices${r.failed.length ? `, ${r.failed.length} failed` : ""}`); reload(); }
    catch (e) { toast(e.message); } finally { setBusy(false); }
  };
  const remove = async (h) => {
    if (!confirm(`Remove ${h.name}?`)) return;
    await api.del(`/api/holdings/${h.id}`); toast("Position removed"); reload();
  };

  return (
    <>
      <PageHead title="Investments" sub={hs.length ? (
        <span className="num">Portfolio value <b style={{ color: "var(--ink)" }}>{eur(value, 0)}</b> · Cost basis {eur(cost, 0)} · <span className={gain >= 0 ? "pos" : "neg"}>{eurSigned(Math.round(gain))} ({cost ? pctText((value / cost - 1) * 100) : "—"})</span></span>
      ) : "ETFs, shares, crypto and the funds inside your pensions"}>
        {!meta?.offline && hs.length > 0 && <button className="btn" onClick={refresh} disabled={busy}><RefreshCw />{busy ? "Refreshing…" : "Refresh prices"}</button>}
        <button className="btn" onClick={() => setImporting(true)}><Upload />Import CSV</button>
        <button className="btn primary" onClick={() => setEditing({})}><Plus />Add position</button>
      </PageHead>

      {!hs.length ? (
        <div className="card"><Empty title="No positions yet" action={<button className="btn primary" onClick={() => setEditing({})}><Plus />Add position</button>}>
          Add an investment account (Trading 212, Degiro, Revolut…) on the Accounts page, then add what you hold, or import a CSV. With a ticker like VWCE.DE or BTC-EUR, PIFA can refresh prices for you.</Empty></div>
      ) : (
        <>
          <div className="card">
            <div className="table-wrap">
              <table className="simple-table">
                <thead><tr><th style={{ paddingLeft: 22 }}>Position</th><th className="hide-sm">Type</th><th className="r hide-sm">Units</th><th className="r hide-sm">Buy price</th><th className="r hide-sm">Price</th><th className="r">Value</th><th className="r">P/L</th><th className="hide-sm" style={{ width: 44 }} /></tr></thead>
                <tbody>
                  {hs.map((h) => (
                    <tr key={h.id} className="clickable" onClick={() => setEditing(h)}>
                      <td style={{ paddingLeft: 22 }}>
                        <div style={{ fontWeight: 550 }}>{h.name}</div>
                        <div className="muted" style={{ fontSize: 12 }}>{h.symbol || h.isin || "No ticker"}<span className="hide-sm">{manyAccounts ? ` · ${h.account_name}` : ""}</span></div>
                        <div className="show-sm" style={{ marginTop: 5 }}><span className={`type-badge ${h.type}`}>{TYPES[h.type] || "Other"}</span></div>
                      </td>
                      <td className="hide-sm"><span className={`type-badge ${h.type}`}>{TYPES[h.type] || "Other"}</span></td>
                      <td className="r num hide-sm">{h.units.toLocaleString("en-IE", { maximumFractionDigits: 4 })}</td>
                      <td className="r num muted hide-sm">{h.buy_price != null ? eur(h.buy_price) : "—"}</td>
                      <td className="r num hide-sm" title={h.price_date ? `Updated ${fmtDate(h.price_date)}` : ""}>{eur(h.price)}</td>
                      <td className="r num">{eur(h.value)}</td>
                      <td className={`r num ${h.gain >= 0 ? "pos" : "neg"}`} style={{ whiteSpace: "nowrap" }}>
                        {eurSigned(h.gain)} <br className="show-sm" /><span style={{ fontSize: 11, opacity: 0.8 }}>{h.gain_pct != null ? `(${pctText(h.gain_pct)})` : ""}</span>
                      </td>
                      <td className="hide-sm" onClick={(e) => e.stopPropagation()}><button className="icon-btn" aria-label={`Remove ${h.name}`} onClick={() => remove(h)}><Trash2 /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {upcoming.length > 0 && (
            <div className="card card-pad" style={{ marginTop: 14 }}>
              <div className="card-head"><div><h2>Irish tax to plan for</h2><div className="hint">Irish/EU ETFs are taxed as if sold every 8 years (deemed disposal) at 38%. Shares and crypto pay 33% CGT when sold.</div></div></div>
              {upcoming.slice(0, 5).map((h) => (
                <div key={h.id} className="kv"><span>{h.name}</span><span className="num">{fmtDate(h.next_deemed_disposal)} · ~{eur(h.deemed_disposal_tax_estimate, 0)} tax</span></div>
              ))}
            </div>
          )}
        </>
      )}
      {editing && <HoldingModal holding={editing} accounts={invAccounts} onClose={() => setEditing(null)} onSaved={(m) => { setEditing(null); toast(m); reload(); }} />}
      {importing && <ImportPositions accounts={invAccounts} onClose={() => setImporting(false)} onDone={(m) => { setImporting(false); toast(m); reload(); }} />}
    </>
  );
}

function HoldingModal({ holding, accounts, onClose, onSaved }) {
  const isNew = !holding.id;
  const initialType = holding.type || "etf";
  const [f, setF] = useState({
    account_id: holding.account_id || accounts.find((a) => a.type === "brokerage")?.id || accounts[0]?.id,
    name: holding.name || "", symbol: holding.symbol || "", isin: holding.isin || "", type: initialType,
    units: holding.units ?? "", buy_price: holding.buy_price ?? "", price: holding.price ?? "",
    tax_regime: holding.tax_regime || TYPE_TAX[initialType], purchase_date: holding.purchase_date || "", sri: holding.sri || 5,
  });
  const [err, setErr] = useState(null);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? v.target.value : v }));
  const acc = accounts.find((a) => a.id === Number(f.account_id));
  const setType = (e) => { const t = e.target.value; setF((s) => ({ ...s, type: t, tax_regime: TYPE_TAX[t] })); };
  const save = async () => {
    if (!f.name.trim()) return setErr("Give the position a name.");
    const units = Number(f.units) || 0;
    const body = {
      account_id: Number(f.account_id), name: f.name, symbol: f.symbol.trim(), isin: f.isin.trim(), asset_class: f.type,
      units, cost_basis: Math.round(units * (Number(f.buy_price) || 0) * 100) / 100, price: Number(f.price) || Number(f.buy_price) || 0,
      tax_regime: acc?.type === "pension" ? "pension" : f.tax_regime, purchase_date: f.purchase_date || null, sri: Number(f.sri),
    };
    try { if (isNew) await api.post("/api/holdings", body); else await api.put(`/api/holdings/${holding.id}`, body); onSaved(isNew ? "Position added" : "Position saved"); }
    catch (e) { setErr(e.message); }
  };
  if (!accounts.length) return <Modal title="Add position" onClose={onClose}><Notice>First add an investment account or pension on the Accounts page.</Notice></Modal>;
  return (
    <Modal title={isNew ? "Add position" : holding.name} onClose={onClose}
      footer={<div className="right"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>{isNew ? "Add position" : "Save"}</button></div>}>
      {err && <><Notice warn>{err}</Notice><br /></>}
      <div className="form">
        <Field label="Name" full><input className="input" value={f.name} onChange={set("name")} placeholder="iShares Core MSCI World" autoFocus /></Field>
        <Field label="Type"><select className="select" value={f.type} onChange={setType}>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Ticker" help="For price refresh: IWDA.AS, VWCE.DE, AAPL, BTC-EUR"><input className="input" value={f.symbol} onChange={set("symbol")} /></Field>
        <Field label="Units"><NumInput value={f.units} onChange={set("units")} /></Field>
        <Field label="Buy price per unit (€)" help="Your average price paid"><NumInput value={f.buy_price} onChange={set("buy_price")} /></Field>
        <Field label="Current price (€)" help="Filled in automatically on refresh if there's a ticker"><NumInput value={f.price} onChange={set("price")} /></Field>
        <Field label="Held in"><select className="select" value={f.account_id} onChange={set("account_id")}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <Field label="First bought" help="Used to work out the 8-year deemed disposal date"><input className="input" type="date" value={f.purchase_date || ""} onChange={set("purchase_date")} /></Field>
        <Field label="ISIN (optional)"><input className="input" value={f.isin} onChange={set("isin")} placeholder="IE00B4L5Y983" /></Field>
        {acc?.type !== "pension" && <Field label="How it's taxed" full help="Set from the type. Change it if yours differs, e.g. a non-EU ETF usually pays CGT instead.">
          <select className="select" value={f.tax_regime} onChange={set("tax_regime")}>{Object.entries(REGIMES).filter(([k]) => k !== "pension").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>}
      </div>
    </Modal>
  );
}

function ImportPositions({ accounts, onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [accountId, setAccountId] = useState(accounts.find((a) => a.type === "brokerage")?.id || accounts[0]?.id);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true); setErr(null);
    const fd = new FormData(); fd.append("file", file); fd.append("account_id", accountId);
    try { const r = await api.form("/api/holdings/import", fd); onDone(`Imported ${r.added} positions${r.warnings.length ? ` (${r.warnings.length} rows skipped)` : ""}`); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  if (!accounts.length) return <Modal title="Import positions" onClose={onClose}><Notice>First add an investment account on the Accounts page.</Notice></Modal>;
  return (
    <Modal title="Import positions from CSV" onClose={onClose}
      footer={<div className="right"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!file || busy} onClick={run}>{busy ? "Importing…" : "Import"}</button></div>}>
      {err && <><Notice warn>{err}</Notice><br /></>}
      <div className="form">
        <Field label="Held in"><select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <Field label="CSV file"><input className="input" type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files[0] || null)} /></Field>
      </div>
      <br />
      <Notice>Columns: name, ticker, type (etf / stock / crypto / fund), units, buy_price, and optionally price, purchase_date and isin. Most broker exports work if you rename the headers to match.</Notice>
      <br />
      <a className="btn" href="/api/holdings/template"><Download />Download template</a>
    </Modal>
  );
}
