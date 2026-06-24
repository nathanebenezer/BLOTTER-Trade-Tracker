import { TAG_GROUPS } from "../lib/filter.js";

const PRESETS = [
  ["all", "All"], ["ytd", "YTD"], ["month", "This month"],
  ["lastmonth", "Last month"], ["30", "30d"], ["custom", "Custom"],
];
const GROUP_LABELS = { setups: "Setups", tactics: "Tactics", mistakes: "Mistakes", edges: "Edges" };

function Seg({ value, options, onChange }) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button key={v} className={v === value ? "on" : ""} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export default function FilterBar({ filter, setFilter, tagGroups }) {
  const update = (patch) => setFilter((f) => ({ ...f, ...patch }));
  const toggleTag = (grp, id) =>
    setFilter((f) => {
      const cur = f.tags[grp] || [];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      return { ...f, tags: { ...f.tags, [grp]: next } };
    });

  const anyTags = TAG_GROUPS.some((g) => (tagGroups?.[g] || []).length > 0);

  return (
    <div className="band">
      <div className="grp">
        <span className="lbl">Period</span>
        <Seg value={filter.preset} options={PRESETS} onChange={(v) => update({ preset: v })} />
      </div>

      {filter.preset === "custom" && (
        <div className="grp">
          <input type="date" value={filter.dateFrom} onChange={(e) => update({ dateFrom: e.target.value })} />
          <span style={{ color: "var(--txt-3)" }}>→</span>
          <input type="date" value={filter.dateTo} onChange={(e) => update({ dateTo: e.target.value })} />
        </div>
      )}

      <div className="grp">
        <span className="lbl">Direction</span>
        <Seg
          value={filter.direction}
          options={[["all", "All"], ["long", "Long"], ["short", "Short"]]}
          onChange={(v) => update({ direction: v })}
        />
      </div>

      <div className="grp">
        <span className="lbl">Result</span>
        <Seg
          value={filter.result}
          options={[["all", "All"], ["win", "Wins"], ["loss", "Losses"]]}
          onChange={(v) => update({ result: v })}
        />
      </div>

      <div className="spacer" />
      <input
        type="text"
        placeholder="Search ticker…"
        value={filter.symbol}
        onChange={(e) => update({ symbol: e.target.value })}
        style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, padding: "7px 11px", fontSize: 13, width: 150 }}
      />

      {anyTags && (
        <div className="tagfilter">
          {TAG_GROUPS.map((g) => {
            const tags = tagGroups?.[g] || [];
            if (!tags.length) return null;
            const sel = filter.tags[g] || [];
            return (
              <div key={g} className="tfgroup">
                <span className="lbl">{GROUP_LABELS[g]}</span>
                {tags.map((tg) => (
                  <span
                    key={tg.id}
                    className={"tag" + (sel.includes(tg.id) ? " sel" : "")}
                    onClick={() => toggleTag(g, tg.id)}
                  >
                    {tg.name}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
