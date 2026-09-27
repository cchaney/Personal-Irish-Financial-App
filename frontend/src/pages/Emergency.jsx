import { useEffect, useState } from "react";
import { ShieldCheck, PenLine, Wallet, CalendarRange, Target } from "lucide-react";
import { api } from "../api";
import { eur } from "../format";
import { useApi, useApp, PageHead, Stat, Loading, ErrorBox, NumInput, Notice } from "../components/ui";

export default function Emergency() {
  const { toast, bump, go } = useApp();
  const { data, error, reload } = useApi("/api/emergency");
  const [f, setF] = useState(null);
  useEffect(() => { if (data) setF({ ...data.config, target: data.config.target ?? "" }); }, [data]);
  if (error) return <ErrorBox error={error} />;
  if (!data || !f) return <Loading />;

  const monthly = data.average_monthly_spending;
  const suggested = Math.round(monthly * (Number(f.months) || 3));
  const accounts = data.accounts;
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? v.target.value : v }));
  const save = async () => {
    const body = {
      source: f.source, months: Number(f.months) || 3,
      amount: f.source === "manual" ? Number(f.amount) || 0 : 0,
      account_id: f.source === "account" ? Number(f.account_id) || null : null,
      target: f.target === "" || f.target == null ? null : Number(f.target),
    };
    if (body.source === "account" && !body.account_id) return toast("Choose which account holds your emergency fund");
    await api.put("/api/settings/emergency", body);
    toast("Emergency fund saved"); reload(); bump();
  };
  const balanceFoot = data.linked_account ? `from ${data.linked_account.name}` : data.balance ? "entered by you" : "nothing recorded yet";
  const targetFoot = data.target ? "set by you" : data.configured ? `${data.config.months} months of spending` : "no target set";

  return (
    <>
      <PageHead title="Emergency fund" sub="Money set aside for the unexpected: job loss, car repairs, a boiler that gives up. It's kept separate from the spare cash PIFA suggests investing, because this money isn't meant to be invested." />
      <div className="grid three" style={{ marginBottom: 14 }}>
        <Stat label="Current balance" value={eur(data.balance)} foot={balanceFoot} />
        <Stat label="Target" value={data.effective_target ? eur(data.effective_target, 0) : "—"} foot={targetFoot} />
        <Stat label="Coverage" value={data.coverage_months != null ? `${data.coverage_months} months` : "—"}
          foot={monthly ? `at avg. ${eur(monthly, 0)}/month` : "import transactions to calculate"} />
      </div>
      {data.configured && data.effective_target > 0 && (
        <div className="card card-pad" style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span className="ink2">{data.balance >= data.effective_target ? "Target reached" : `${eur(data.effective_target - data.balance, 0)} to go`}</span>
            <b className="num">{Math.round((data.progress || 0) * 100)}%</b>
          </div>
          <div className="progress"><div style={{ width: `${Math.min(100, (data.progress || 0) * 100)}%` }} /></div>
        </div>
      )}

      <div className="card card-pad">
        <div className="setup-head">
          <span className="card-icon"><ShieldCheck /></span>
          <div><h2>Setup</h2><p>Where the balance comes from and what the target is</p></div>
        </div>
        <div className="field"><label>Source of the balance</label></div>
        <div className="choices">
          <button className={`choice ${f.source === "manual" ? "on" : ""}`} onClick={() => setF({ ...f, source: "manual" })}>
            <PenLine /><span className="t">Enter the amount yourself</span>
            <span className="d">For reserves PIFA can't see: savings at another bank, a credit union, cash, State Savings.</span>
          </button>
          <button className={`choice ${f.source === "account" ? "on" : ""}`} onClick={() => setF({ ...f, source: "account", account_id: f.account_id || accounts.find((a) => a.value > 0)?.id })}>
            <Wallet /><span className="t">Assign an account</span>
            <span className="d">The balance comes from one of your accounts automatically, and isn't counted as spare cash.</span>
          </button>
        </div>

        <div className="form">
          {f.source === "manual" ? (
            <div className="field"><label>Current balance (€)</label><NumInput value={f.amount} onChange={set("amount")} placeholder="10,000" /></div>
          ) : (
            <div className="field"><label>Account</label>
              {accounts.length ? (
                <select className="select" value={f.account_id || ""} onChange={set("account_id")}>
                  <option value="">Choose an account…</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} — {eur(a.value, 0)}</option>)}
                </select>
              ) : <Notice>No cash accounts yet. <button className="btn ghost" style={{ padding: 0, color: "var(--accent-ink)" }} onClick={() => go("accounts")}>Add one</button></Notice>}
            </div>
          )}
          <div />
          <div className="field"><label style={{ display: "flex", gap: 6, alignItems: "center" }}><CalendarRange size={14} />Months of expenses to cover</label>
            <select className="select" value={f.months} onChange={(e) => setF({ ...f, months: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5, 6, 9, 12].map((m) => <option key={m} value={m}>{m} month{m > 1 ? "s" : ""}</option>)}
            </select>
          </div>
          <div className="field"><label style={{ display: "flex", gap: 6, alignItems: "center" }}><Target size={14} />Target amount (€)</label>
            <NumInput value={f.target} onChange={set("target")} placeholder={suggested ? suggested.toLocaleString("en-IE") : "10,000"} />
          </div>
        </div>

        {monthly > 0 && (
          <div className="suggest num">
            Suggested from your spending: {eur(suggested, 0)} ({f.months} × {eur(monthly, 0)}) — <button onClick={() => setF({ ...f, target: suggested })}>use this</button>
          </div>
        )}
        {!monthly && <div style={{ height: 16 }} />}
        <button className="btn primary" onClick={save}>Save</button>
        <p className="muted" style={{ fontSize: 12, margin: "14px 0 0" }}>Common advice is 3 months of spending if your income is steady, 6 or more if you're self-employed, have dependants or a single income. Keep it instant-access. State Savings accounts are DIRT-free.</p>
      </div>
    </>
  );
}
