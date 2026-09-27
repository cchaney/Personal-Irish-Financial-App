import { useMemo, useState } from "react";
import { Plus, Upload, Search, Check, Trash2 } from "lucide-react";
import { api } from "../api";
import { eur, fmtDate, iso } from "../format";
import { useApi, useApp, PageHead, PeriodPicker, periodParams, Modal, Field, Avatar, Empty, Notice, Loading, ErrorBox, NumInput } from "../components/ui";

export default function Transactions() {
  const { period, meta, toast, query, refreshCounts, bump } = useApp();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(query.status || "all");
  const [kind, setKind] = useState("all");
  const [accountId, setAccountId] = useState("");
  const [category, setCategory] = useState(query.category || "");
  const [selected, setSelected] = useState([]);
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);
  const accounts = useApi("/api/accounts");
  const params = { ...periodParams(period), q, status, kind, account_id: accountId, category, limit: 1000 };
  const { data, error, loading, reload } = useApi("/api/transactions", params);
  const accName = useMemo(() => Object.fromEntries((accounts.data || []).map((a) => [a.id, a.name])), [accounts.data]);

  const days = useMemo(() => {
    const out = [];
    (data?.items || []).forEach((t) => {
      const last = out[out.length - 1];
      if (last && last.date === t.date) { last.items.push(t); last.total += t.amount; }
      else out.push({ date: t.date, items: [t], total: t.amount });
    });
    return out;
  }, [data]);

  const refresh = () => { reload(); refreshCounts(); bump(); };
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const bulk = async (body) => {
    await api.post("/api/transactions/bulk", { ids: selected, ...body });
    toast(body.delete ? `Deleted ${selected.length}` : `Updated ${selected.length}`);
    setSelected([]); refresh();
  };
  const reviewAll = async () => {
    const ids = (data?.items || []).filter((t) => !t.reviewed).map((t) => t.id);
    if (!ids.length) return;
    await api.post("/api/transactions/bulk", { ids, reviewed: true });
    toast(`Marked ${ids.length} as reviewed`); refresh();
  };

  return (
    <>
      <PageHead title="Transactions" sub={data ? (
        <span className="num">{data.count} transactions · <span className="pos">{eur(data.total_in)} in</span> · {eur(Math.abs(data.total_out))} out
          {data.needs_review > 0 && <> · <span className="uncat">{data.needs_review} need review</span></>}</span>
      ) : " "}>
        <PeriodPicker />
      </PageHead>

      <div className="card">
        <div className="card-pad" style={{ paddingBottom: 10 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <Search size={15} style={{ position: "absolute", left: 10, top: 9, color: "var(--ink-3)" }} />
              <input className="input" style={{ paddingLeft: 32 }} placeholder="Search merchant, notes, category or amount" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <button className="btn" onClick={() => setImporting(true)}><Upload /><span className="hide-sm">Import CSV</span></button>
            <button className="btn primary" onClick={() => setEditing({})}><Plus /><span className="hide-sm">Add transaction</span></button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <div className="chips">
              {[["all", "All"], ["review", "Needs review"], ["uncategorised", "Uncategorised"]].map(([k, l]) => (
                <button key={k} className={`chip ${status === k ? "on" : ""}`} onClick={() => setStatus(k)}>{l}</button>
              ))}
            </div>
            <select className="select inline" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type">
              <option value="all">All types</option><option value="out">Money out</option><option value="in">Money in</option>
            </select>
            <select className="select inline" value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Account">
              <option value="">All accounts</option>
              {(accounts.data || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select className="select inline" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
              <option value="">All categories</option>
              {(meta?.categories || []).map((c) => <option key={c}>{c}</option>)}
            </select>
            {status === "review" && data?.needs_review > 0 && <button className="btn" onClick={reviewAll}><Check />Mark all reviewed</button>}
          </div>
          {selected.length > 0 && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
              <b className="num">{selected.length} selected</b>
              <button className="btn" onClick={() => bulk({ reviewed: true })}><Check />Mark reviewed</button>
              <select className="select inline" defaultValue="" onChange={(e) => e.target.value && bulk({ category: e.target.value })} aria-label="Set category">
                <option value="">Set category…</option>
                {(meta?.categories || []).map((c) => <option key={c}>{c}</option>)}
              </select>
              <button className="btn danger" onClick={() => confirm(`Delete ${selected.length} transactions?`) && bulk({ delete: true })}><Trash2 />Delete</button>
              <button className="btn ghost" onClick={() => setSelected([])}>Clear</button>
            </div>
          )}
        </div>

        {error && <div className="card-pad"><ErrorBox error={error} /></div>}
        {loading && !data ? <Loading /> : data && data.count === 0 ? (
          <Empty title="No transactions here" action={<button className="btn primary" onClick={() => setImporting(true)}><Upload />Import CSV</button>}>
            Export a CSV from your bank (AIB, Bank of Ireland, PTSB, Revolut, N26 and most others work) and import it, or change the period or filters above.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="tx-table">
              <thead><tr><th style={{ width: 34 }}></th><th>Merchant</th><th className="col-cat">Category</th><th className="col-account">Account</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
              <tbody>
                {days.map((d) => [
                  <tr key={"d" + d.date} className="day"><td colSpan={2}>{fmtDate(d.date)}</td><td className="col-cat" /><td className="col-account" /><td className="amount num">{eur(d.total)}</td></tr>,
                  ...d.items.map((t) => (
                    <tr key={t.id} className="row" onClick={() => setEditing(t)}>
                      <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.includes(t.id)} onChange={() => toggle(t.id)} aria-label="Select" /></td>
                      <td><div className="merchant"><span className={`review-dot ${t.reviewed ? "off" : ""}`} title={t.reviewed ? "" : "Needs review"} /><Avatar name={t.merchant || t.description} /><div style={{ minWidth: 0 }}><div className="name">{t.merchant || t.description}</div><div className={`show-sm ${["Uncategorised", "Other"].includes(t.category) ? "uncat" : "muted"}`} style={{ fontSize: 12 }}>{t.category}</div></div></div></td>
                      <td className={`col-cat ${["Uncategorised", "Other"].includes(t.category) ? "uncat" : ""}`}>{t.category}</td>
                      <td className="col-account ink2">{accName[t.account_id]}</td>
                      <td className={`amount num ${t.amount > 0 ? "pos" : ""}`}>{t.amount > 0 ? "+" : ""}{eur(t.amount)}</td>
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && <TxModal tx={editing} accounts={accounts.data || []} categories={meta?.categories || []}
        onClose={() => setEditing(null)} onSaved={(m) => { setEditing(null); toast(m); refresh(); }} />}
      {importing && <ImportModal accounts={accounts.data || []} onClose={() => setImporting(false)}
        onDone={(m) => { setImporting(false); toast(m); refresh(); }} />}
    </>
  );
}

function TxModal({ tx, accounts, categories, onClose, onSaved }) {
  const isNew = !tx.id;
  const [f, setF] = useState({
    date: tx.date || iso(new Date()), description: tx.description || "", merchant: tx.merchant || "",
    amount: tx.amount ?? "", category: tx.category || "", notes: tx.notes || "", account_id: tx.account_id || accounts[0]?.id,
    reviewed: tx.reviewed ?? true, create_rule: false,
  });
  const [err, setErr] = useState(null);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? (v.target.type === "checkbox" ? v.target.checked : v.target.value) : v }));
  const save = async () => {
    try {
      if (isNew) {
        await api.post("/api/transactions", { ...f, amount: Number(f.amount), account_id: Number(f.account_id), category: f.category || null, description: f.description || f.merchant });
        onSaved("Transaction added");
      } else {
        const r = await api.patch(`/api/transactions/${tx.id}`, { ...f, amount: Number(f.amount), account_id: Number(f.account_id), reviewed: true });
        onSaved(r.updated > 1 ? `Saved, and recategorised ${r.updated - 1} similar` : "Saved");
      }
    } catch (e) { setErr(e.message); }
  };
  const del = async () => { if (confirm("Delete this transaction?")) { await api.del(`/api/transactions/${tx.id}`); onSaved("Deleted"); } };
  if (!accounts.length) return <Modal title="Add transaction" onClose={onClose}><Notice>Add an account first on the Accounts page.</Notice></Modal>;
  return (
    <Modal title={isNew ? "Add transaction" : f.merchant || "Transaction"} onClose={onClose}
      footer={<>{!isNew && <button className="btn danger" onClick={del}><Trash2 />Delete</button>}
        <div className="right"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>{isNew ? "Add transaction" : "Save"}</button></div></>}>
      {err && <><Notice warn>{err}</Notice><br /></>}
      <div className="form">
        <Field label="Merchant"><input className="input" value={f.merchant} onChange={set("merchant")} /></Field>
        <Field label="Amount" help="Negative for money out"><NumInput value={f.amount} onChange={set("amount")} /></Field>
        <Field label="Date"><input className="input" type="date" value={f.date} onChange={set("date")} /></Field>
        <Field label="Account"><select className="select" value={f.account_id} onChange={set("account_id")}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <Field label="Category" full>
          <select className="select" value={f.category} onChange={set("category")}>
            {isNew && <option value="">Pick automatically</option>}
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        {!isNew && <label className="full" style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
          <input type="checkbox" checked={f.create_rule} onChange={set("create_rule")} />Always categorise {f.merchant || "this merchant"} this way
        </label>}
        <Field label="Notes" full><input className="input" value={f.notes} onChange={set("notes")} /></Field>
        {!isNew && <div className="full muted" style={{ fontSize: 12 }}>Bank description: {tx.description}</div>}
      </div>
    </Modal>
  );
}

const MAP_FIELDS = [["date", "Date"], ["description", "Description"], ["amount", "Amount (single column)"], ["debit", "Money out"], ["credit", "Money in"], ["fee", "Fee"], ["state", "Status"]];

function ImportModal({ accounts, onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [accountId, setAccountId] = useState(accounts.find((a) => ["current", "savings", "credit_card"].includes(a.type))?.id || accounts[0]?.id);
  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async (fl) => {
    setFile(fl); setErr(null);
    const fd = new FormData(); fd.append("file", fl);
    try { const p = await api.form("/api/import/preview", fd); setPreview(p); setMapping(p.mapping); } catch (e) { setErr(e.message); }
  };
  const run = async () => {
    setBusy(true);
    const fd = new FormData(); fd.append("file", file); fd.append("account_id", accountId); fd.append("mapping", JSON.stringify(mapping));
    try {
      const r = await api.form("/api/import", fd);
      onDone(`Imported ${r.added}${r.skipped_duplicates ? `, skipped ${r.skipped_duplicates} already imported` : ""}. New rows are marked "needs review".`);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  if (!accounts.length) return <Modal title="Import CSV" onClose={onClose}><Notice>Add the account these transactions belong to first (Accounts page).</Notice></Modal>;
  return (
    <Modal wide title="Import transactions from CSV" onClose={onClose}
      footer={<div className="right"><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!preview || busy} onClick={run}>{busy ? "Importing…" : `Import ${preview ? preview.rows : ""} rows`}</button></div>}>
      <div className="form">
        <Field label="Import into"><select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <Field label="CSV file" help="Your bank's export. Duplicates are skipped, so overlapping files are fine.">
          <input className="input" type="file" accept=".csv,text/csv" onChange={(e) => e.target.files[0] && load(e.target.files[0])} />
        </Field>
      </div>
      {err && <><br /><Notice warn>{err}</Notice></>}
      {preview && mapping && (
        <>
          <br />
          <Notice>Detected <b>{mapping.preset}</b> format. Check the columns below match, then import.</Notice>
          <br />
          <div className="form" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
            {MAP_FIELDS.map(([k, l]) => (
              <Field key={k} label={l}>
                <select className="select" value={mapping[k] || ""} onChange={(e) => setMapping({ ...mapping, [k]: e.target.value || null })}>
                  <option value="">—</option>{preview.headers.map((h) => <option key={h}>{h}</option>)}
                </select>
              </Field>
            ))}
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, alignSelf: "end" }}>
              <input type="checkbox" checked={!!mapping.flip_sign} onChange={(e) => setMapping({ ...mapping, flip_sign: e.target.checked })} />Flip signs (credit card exports)
            </label>
          </div>
          <br />
          <div className="table-wrap"><table className="simple-table">
            <thead><tr><th>Date</th><th>Merchant</th><th>Category</th><th className="r">Amount</th></tr></thead>
            <tbody>{preview.sample.map((s, i) => <tr key={i}><td>{s.date}</td><td>{s.merchant}</td><td>{s.category}</td><td className={`r num ${s.amount > 0 ? "pos" : ""}`}>{eur(s.amount)}</td></tr>)}</tbody>
          </table></div>
          <p className="muted" style={{ fontSize: 12 }}>Preview uses the detected columns. Changing a column updates the import, not this preview.</p>
          {preview.warnings.length > 0 && <Notice warn>{preview.warnings.join(" · ")}</Notice>}
        </>
      )}
    </Modal>
  );
}
