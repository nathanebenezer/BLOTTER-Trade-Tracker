// Sortable table header cell — shows ▲/▼ on the active column.
export default function SortTh({ label, k, sort, onSort, className }) {
  const active = sort.key === k;
  return (
    <th className={(className || "") + " sortable" + (active ? " sorted" : "")} onClick={() => onSort(k)}>
      {label}{active ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
    </th>
  );
}
