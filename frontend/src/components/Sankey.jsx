import { eur, pct } from "../format";

/**
 * Three-column Sankey: income sources → Income → expense groups (+ Savings).
 * Hand-built SVG so labels, colours and spacing match the rest of the app.
 */
export default function Sankey({ data, height = 380 }) {
  const W = 900, H = height, nodeW = 10, padY = 10;
  const income = data.income || 0;
  const expenses = data.expenses || 0;
  const saved = Math.max(0, income - expenses);
  const shortfall = Math.max(0, expenses - income);
  const left = [...data.sources.map((s) => ({ ...s, color: "#1FA971" }))];
  if (shortfall > 0) left.push({ name: "From savings", amount: shortfall, color: "#DC4C3E" });
  const right = [];
  if (saved > 0) right.push({ name: "Savings", amount: saved, color: "#34B27B" });
  data.groups.forEach((g) => right.push({ name: g.name, amount: g.amount, color: g.color }));
  const total = Math.max(income + shortfall, expenses + saved, 1);
  const usable = H - 40;

  const layout = (items, x, gapBudget) => {
    const gap = items.length > 1 ? Math.min(14, gapBudget / (items.length - 1)) : 0;
    const scale = (usable - gap * (items.length - 1)) / total;
    let y = 20;
    return items.map((it) => {
      const h = Math.max(2, it.amount * scale);
      const node = { ...it, x, y, h };
      y += Math.max(h + gap, 30);
      return node;
    });
  };
  const L = layout(left, 150, 60);
  const R = layout(right, W - 180, 110);
  const midScale = (usable - 0) / total;
  const mid = { x: W / 2 - nodeW / 2, y: 20, h: (income + shortfall) * midScale };

  const link = (x0, y0, h0, x1, y1, h1, color, key) => {
    const c = (x0 + x1) / 2;
    const d = `M${x0},${y0} C${c},${y0} ${c},${y1} ${x1},${y1} L${x1},${y1 + h1} C${c},${y1 + h1} ${c},${y0 + h0} ${x0},${y0 + h0} Z`;
    return <path key={key} d={d} fill={color} opacity={0.28} />;
  };

  let midInY = mid.y;
  const leftLinks = L.map((n, i) => {
    const h = n.amount * midScale;
    const el = link(n.x + nodeW, n.y, n.h, mid.x, midInY, h, n.color, "l" + i);
    midInY += h;
    return el;
  });
  let midOutY = mid.y;
  const rightLinks = R.map((n, i) => {
    const h = n.amount * midScale;
    const el = link(mid.x + nodeW, midOutY, h, n.x, n.y, n.h, n.color, "r" + i);
    midOutY += h;
    return el;
  });

  const base = income + shortfall || 1;
  const fullH = Math.max(H, ...R.map((n) => n.y + n.h + 24), ...L.map((n) => n.y + n.h + 24));
  return (
    <svg viewBox={`0 0 ${W} ${fullH}`} width="100%" role="img" aria-label="Where the money went">
      {leftLinks}{rightLinks}
      {L.map((n) => (
        <g key={"ln" + n.name}>
          <rect x={n.x} y={n.y} width={nodeW} height={n.h} rx={2} fill={n.color} />
          <text className="sankey-label" x={n.x - 8} y={n.y + n.h / 2 - 2} textAnchor="end">{n.name.length > 22 ? n.name.slice(0, 21) + "…" : n.name}</text>
          <text className="sankey-sub num" x={n.x - 8} y={n.y + n.h / 2 + 11} textAnchor="end">{eur(n.amount)} ({pct(n.amount / base)})</text>
        </g>
      ))}
      <rect x={mid.x} y={mid.y} width={nodeW} height={mid.h} rx={2} fill="#1FA971" />
      <text className="sankey-label" x={mid.x + nodeW / 2} y={12} textAnchor="middle">Income {eur(income)}</text>
      {R.map((n) => (
        <g key={"rn" + n.name}>
          <rect x={n.x} y={n.y} width={nodeW} height={n.h} rx={2} fill={n.color} />
          <text className="sankey-label" x={n.x + nodeW + 8} y={n.y + n.h / 2 - 2}>{n.name}</text>
          <text className="sankey-sub num" x={n.x + nodeW + 8} y={n.y + n.h / 2 + 11}>{eur(n.amount)} ({pct(n.amount / base)})</text>
        </g>
      ))}
    </svg>
  );
}
