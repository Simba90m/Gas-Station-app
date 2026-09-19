import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Tone = "green" | "gray" | "red" | "amber";

const TONE_CLASSES: Record<Tone, string> = {
  green: "bg-green-100 text-green-800",
  gray: "bg-slate-100 text-slate-700",
  red: "bg-red-100 text-red-800",
  amber: "bg-amber-100 text-amber-800",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ className, tone = "gray", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    />
  );
}
