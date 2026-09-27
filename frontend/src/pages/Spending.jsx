import { useMemo, useState } from "react";
import { C } from "../theme";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { eur, compact, monthLabel } from "../format";
import { useApi, useApp, PageHead, PeriodPicker, periodParams, Stat, Seg, BarList, Empty, Loading, ErrorBox } from "../components/ui";

export default function Spending() {
  const { period, go } = useApp();
  const { data, error, loading } = useApi("/api/reports/spending", periodParams(period));
  const [by, setBy] = useState("groups");
  const [picked, setPicked] = useState([]);
  const trendKeys = useMemo(() => {
    if (!data) return [];
    const all = data.groups.map((g) => g.name);
    return picked.length && by === "groups" ? all.filter((g) => picked.includes(g)) : all;
  }, [data, picked, by]);
  if (error) return <ErrorBox error={error} />;
  if (loading && !data) return <Loading />;
  const rows = data[by] || [];
  const colorMap = data.group_colors;
  return (
    <>
      <PageHead title="Spending" sub="By group, category and merchant"><PeriodPicker /></PageHead>
      {!data.total ? <div className="card"><Empty title="No spending in this period">Pick a different period or import transactions.</Empty></div> : <>
        <div className="grid stats">
          <Stat label="Total spending" dot="#DC4C3E" value={eur(data.total)} />
          <Stat label="Average per month" value={eur(data.average_per_month)} />
          <Stat label="Largest group" value={data.largest_group?.name} foot={`${((data.largest_group?.share || 0) * 100).toFixed(1)}% of spending`} />
          <Stat label="Transactions" value={data.transactions} />
        </div>
        <div className="card card-pad" style={{ marginBottom: 14 }}>
          <div className="card-head"><h2>Spending breakdown</h2>
            <Seg options={[["groups", "Groups"], ["categories", "Categories"], ["merchants", "Merchants"]]} value={by} onChange={(v) => { setBy(v); setPicked([]); }} /></div>
          <div className="grid breakdown">
            <div style={{ position: "relative" }}>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={data.groups} dataKey="amount" nameKey="name" innerRadius="64%" outerRadius="96%" paddingAngle={1.5} stroke="none" isAnimationActive={false}>
                    {data.groups.map((g) => <Cell key={g.name} fill={g.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => eur(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none", height: 240 }}>
                <div style={{ textAlign: "center" }}><div className="muted" style={{ fontSize: 12 }}>Total</div><div className="num" style={{ fontSize: 20, fontWeight: 650 }}>{eur(data.total, 0)}</div></div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", fontSize: 12, marginTop: 8 }}>
                {data.groups.map((g) => <span key={g.name} style={{ display: "flex", alignItems: "center", gap: 5 }}><span className="dot" style={{ background: g.color }} />{g.name}</span>)}
              </div>
            </div>
            <BarList rows={rows} total={data.total} max={by === "merchants" ? 20 : 16} selected={picked}
              onClick={(r) => {
                if (by === "groups") setPicked((p) => (p.includes(r.name) ? p.filter((x) => x !== r.name) : [...p, r.name]));
                else if (by === "categories") go("transactions", { category: r.name });
              }} />
          </div>
        </div>
        <div className="card card-pad">
          <div className="card-head"><div><h2>Spending trend</h2><div className="hint">Click groups in the breakdown to chart only those. Click a category to see its transactions.</div></div></div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.trend} margin={{ left: 4, right: 4 }}>
              <CartesianGrid vertical={false} stroke={C.grid} />
              <XAxis dataKey="month" tickFormatter={monthLabel} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={compact} tickLine={false} axisLine={false} width={48} />
              <Tooltip formatter={(v, n) => [eur(v), n]} labelFormatter={monthLabel} />
              {trendKeys.map((k) => <Bar key={k} dataKey={k} stackId="a" fill={colorMap[k] || "#9CA3AF"} isAnimationActive={false} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </>}
    </>
  );
}
