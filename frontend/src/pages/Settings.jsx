import { useEffect, useState } from "react";
import { Download, Upload, Trash2, Database, RefreshCw } from "lucide-react";
import { api } from "../api";
import { useApi, useApp, PageHead, Field, Loading, ErrorBox, Notice, NumInput } from "../components/ui";

export default function Settings() {
  const { toast, bump, go } = useApp();
  const { data, error, reload } = useApi("/api/settings");
  const rules = useApi("/api/rules");
  const [profile, setProfile] = useState(null);
  const [assump, setAssump] = useState(null);
  const [ai, setAi] = useState(null);
  const [status, setStatus] = useState(null);
  useEffect(() => { if (data) { setProfile(data.profile); setAssump(data.assumptions); setAi(data.ai); } }, [data]);
  if (error) return <ErrorBox error={error} />;
  if (!profile) return <Loading />;
  const sp = (k) => (v) => setProfile((s) => ({ ...s, [k]: v?.target ? v.target.value : v }));
  const sa = (k) => (v) => setAssump((s) => ({ ...s, [k]: v?.target ? v.target.value : v }));
  const sai = (k) => (v) => setAi((s) => ({ ...s, [k]: v?.target ? (v.target.type === "checkbox" ? v.target.checked : v.target.value) : v }));
  const save = async (key, body) => { await api.put(`/api/settings/${key}`, body); toast("Saved"); bump(); reload(); };
  const testAi = async () => { await api.put("/api/settings/ai", ai); setStatus(await api.get("/api/ai/status")); };
  const demo = async () => {
    if (!confirm("Load demo data? This replaces everything currently in PIFA.")) return;
    await api.post("/api/data/demo"); toast("Demo data loaded"); bump(); go("overview");
  };
  const clear = async () => {
    if (!confirm("Delete ALL your data? Export a backup first if you want to keep it.")) return;
    await api.post("/api/data/clear"); toast("All data deleted"); bump(); reload();
  };
  const restore = async (file) => {
    try {
      const body = JSON.parse(await file.text());
      if (!confirm("Restore this backup? It replaces everything currently in PIFA.")) return;
      await api.post("/api/data/restore", body); toast("Backup restored"); bump(); reload();
    } catch (e) { toast(e.message); }
  };
  return (
    <>
      <PageHead title="Settings" sub="Your details drive the pension, tax relief and simulator calculations" />
      <div className="stack">
        <div className="card card-pad">
          <div className="card-head"><h2>About you</h2></div>
          <div className="form">
            <Field label="Date of birth"><input className="input" type="date" value={profile.date_of_birth} onChange={sp("date_of_birth")} /></Field>
            <Field label="Gross salary (€ a year)" help="Before tax. Used for pension relief limits and contributions."><NumInput value={profile.gross_salary} onChange={sp("gross_salary")} /></Field>
            <Field label="Tax status"><select className="select" value={profile.tax_status} onChange={sp("tax_status")}>
              <option value="single">Single</option><option value="married_one_income">Married / civil partners, one income</option><option value="married_two_incomes">Married / civil partners, two incomes</option></select></Field>
            {profile.tax_status === "married_two_incomes" && <Field label="Partner's gross income"><NumInput value={profile.partner_income} onChange={sp("partner_income")} /></Field>}
            <Field label="Expected pay rises (% a year)"><NumInput value={profile.salary_growth} onChange={sp("salary_growth")} /></Field>
            <Field label="Planned retirement age"><NumInput value={profile.retirement_age} onChange={sp("retirement_age")} /></Field>
            <Field label="Retirement income goal (€ a year, today's money)" help="Including State Pension"><NumInput value={profile.target_retirement_income} onChange={sp("target_retirement_income")} /></Field>
            <Field label="Emergency fund target (months of spending)"><NumInput value={profile.emergency_months_target} onChange={sp("emergency_months_target")} /></Field>
          </div>
          <br /><button className="btn primary" onClick={() => save("profile", profile)}>Save details</button>
        </div>

        <div className="card card-pad">
          <div className="card-head"><h2>Assumptions</h2></div>
          <div className="form">
            <Field label="Inflation (% a year)"><NumInput value={assump.inflation} onChange={sa("inflation")} /></Field>
            <Field label="Cash savings rate (% AER)"><NumInput value={assump.cash_rate} onChange={sa("cash_rate")} /></Field>
            <Field label="Growth in retirement (% a year)" help="For your ARF after you retire"><NumInput value={assump.post_retirement_return} onChange={sa("post_retirement_return")} /></Field>
            <Field label="Plan income to last until age"><NumInput value={assump.drawdown_to_age} onChange={sa("drawdown_to_age")} /></Field>
          </div>
          <br /><button className="btn primary" onClick={() => save("assumptions", assump)}>Save assumptions</button>
        </div>

        <div className="card card-pad">
          <div className="card-head"><div><h2>AI coach</h2><div className="hint">Choose where the AI runs. Local options keep everything on your computer.</div></div></div>
          <div className="form">
            <Field label="AI provider" full><select className="select" value={ai.provider} onChange={sai("provider")}>
              <option value="none">Off — rule-based insights only</option>
              <option value="ollama">Ollama — local, private (recommended)</option>
              <option value="openai">Other local server (LM Studio, llama.cpp, Jan)</option>
              <option value="anthropic">Claude via Anthropic API — cloud, needs API key</option></select></Field>
            {ai.provider === "ollama" && <>
              <Field label="Ollama address" help="http://ollama:11434 if you started PIFA with the AI profile; http://host.docker.internal:11434 if Ollama runs on your computer"><input className="input" value={ai.ollama_url} onChange={sai("ollama_url")} /></Field>
              <Field label="Model" help="e.g. llama3.1:8b, qwen2.5:7b, mistral-nemo"><input className="input" value={ai.ollama_model} onChange={sai("ollama_model")} /></Field>
            </>}
            {ai.provider === "openai" && <>
              <Field label="Server address"><input className="input" value={ai.openai_base_url} onChange={sai("openai_base_url")} /></Field>
              <Field label="Model name"><input className="input" value={ai.openai_model} onChange={sai("openai_model")} /></Field>
            </>}
            {ai.provider === "anthropic" && <>
              <Field label="Model"><input className="input" value={ai.anthropic_model} onChange={sai("anthropic_model")} /></Field>
              <div className="full"><Notice warn>The API key is read from ANTHROPIC_API_KEY in your .env file, never stored in the database. With this option, a summary of your finances (no account numbers) is sent to Anthropic each time you ask a question.</Notice></div>
            </>}
            <label className="full" style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={ai.share_merchant_names} onChange={sai("share_merchant_names")} />Include merchant names and recurring payments in what the AI sees</label>
          </div>
          <br />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary" onClick={() => save("ai", ai)}>Save AI settings</button>
            <button className="btn" onClick={testAi}><RefreshCw />Save and test connection</button>
          </div>
          {status && <><br /><Notice warn={!status.ready}>{status.detail}{status.models?.length ? ` Available: ${status.models.slice(0, 8).join(", ")}` : ""}</Notice></>}
        </div>

        <div className="card card-pad">
          <div className="card-head"><div><h2>Categorisation rules</h2><div className="hint">Created when you tick "Always categorise…" on a transaction. These win over the built-in rules.</div></div>
            <button className="btn" onClick={async () => { const r = await api.post("/api/rules/apply"); toast(`Recategorised ${r.updated}`); bump(); }}>Re-run on unreviewed</button></div>
          {!rules.data?.length ? <p className="muted">No custom rules yet.</p> :
            <table className="simple-table"><thead><tr><th>If the merchant or description contains</th><th>Category</th><th /></tr></thead><tbody>
              {rules.data.map((r) => <tr key={r.id}><td>{r.pattern}</td><td>{r.category}</td><td className="r"><button className="btn ghost icon" aria-label="Delete rule" onClick={async () => { await api.del(`/api/rules/${r.id}`); rules.reload(); }}><Trash2 /></button></td></tr>)}
            </tbody></table>}
        </div>

        <div className="card card-pad">
          <div className="card-head"><div><h2>Your data</h2><div className="hint">Stored in one SQLite file in the Docker volume "pifa-data", on your computer only. Export a backup regularly.</div></div></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a className="btn" href="/api/data/export"><Download />Export backup</a>
            <label className="btn"><Upload />Restore backup<input type="file" accept="application/json" hidden onChange={(e) => e.target.files[0] && restore(e.target.files[0])} /></label>
            <button className="btn" onClick={demo}><Database />Load demo data</button>
            <button className="btn danger" onClick={clear}><Trash2 />Delete all data</button>
          </div>
        </div>

        <p className="muted" style={{ fontSize: 12 }}>PIFA is open-source software provided under the MIT licence, with no warranty. It is not financial, tax or pension advice. Irish tax figures are for 2026 — check revenue.ie and citizensinformation.ie for changes.</p>
      </div>
    </>
  );
}
