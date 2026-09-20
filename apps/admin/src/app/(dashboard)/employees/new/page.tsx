import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { PromoteForm } from "./promote-form";

export default async function NewEmployeePage() {
  const supabase = await createClient();
  // CUSTOMER is the natural "not yet staff" pool — promoting an existing
  // OWNER/MANAGER/STATION_MANAGER to EMPLOYEE isn't a real workflow this
  // screen needs to support.
  const { data: candidates } = await supabase
    .from("profiles")
    .select("id, full_name, phone")
    .eq("role", "CUSTOMER")
    .is("deleted_at", null)
    .order("full_name");

  return (
    <div>
      <h1 className="text-lg font-semibold text-slate-900">Add employee</h1>
      <p className="mt-1 text-sm text-slate-500">
        Owner/manager only. Promotes an existing account to EMPLOYEE — no new login is created here (see the Phase 6
        report).
      </p>

      <Card className="mt-6 max-w-2xl">
        <PromoteForm
          candidates={(candidates ?? []).map((c) => ({ id: c.id, fullName: c.full_name, phone: c.phone }))}
        />
      </Card>
    </div>
  );
}
