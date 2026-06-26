import { useState } from "react";

// Generic vertical bar chart with a zero baseline; bars colored by sign.
//   bars: [{ label, value, sub? }]
//   fmt:  formats a value for the axis / labels / tooltip
// No chart lib — same hand-drawn SVG approach as EquityChart.
const POS = "#3fb389", NEG = "#e0654e";

export default function BarChart({ bars, fmt = (v) => String(v), height = 300 }) {
  const [hover, setHover] = useState(null);
  const W = 1000, H = height, pad = { l: 62, r: 14, t: 22, b: 30 };
  const innerW = W - pad.l - pad.r;

  const vals = bars.map((b) => b.value);
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const span = hi - lo || 1;
  hi += span * 0.15;
  if (lo < 0) lo -= span * 0.15;

  const Y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const y0 = Y(0);

  const slot = innerW / bars.length;
  const bw = Math.min(slot * 0.62, 90);
  const cx = (i) => pad.l + slot * i + slot / 2;

  // compact axis/label number ($1.2k) so 12 months don't crowd
  const compact = (v) => {
    if (typeof fmt === "function") {
      const f = fmt(v);
      if (f.length <= 7) return f;            // already short enough
    }
    const a = Math.abs(v);
    const s = v < 0 ? "-" : "";
    if (a >= 1000) return s + "$" + (a / 1000).toFixed(a % 1000 ? 1 : 0) + "k";
    return s + "$" + a.toFixed(0);
  };

  const grid = [];
  for (let g = 0; g <= 4; g++) {
    const v = lo + (hi - lo) * g / 4, y = Y(v);
    grid.push(<line key={"gl" + g} x1={pad.l} y1={y.toFixed(1)} x2={W - pad.r} y2={y.toFixed(1)} stroke="#202B32" strokeWidth="1" />);
    grid.push(<text key={"gt" + g} x={pad.l - 8} y={(y + 4).toFixed(1)} fill="#647580" fontSize="11" textAnchor="end" fontFamily="ui-monospace,monospace">{compact(v)}</text>);
  }

  return (
    <div className="chartwrap">
      <svg className="eqchart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {grid}
        <line x1={pad.l} y1={y0.toFixed(1)} x2={W - pad.r} y2={y0.toFixed(1)} stroke="#3a4a54" strokeWidth="1.2" />
        {bars.map((b, i) => {
          const yv = Y(b.value);
          const top = Math.min(yv, y0), h = Math.abs(yv - y0);
          const fill = b.value >= 0 ? POS : NEG;
          const lblY = b.value >= 0 ? top - 6 : top + h + 14;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
              <rect x={(cx(i) - bw / 2).toFixed(1)} y={top.toFixed(1)} width={bw.toFixed(1)} height={Math.max(h, 0.5).toFixed(1)}
                fill={fill} opacity={hover == null || hover === i ? 0.92 : 0.5} rx="2" />
              {b.value !== 0 && (
                <text x={cx(i).toFixed(1)} y={lblY.toFixed(1)} fill="#9fb0ba" fontSize="11" textAnchor="middle" fontFamily="ui-monospace,monospace">
                  {compact(b.value)}
                </text>
              )}
              <text x={cx(i).toFixed(1)} y={H - 9} fill="#647580" fontSize="11.5" textAnchor="middle" fontFamily="system-ui">{b.label}</text>
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="eqtip" style={{ left: `${cx(hover) / 10}%`, top: `${Y(Math.max(0, bars[hover].value)) / H * 100}%`, opacity: 1 }}>
          <div className="d">{bars[hover].label}</div>
          <span className="num">{fmt(bars[hover].value)}</span>
          {bars[hover].sub != null && <div className="d" style={{ marginTop: 2 }}>{bars[hover].sub}</div>}
        </div>
      )}
    </div>
  );
}
