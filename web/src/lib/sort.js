// Pure stable sort by accessor(row, key) → value; nulls/NaN always last.
export function sortRows(rows, accessor, sort) {
  const dir = sort.dir === "asc" ? 1 : -1;
  const isNull = (v) => v == null || (typeof v === "number" && Number.isNaN(v));
  return rows
    .map((r, i) => [r, i])
    .sort(([a, ai], [b, bi]) => {
      const va = accessor(a, sort.key), vb = accessor(b, sort.key);
      const na = isNull(va), nb = isNull(vb);
      if (na && nb) return ai - bi;
      if (na) return 1;            // nulls last, regardless of direction
      if (nb) return -1;
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return ai - bi;              // stable
    })
    .map(([r]) => r);
}
