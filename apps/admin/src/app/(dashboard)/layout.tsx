import { redirect } from "next/navigation";
import { getCurrentAdminUser } from "@/lib/current-user";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // The real access control is Postgres RLS on every query below this
  // point — this check exists so a logged-out or non-admin visitor sees a
  // login prompt instead of a dashboard that (correctly) has no data in it.
  const user = await getCurrentAdminUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header user={user} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
