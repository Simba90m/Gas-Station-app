import { Card } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  /** null means "not enough data yet" — per the brief, never fabricate a fake number. */
  value: number | string | null;
}

export function StatCard({ label, value }: StatCardProps) {
  return (
    <Card className="p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">
        {value === null ? (
          <span className="text-base font-normal text-slate-400">Not enough data</span>
        ) : (
          value
        )}
      </div>
    </Card>
  );
}
