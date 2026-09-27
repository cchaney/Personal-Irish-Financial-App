import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../api";
import { eur } from "../format";
import { useApi, useApp, PageHead, Modal, Field, Empty, Loading, ErrorBox, NumInput, Notice } from "../components/ui";

export const TYPE_LABELS = {
  current: "Current account", savings: "Savings", cash: "Cash", brokerage: "Investment account", pension: "Pension",
  property: "Property", other_asset: "Other asset", credit_card: "Credit card", loan: "Loan", mortgage: "Mortgage",
};
const ORDER = ["current", "savings", "cash", "brokerage", "pension", "property", "other_asset", "credit_card", "loan", "mortgage"];

export default function Accounts() {
  const { toast, bump } = useApp();
  const { data, error, loading, reload } = useApi("/api/accounts");
  const [editing, setEditing] = useState(null);
  if (error) return <ErrorBox error={error} />;
  if (loading && !data) return <Loading />;
  const byType = ORDER.map((t) => [t, data.filter((a) => a.type === t)]).filter(([, l]) => l.length);
  return (
    <>
      <PageHead title="Accounts" sub="Bank accounts, savings, investments, pensions, property and debts">
        <button className="btn primary" onClick={() => setEditing({})}><Plus />Add account</button>
      </PageHead>
      {!data.length ? <div className="card"><Empty title="Add your first account" action={<button className="btn primary" onClick={() => setEditing({})}><Plus />Add account</button>}>
        Start with your main current account so you can import transactions. Or load demo data from Settings to explore first.</Empty></div> :
        <div className="stack">
          {byType.map(([t, list]) => (
            <div key={t} className="card card-pad">
              <div className="card-head"><h2>{TYPE_LABELS[t]}</h2><b className="num">{eur(list.reduce((s, a) => s + a.value, 0))}</b></div>
              <table className="simple-table"><tbody>
                {list.map((a) => (
                  <tr key={a.id} className="clickable" onClick={() => setEditing(a)}>
                    <td style={{ width: "40%" }}><b style={{ fontWeight: 560 }}>{a.name}</b><div className="muted" style={{ fontSize: 12 }}>{a.institution}</div></td>
                    <td className="ink2 hide-sm">
                      {a.is_liability && a.interest_rate ? `${a.interest_rate}% APR · ${eur(a.min_payment, 0)}/month` : ""}
                      {a.type === "savings" && a.interest_rate ? `${a.interest_rate}% AER` : ""}
                      {a.holdings_count > 0 ? `${a.holdings_count} holdings` : ""}
                      {a.type === "pension" && a.meta?.fund_name ? `${a.meta.fund_name}${a.meta.sri ? ` · risk ${a.meta.sri}/7` : ""}` : ""}
                    </td>
                    <td className={`r num ${a.is_liability ? "neg" : ""}`} style={{ fontWeight: 600 }}>{a.is_liability ? "−" : ""}{eur(a.value)}</td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          ))}
        </div>}
      {editing && <AccountModal account={editing} onClose={() => setEditing(null)} onSaved={(m) => { setEditing(null); toast(m); reload(); bump(); }} />}
    </>
  );
}

export function AccountModal({ account, onClose, onSaved, defaultType }) {
  const { meta } = useApp();
  const isNew = !account.id;
  const [f, setF] = useState({
    name: account.name || "", type: account.type || defaultType || "current", institution: account.institution || "",
    balance: account.balance ?? 0, interest_rate: account.interest_rate ?? 0, min_payment: account.min_payment ?? 0,
    meta: { employee_pct: 5, employer_pct: 5, extra_monthly: 0, annual_fee_pct: 0.75, sri: 4, product_type: "occupational_dc", ...(account.meta || {}) },
  });
  const [err, setErr] = useState(null);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? v.target.value : v }));
  const setM = (k) => (v) => setF((s) => ({ ...s, meta: { ...s.meta, [k]: v?.target ? v.target.value : v } }));
  const liab = ["credit_card", "loan", "mortgage"].includes(f.type);
  const holdingsDriven = account.holdings_count > 0;
  const suggestions = f.type === "pension" ? meta?.pension_providers : f.type === "brokerage" ? meta?.brokers : meta?.banks;
  const save = async () => {
    if (!f.name.trim()) return setErr("Give the account a name.");
    const body = { ...f, balance: Number(f.balance) || 0, interest_rate: Number(f.interest_rate) || 0, min_payment: Number(f.min_payment) || 0 };
    if (f.type === "pension") body.meta = { ...f.meta, provider: f.institution };
    try {
      if (isNew) await api.post("/api/accounts", body); else await api.put(`/api/accounts/${account.id}`, body);
      onSaved(isNew ? "Account added" : "Account saved");
    } catch (e) { setErr(e.message); }
  };
  const del = async () => {
    if (confirm(`Delete ${account.name} and all its transactions and history?`)) { await api.del(`/api/accounts/${account.id}`); onSaved("Account deleted"); }
  };
  return (
    <Modal title={isNew ? "Add account" : account.name} onClose={onClose}
      footer={<>{!isNew && <button className="btn danger" onClick={del}><Trash2 />Delete</button>}
        <div className="right"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>{isNew ? "Add account" : "Save"}</button></div></>}>
      {err && <><Notice warn>{err}</Notice><br /></>}
      <div className="form">
        <Field label="Name"><input className="input" value={f.name} onChange={set("name")} placeholder="e.g. AIB Current" autoFocus /></Field>
        <Field label="Type"><select className="select" value={f.type} onChange={set("type")}>{ORDER.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}</select></Field>
        <Field label={f.type === "pension" ? "Provider" : "Institution"}>
          <input className="input" list="inst" value={f.institution} onChange={set("institution")} />
          <datalist id="inst">{(suggestions || []).map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label={liab ? "Amount owed" : f.type === "pension" ? "Current value" : "Balance"}
          help={holdingsDriven ? "Calculated from this account's holdings" : f.type === "pension" ? "From your latest statement or online portal" : ""}>
          <NumInput value={holdingsDriven ? account.value : f.balance} onChange={set("balance")} disabled={holdingsDriven} />
        </Field>
        {(liab || f.type === "savings") && <Field label={liab ? "Interest rate (APR %)" : "Interest rate (AER %)"}><NumInput value={f.interest_rate} onChange={set("interest_rate")} /></Field>}
        {liab && <Field label="Monthly repayment"><NumInput value={f.min_payment} onChange={set("min_payment")} /></Field>}
      </div>
      {f.type === "pension" && (
        <>
          <h3 style={{ fontSize: 14, margin: "20px 0 10px" }}>Pension details</h3>
          <div className="form">
            <Field label="Product"><select className="select" value={f.meta.product_type} onChange={setM("product_type")}>
              {Object.entries(meta?.pension_products || {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Fund name"><input className="input" value={f.meta.fund_name || ""} onChange={setM("fund_name")} placeholder="e.g. MAPS 4, Prisma 5" /></Field>
            <Field label="Fund risk rating (1–7)" help="The SRI number on your fund factsheet. Drives the simulator's growth assumptions.">
              <select className="select" value={f.meta.sri} onChange={(e) => setM("sri")(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n} — assumes {meta?.sri?.[n]?.return}% a year</option>)}</select></Field>
            <Field label="Annual management charge (%)"><NumInput value={f.meta.annual_fee_pct} onChange={setM("annual_fee_pct")} /></Field>
            {f.meta.product_type !== "auto_enrolment" ? <>
              <Field label="Your contribution (% of salary)"><NumInput value={f.meta.employee_pct} onChange={setM("employee_pct")} /></Field>
              <Field label="Employer contribution (% of salary)"><NumInput value={f.meta.employer_pct} onChange={setM("employer_pct")} /></Field>
              <Field label="Extra per month (AVC, €)" full><NumInput value={f.meta.extra_monthly} onChange={setM("extra_monthly")} /></Field>
            </> : <div className="full"><Notice>My Future Fund contributions are set by law (1.5% you, 1.5% employer, 0.5% State on salary up to €80,000 in 2026–2028), so PIFA calculates them from your salary in Settings.</Notice></div>}
          </div>
        </>
      )}
    </Modal>
  );
}
