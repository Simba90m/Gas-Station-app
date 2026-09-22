import { StatCard } from "@/components/dashboard/stat-card";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { getDashboardMetrics, getRecentActivity } from "./get-dashboard-metrics";

export default async function DashboardPage() {
  const [metrics, recentActivity] = await Promise.all([getDashboardMetrics(), getRecentActivity()]);

  return (
    <div>
      <h1 className="text-lg font-semibold text-slate-900">Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">Today, across all stations you have access to.</p>

      {metrics.errors.length > 0 && (
        <p role="alert" className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Couldn&apos;t load: {metrics.errors.join(", ")}. The figures below may be incomplete.
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total stations" value={metrics.totalStations} href="/stations" />
        <StatCard label="Active employees" value={metrics.activeEmployees} href="/employees" />
        <StatCard label="Today's bookings" value={metrics.todaysBookings} href="/bookings" />
        <StatCard label="Completed today" value={metrics.completedToday} href="/bookings" />
        {/* Open complaints/Active offers have no dedicated admin page yet — the brief is explicit that this
            pass must not invent placeholder routes, so these two stay informational-only, same as today. */}
        <StatCard label="Open complaints" value={metrics.openComplaints} badge={metrics.openComplaints ?? undefined} />
        <StatCard label="Active offers" value={metrics.activeOffers} />
        <StatCard label="Queue size" value={metrics.queueSize} href="/bookings" badge={metrics.queueSize ?? undefined} />
        <StatCard
          label="Average rating"
          value={metrics.averageRating !== null ? metrics.averageRating.toFixed(1) : null}
          href="/feedback"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <QuickActions />
        <RecentActivity items={recentActivity} />
      </div>
    </div>
  );
}
