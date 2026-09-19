import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400",
          "focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500",
          "disabled:bg-slate-100 disabled:text-slate-500",
          className,
        )}
        {...props}
      />
    );
  },
);
