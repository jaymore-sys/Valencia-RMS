import { useIsPhone } from "./ReadMoreText";
import "./StatusFilterChips.css";

// Phones: "All / To Do / In Progress ..." chips above a stacked board, so one status can be
// picked instead of scrolling through every column. Renders nothing on desktop.
export default function StatusFilterChips({ columns, counts, value, onChange }) {
  const phone = useIsPhone();

  if (!phone) return null;

  const total = columns.reduce(
    (sum, column) => sum + (counts[column.key] || 0),
    0
  );

  return (
    <div className="rms-status-chips" role="tablist" aria-label="Filter by status">
      <button
        type="button"
        role="tab"
        aria-selected={value === "all"}
        className={value === "all" ? "active" : ""}
        onClick={() => onChange("all")}
      >
        All <b>{total}</b>
      </button>

      {columns.map((column) => (
        <button
          key={column.key}
          type="button"
          role="tab"
          aria-selected={value === column.key}
          className={value === column.key ? "active" : ""}
          onClick={() => onChange(column.key)}
        >
          {column.label} <b>{counts[column.key] || 0}</b>
        </button>
      ))}
    </div>
  );
}
