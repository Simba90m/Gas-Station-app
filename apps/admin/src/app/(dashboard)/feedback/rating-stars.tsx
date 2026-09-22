import { cn } from "@/lib/cn";

/** Plain unicode stars — no icon library in this app (see apps/admin/package.json). */
export function RatingStars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 tracking-tight", className)} aria-label={`${rating} out of 5 stars`}>
      <span aria-hidden="true" className="text-amber-500">
        {"★".repeat(rating)}
        <span className="text-slate-300">{"★".repeat(5 - rating)}</span>
      </span>
      <span className="text-slate-500">{rating}/5</span>
    </span>
  );
}
