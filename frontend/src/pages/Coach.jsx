import { useEffect, useRef, useState } from "react";
import { Send, Lightbulb, TriangleAlert, CircleCheck, Sparkles, Eye } from "lucide-react";
import { api } from "../api";
import { eur } from "../format";
import { useApi, useApp, PageHead, Loading, ErrorBox, Notice, Modal } from "../components/ui";

const PAGE_NAMES = { emergency: "Emergency fund", loans: "Loans", accounts: "Accounts", pensions: "Pensions", spending: "Spending", simulator: "Simulator", investments: "Investments" };
const ICONS = { act: Lightbulb, watch: TriangleAlert, good: CircleCheck };
const PROMPTS = [
  "Where could I save €200 a month?",
  "Should I top up my pension or pay off debt first?",
  "Am I on track for retirement?",
  "Is my cash earning enough, and what should I do with it?",
  "Review my subscriptions and recurring bills",
];

export function InsightList({ items, compact }) {
  const { go } = useApp();
  if (!items.length) return <p className="muted">Add accounts and transactions and PIFA will point out where you can do better.</p>;
  return items.map((i) => {
    const Icon = ICONS[i.tone];
    return (
      <div key={i.id} className={`insight ${i.tone}`}>
        <div className="ic"><Icon /></div>
        <div>
          <h3>{i.title}</h3>
          {!compact && <p>{i.detail}</p>}
          <button className="btn ghost" style={{ padding: "4px 0", color: "var(--accent-ink)" }} onClick={() => go(i.page)}>Go to {PAGE_NAMES[i.page] || i.page}</button>
        </div>
        {i.value ? <div className="worth num">{eur(i.value, 0)}<small>a year</small></div> : <div />}
      </div>
    );
  });
}

export default function Coach() {
  const { go } = useApp();
  const ins = useApi("/api/insights");
  const status = useApi("/api/ai/status");
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [ctx, setCtx] = useState(null);
  const logRef = useRef(null);
  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, [msgs, busy]);

  const send = async (content) => {
    const c = (content ?? text).trim();
    if (!c || busy) return;
    const next = [...msgs, { role: "user", content: c }];
    setMsgs(next); setText(""); setBusy(true); setErr(null);
    try { const r = await api.post("/api/ai/chat", { messages: next }); setMsgs([...next, { role: "assistant", content: r.reply }]); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const s = status.data;
  return (
    <>
      <PageHead title="AI coach" sub="Rule-based checks run on your data automatically. Ask the AI anything about your money for tailored suggestions.">
        <button className="btn" onClick={() => api.get("/api/ai/context").then(setCtx)}><Eye />See what the AI sees</button>
      </PageHead>
      <div className="grid split">
        <div className="card card-pad">
          <div className="card-head"><div><h2><Sparkles size={15} style={{ verticalAlign: -2 }} /> Ask about your money</h2>
            <div className="hint">{s ? (s.provider === "none" ? "AI is off" : `${s.provider === "anthropic" ? "Claude (cloud)" : s.provider === "ollama" ? "Ollama (on this computer)" : "Local AI server"}${s.ready ? "" : " — not ready"}`) : "Checking…"}</div></div></div>
          {s && !s.ready ? (
            <Notice warn>{s.detail} <button className="btn ghost" style={{ padding: 0, color: "var(--accent-ink)" }} onClick={() => go("settings")}>Set up AI in Settings</button></Notice>
          ) : (
            <div className="chat">
              <div className="chat-log" ref={logRef}>
                {!msgs.length && <>
                  <p className="muted" style={{ margin: 0 }}>The coach sees a summary of your accounts, spending, pensions, investments and debts, plus the checks on the right. {s?.local ? "Everything stays on your machine." : "A summary is sent to Anthropic's API when you ask."}</p>
                  <div className="suggestions">{PROMPTS.map((pr) => <button key={pr} className="chip" onClick={() => send(pr)}>{pr}</button>)}</div>
                </>}
                {msgs.map((m, i) => <div key={i} className={`msg ${m.role}`}>{m.content}</div>)}
                {busy && <div className="msg assistant muted">Thinking…</div>}
                {err && <Notice warn>{err}</Notice>}
              </div>
              <div className="chat-input">
                <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. How much should I keep in my emergency fund?"
                  onKeyDown={(e) => e.key === "Enter" && send()} aria-label="Message" />
                <button className="btn primary" onClick={() => send()} disabled={busy || !text.trim()}><Send />Send</button>
              </div>
            </div>
          )}
          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>AI answers can be wrong and aren't regulated financial advice. For pensions transfers, mortgages or large investments, speak to a Qualified Financial Adviser.</p>
        </div>
        <div className="card card-pad">
          <div className="card-head"><div><h2>Where you could do better</h2><div className="hint">Worked out from your data. No AI needed.</div></div></div>
          {ins.error ? <ErrorBox error={ins.error} /> : !ins.data ? <Loading /> : <InsightList items={ins.data.insights} />}
        </div>
      </div>
      {ctx && <Modal wide title="What gets sent to the AI" onClose={() => setCtx(null)}>
        <Notice>This is the full snapshot included with each question. Turn off merchant names in Settings → AI to share less.</Notice>
        <pre style={{ fontSize: 11.5, overflowX: "auto", background: "var(--subtle)", padding: 12, borderRadius: 8 }}>{JSON.stringify(ctx, null, 2)}</pre>
      </Modal>}
    </>
  );
}
