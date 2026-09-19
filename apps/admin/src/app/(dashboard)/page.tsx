import { StatCard } from "@/components/dashboard/stat-card";
import { getDashboardMetrics } from "./get-dashboard-metrics";

export default async function DashboardPage() {
  const metrics = await getDashboardMetrics();

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
        <StatCard label="Total stations" value={metrics.totalStations} />
        <StatCard label="Active employees" value={metrics.activeEmployees} />
        <StatCard label="Today's bookings" value={metrics.todaysBookings} />
        <StatCard label="Completed today" value={metrics.completedToday} />
        <StatCard label="Open complaints" value={metrics.openComplaints} />
        <StatCard label="Active offers" value={metrics.activeOffers} />
        <StatCard label="Queue size" value={metrics.queueSize} />
        <StatCard
          label="Average rating"
          value={metrics.averageRating !== null ? metrics.averageRating.toFixed(1) : null}
        />
      </div>
    </div>
  );
}
