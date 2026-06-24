import { useCallback, useState } from "react";

// click-to-sort state: same key toggles asc/desc; a new key starts at desc
export function useSort(defaultKey, defaultDir = "desc") {
  const [sort, setSort] = useState({ key: defaultKey, dir: defaultDir });
  const onSort = useCallback((key) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  }, []);
  return { sort, onSort };
}
