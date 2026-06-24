import { useState } from "react";
import { fMoney, fR, cls } from "../lib/format.js";

// Hand-drawn SVG equity curve (no chart lib) — ported from blotter.html renderEquity().
export default function EquityChart({ series, mode }) {
  const [hover, setHover] = useState(null);
  const { pts, base } = series;
  const W = 1000, H = 300, pad = { l: 62, r: 14, t: 16, b: 26 };
  const money = mode === "dollar";

  if (!pts.length) {
    return (
      <div className="chartwrap">
        <svg className="eqchart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <text x={W / 2} y={H / 2} fill="#647580" fontSize="14" textAnchor="middle" fontFamily="system-ui">
            No closed trades in this period yet.
          </text>
        </svg>
      </div>
    );
  }

  const ys = pts.map((p) => p.val);
  let lo = Math.min(base, ...ys), hi = Math.max(base, ...ys);
  if (lo === hi) { lo -= 1; hi += 1; }
  const padY = (hi - lo) * 0.12 || 1; lo -= padY; hi += padY;

  const nn = pts.length;
  const X = (i) => pad.l + (nn === 1 ? (W - pad.l - pad.r) / 2 : (i / (nn - 1)) * (W - pad.l - pad.r));
  const Y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const fmtY = (v) => money
    ? (Math.abs(v) >= 1000 ? "$" + (v / 1000).toFixed(v % 1000 ? 1 : 0) + "k" : "$" + v.toFixed(0))
    : v.toFixed(1) + "R";

  const grid = [];
  for (let g = 0; g <= 4; g++) {
    const v = lo + (hi - lo) * g / 4, y = Y(v);
    grid.push(<line key={"gl" + g} x1={pad.l} y1={y.toFixed(1)} x2={W - pad.r} y2={y.toFixed(1)} stroke="#202B32" strokeWidth="1" />);
    grid.push(<text key={"gt" + g} x={pad.l - 8} y={(y + 4).toFixed(1)} fill="#647580" fontSize="11" textAnchor="end" fontFamily="ui-monospace,monospace">{fmtY(v)}</text>);
  }
  const yBase = Y(base);

  let dpath = "";
  pts.forEach((pt, i) => { dpath += (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(pt.val).toFixed(1) + " "; });
  const apath = "M" + X(0).toFixed(1) + " " + yBase.toFixed(1) + " " + dpath.slice(1) + "L" + X(nn - 1).toFixed(1) + " " + yBase.toFixed(1) + " Z";

  const xIdx = nn > 2 ? [0, Math.floor((nn - 1) / 2), nn - 1] : nn > 1 ? [0, nn - 1] : [0];

  return (
    <div className="chartwrap">
      <svg className="eqchart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="eqfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#C9A14A" stopOpacity="0.20" />
            <stop offset="100%" stopColor="#C9A14A" stopOpacity="0" />
          </linearGradient>
        </defs>
        {grid}
        <line x1={pad.l} y1={yBase.toFixed(1)} x2={W - pad.r} y2={yBase.toFixed(1)} stroke="#3a4a54" strokeWidth="1" strokeDasharray="4 4" />
        <path d={apath} fill="url(#eqfill)" />
        <path d={dpath} fill="none" stroke="#C9A14A" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((pt, i) => (
          <circle key={i} cx={X(i).toFixed(1)} cy={Y(pt.val).toFixed(1)} r="3.2" fill="#C9A14A" stroke="#0E1418" strokeWidth="1.5"
            style={{ cursor: "pointer" }} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        ))}
        {xIdx.map((i) => (
          <text key={"x" + i} x={X(i).toFixed(1)} y={H - 7} fill="#647580" fontSize="10.5" textAnchor="middle" fontFamily="ui-monospace,monospace">
            {pts[i].date.slice(5)}
          </text>
        ))}
      </svg>
      {hover != null && (
        <div className="eqtip" style={{ left: `${X(hover) / 10}%`, top: `${Y(pts[hover].val) / 3}%`, opacity: 1 }}>
          <div className="d">{pts[hover].date}</div>
          <span className={"num " + (money ? cls(pts[hover].val - base) : cls(pts[hover].val))}>
            {money ? fMoney(pts[hover].val) : fR(pts[hover].val)}
          </span>
        </div>
      )}
    </div>
  );
}
