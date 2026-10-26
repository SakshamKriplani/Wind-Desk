import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";

export interface Column<R> {
  key: string;
  header: ReactNode;
  align?: "left" | "right" | "center";
  width?: number | string;
  render: (row: R) => ReactNode;
  cellClass?: (row: R) => string | undefined;
}

export interface Group<R> {
  id: string;
  title: ReactNode;
  rows: R[];
  /** cells shown on the group header row, keyed by column key */
  summary?: Partial<Record<string, ReactNode>>;
}

interface Props<R> {
  columns: Column<R>[];
  groups: Group<R>[];
  rowKey: (r: R) => number | string;
  selected: number | string | null;
  onSelect: (key: number | string | null) => void;
  onActivate?: (r: R) => void;
  footer?: Partial<Record<string, ReactNode>>;
  /** hide group header rows when there is a single ungrouped list */
  flat?: boolean;
  caption?: string;
  maxHeight?: number | string;
  rowClass?: (r: R) => string | undefined;
}

/**
 * Dense ledger table. ↑ ↓ move the amber selection bar, Enter drills down, Space selects,
 * group headers collapse on click.
 */
export function TallyTable<R>({
  columns, groups, rowKey, selected, onSelect, onActivate, footer, flat, caption, maxHeight, rowClass,
}: Props<R>) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const wrap = useRef<HTMLDivElement>(null);
  const visible = groups.flatMap((g) => (collapsed[g.id] ? [] : g.rows));

  useEffect(() => {
    if (selected == null) return;
    // scroll inside the table only, never the page
    const box = wrap.current;
    const row = box?.querySelector<HTMLElement>(`[data-key="${selected}"]`);
    if (!box || !row) return;
    const head = box.querySelector("thead")?.getBoundingClientRect().height ?? 0;
    const foot = box.querySelector("tfoot")?.getBoundingClientRect().height ?? 0;
    const top = row.offsetTop - head;
    const bottom = row.offsetTop + row.offsetHeight - box.clientHeight + foot;
    if (box.scrollTop > top) box.scrollTop = top;
    else if (box.scrollTop < bottom) box.scrollTop = bottom;
  }, [selected]);

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    const i = visible.findIndex((r) => rowKey(r) === selected);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = e.key === "ArrowDown" ? Math.min(visible.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1);
      if (visible[next]) onSelect(rowKey(visible[next]));
    } else if (e.key === "Enter" && i >= 0) {
      e.preventDefault();
      onActivate?.(visible[i]);
    } else if (e.key === " ") {
      e.preventDefault();
      if (i < 0 && visible[0]) onSelect(rowKey(visible[0]));
    }
  };

  return (
    <div className="t-table-wrap" ref={wrap} style={{ maxHeight }} tabIndex={0} onKeyDown={onKey}
      aria-label={caption} role="region">
      <table className="t-table">
        {caption && <caption className="t-sr">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{ width: c.width, textAlign: c.align ?? "right" }}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g.id}>
              {!flat && (
                <tr className="t-group" onClick={() => setCollapsed((s) => ({ ...s, [g.id]: !s[g.id] }))}>
                  {columns.map((c, ci) => (
                    <td key={c.key} style={{ textAlign: c.align ?? "right" }}>
                      {ci === 0 ? (
                        <span className="t-group-title">
                          {collapsed[g.id] ? "▶" : "▼"} {g.title}
                        </span>
                      ) : g.summary?.[c.key]}
                    </td>
                  ))}
                </tr>
              )}
              {!collapsed[g.id] && g.rows.map((r) => {
                const k = rowKey(r);
                return (
                  <tr
                    key={k}
                    data-key={k}
                    className={`${k === selected ? "t-selected" : ""} ${rowClass?.(r) ?? ""}`}
                    onClick={() => onSelect(k)}
                    onDoubleClick={() => onActivate?.(r)}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={c.cellClass?.(r)} style={{ textAlign: c.align ?? "right" }}>
                        {c.render(r)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
        {footer && (
          <tfoot>
            <tr>
              {columns.map((c) => (
                <td key={c.key} style={{ textAlign: c.align ?? "right" }}>{footer[c.key]}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
