const STYLES = {
  Valid: { badge: "bg-emerald-50 text-emerald-800 ring-emerald-600/20", dot: "bg-emerald-500" },
  Expired: { badge: "bg-amber-50 text-amber-800 ring-amber-600/20", dot: "bg-amber-500" },
  Revoked: { badge: "bg-red-50 text-red-800 ring-red-600/20", dot: "bg-red-500" },
};

const UNKNOWN = {
  badge: "bg-slate-100 text-slate-700 ring-slate-500/20",
  dot: "bg-slate-400",
};

export default function StatusBadge({ status }) {
  const style = STYLES[status] || UNKNOWN;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${style.badge}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {status || "Unknown"}
    </span>
  );
}
