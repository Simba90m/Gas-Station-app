"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/stations", label: "Stations" },
  { href: "/employees", label: "Employees" },
  { href: "/bookings", label: "Bookings" },
  { href: "/feedback", label: "Feedback" },
  { href: "/join-qr", label: "QR Code" },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex w-56 shrink-0 flex-col gap-1 border-r border-slate-200 bg-white p-4">
      <div className="mb-4 px-2 text-sm font-semibold text-slate-900">Gas Station Platform</div>
      {NAV_ITEMS.map((item) => {
        const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium",
              isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
