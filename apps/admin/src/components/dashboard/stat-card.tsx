import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface StatCardProps {
  label: string;
  /** null means "not enough data yet" — per the brief, never fabricate a fake number. */
  value: number | string | null;
  /** Routes to the card's real existing module — omitted where no such page exists yet (never a fake/placeholder route). */
  href?: string;
  /** Shown as a red pill next to the label when > 0 — only for counts that genuinely need the owner's attention. */
  badge?: number;
}

export function StatCard({ label, value, href, badge }: StatCardProps) {
  const content = (
    <Card className={href ? "p-4 transition-shadow hover:shadow-md" : "p-4"}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-slate-500">{label}</div>
        {Boolean(badge) && <Badge tone="red">{badge}</Badge>}
      </div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">
        {value === null ? (
          <span className="text-base font-normal text-slate-400">Not enough data</span>
        ) : (
          value
        )}
      </div>
    </Card>
  );

  if (!href) return content;

  return (
    <Link href={href} className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
      {content}
    </Link>
  );
}
