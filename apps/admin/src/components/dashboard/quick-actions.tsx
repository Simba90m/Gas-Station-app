import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const ACTIONS = [
  { href: "/bookings/new", label: "New booking" },
  { href: "/stations/new", label: "Add station" },
  { href: "/employees/new", label: "Add employee" },
  { href: "/join-qr", label: "View QR code" },
] as const;

/** The owner's most common next steps — every link is a page that already exists elsewhere in the app, not new functionality. */
export function QuickActions() {
  return (
    <Card>
      <h2 className="text-sm font-semibold text-slate-900">Quick actions</h2>
      <div className="mt-3 flex flex-wrap gap-3">
        {ACTIONS.map((action) => (
          <Link key={action.href} href={action.href}>
            <Button variant="secondary">{action.label}</Button>
          </Link>
        ))}
      </div>
    </Card>
  );
}
