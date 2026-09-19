import { signOutAction } from "@/app/(dashboard)/actions";
import { Button } from "@/components/ui/button";
import type { CurrentUser } from "@/lib/current-user";

const ROLE_LABELS: Record<CurrentUser["role"], string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  STATION_MANAGER: "Station Manager",
  EMPLOYEE: "Employee",
  CUSTOMER: "Customer",
};

export function Header({ user }: { user: CurrentUser }) {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
      <div className="text-sm text-slate-600">
        <span className="font-medium text-slate-900">{user.fullName}</span>
        <span className="ml-2 text-slate-400">·</span>
        <span className="ml-2">{ROLE_LABELS[user.role]}</span>
      </div>
      <form action={signOutAction}>
        <Button type="submit" variant="ghost">
          Sign out
        </Button>
      </form>
    </header>
  );
}
