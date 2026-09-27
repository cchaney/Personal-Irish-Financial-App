import { useCallback, useEffect, useState, createContext, useContext } from "react";
import { ChevronLeft, ChevronRight, X, Info, TriangleAlert } from "lucide-react";
import { api } from "../api";
import { colorFor, iso, pct, eur } from "../format";

/* ---------- data hook */
export function useApi(url, params, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(params || {});
  const load = useCallback(() => {
    setLoading(true);
    return api.get(url, params).then((d) => { setData(d); setError(null); })
      .catch((e) => setError(e.message)).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, key, ...deps]);
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load, setData };
}

/* ---------- app context: period, meta, toast, navigation */
export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export const PRESETS = {
  this_month: "This month", last_month: "Last month", last_3: "Last 3 months",
  ytd: "Year to date", last_12: "Last 12 months", all: "All time",
};

export function presetRange(preset, today = new Date()) {
  const y = today.getFullYear(), m = today.getMonth();
  const s = (yy, mm) => new Date(yy, mm, 1);
  const e = (yy, mm) => new Date(yy, mm + 1, 0);
  switch (preset) {
    case "this_month": return { start: s(y, m), end: today };
    case "last_month": return { start: s(y, m - 1), end: e(y, m - 1) };
    case "last_3": return { start: s(y, m - 2), end: today };
    case "last_12": return { start: s(y, m - 11), end: today };
    case "all": return { start: new Date(2000, 0, 1), end: today };
    default: return { start: s(y, 0), end: today };
  }
}

export function shiftRange({ start, end }, dir) {
  const months = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1;
  const ns = new Date(start.getFullYear(), start.getMonth() + dir * months, 1);
  const ne = new Date(ns.getFullYear(), ns.getMonth() + months, 0);
  return { start: ns, end: ne };
}

export function PeriodPicker() {
  const { period, setPeriod } = useApp();
  const label = (d) => d.toLocaleDateString("en-IE", { month: "short", year: "numeric" });
  const same = period.start.getMonth() === period.end.getMonth() && period.start.getFullYear() === period.end.getFullYear();
  return (
    <div className="period">
      <div className="range">
        <button aria-label="Previous period" onClick={() => setPeriod({ preset: "custom", ...shiftRange(period, -1) })}><ChevronLeft size={16} /></button>
        <span className="num">{period.preset === "all" ? "All time" : same ? label(period.start) : `${label(period.start)} – ${label(period.end)}`}</span>
        <button aria-label="Next period" onClick={() => setPeriod({ preset: "custom", ...shiftRange(period, 1) })}><ChevronRight size={16} /></button>
      </div>
      <select className="select inline" value={period.preset in PRESETS ? period.preset : ""}
        onChange={(e) => setPeriod({ preset: e.target.value, ...presetRange(e.target.value) })} aria-label="Period">
        {!(period.preset in PRESETS) && <option value="">Custom</option>}
        {Object.entries(PRESETS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </div>
  );
}
export const periodParams = (p) => ({ start: iso(p.start), end: iso(p.end) });

/* ---------- small components */
export function PageHead({ title, sub, children }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{sub && <div className="sub">{sub}</div>}</div>
      <div className="head-actions">{children}</div>
    </div>
  );
}

export function Stat({ label, value, foot, dot, tone }) {
  return (
    <div className="card stat">
      <div className="label">{dot && <span className="dot" style={{ background: dot }} />}{label}</div>
      <div className={`value num ${tone || ""}`}>{value}</div>
      {foot && <div className="foot">{foot}</div>}
    </div>
  );
}

export function Seg({ options, value, onChange }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => {
        const [k, l] = Array.isArray(o) ? o : [o, o];
        return <button key={k} role="tab" aria-selected={value === k} className={value === k ? "on" : ""} onClick={() => onChange(k)}>{l}</button>;
      })}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h2>{title}</h2><button className="btn ghost icon" onClick={onClose} aria-label="Close"><X /></button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, help, children, full }) {
  return <div className={`field ${full ? "full" : ""}`}><label>{label}</label>{children}{help && <div className="help">{help}</div>}</div>;
}

export function Avatar({ name }) {
  const letter = (name || "?").replace(/[^A-Za-z0-9]/g, "").charAt(0).toUpperCase() || "?";
  return <span className="avatar" style={{ background: colorFor(name) }}>{letter}</span>;
}

export function Empty({ title, children, action }) {
  return <div className="empty"><h3>{title}</h3><p>{children}</p>{action}</div>;
}

export function Notice({ children, warn }) {
  return <div className={`notice ${warn ? "warn" : ""}`}>{warn ? <TriangleAlert /> : <Info />}<div>{children}</div></div>;
}

export function BarList({ rows, total, onClick, selected, max = 14 }) {
  const top = rows.slice(0, max);
  const denom = total || rows.reduce((s, r) => s + r.amount, 0) || 1;
  const biggest = Math.max(...top.map((r) => r.amount), 1);
  return (
    <div className="bar-list">
      {top.map((r) => (
        <div key={r.name} className={`bar-row ${onClick ? "clickable" : ""} ${selected && selected.length && !selected.includes(r.name) ? "dim" : ""}`}
          onClick={() => onClick && onClick(r)}>
          <div className="top">
            <span className="dot" style={{ background: r.color || "#9CA3AF" }} />
            <span className="name">{r.name}{r.group && r.group !== r.name && <span className="muted"> · {r.group}</span>}</span>
            <span className="amt num">{eur(r.amount)}</span>
            <span className="pct num">{pct(r.amount / denom)}</span>
          </div>
          <div className="track"><div className="fill" style={{ width: `${(r.amount / biggest) * 100}%`, background: r.color || "#9CA3AF" }} /></div>
        </div>
      ))}
    </div>
  );
}

export function Loading() {
  return <div className="empty muted">Loading…</div>;
}
export function ErrorBox({ error }) {
  return <Notice warn>{error}</Notice>;
}

export function NumInput({ value, onChange, step = "any", ...rest }) {
  return <input className="input num" type="number" step={step} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} {...rest} />;
}
