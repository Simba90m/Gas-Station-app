"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updateEmployeeAction, type EmployeeActionState } from "../actions";

const INITIAL_STATE: EmployeeActionState = {};

export interface EmployeeFormValues {
  full_name: string;
  phone: string | null;
  hire_date: string | null;
  bio_en: string | null;
  bio_ar: string | null;
}

export function EmployeeForm({ employeeId, defaultValues }: { employeeId: string; defaultValues: EmployeeFormValues }) {
  const [state, formAction, isPending] = useActionState(updateEmployeeAction, INITIAL_STATE);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="employee_id" value={employeeId} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="full_name">Name</Label>
          <Input id="full_name" name="full_name" required defaultValue={defaultValues.full_name} />
        </div>
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" defaultValue={defaultValues.phone ?? ""} placeholder="+201012345678" />
        </div>
        <div>
          <Label htmlFor="hire_date">Hire date</Label>
          <Input id="hire_date" name="hire_date" type="date" defaultValue={defaultValues.hire_date ?? ""} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="bio_en">Bio (English)</Label>
          <textarea
            id="bio_en"
            name="bio_en"
            rows={3}
            defaultValue={defaultValues.bio_en ?? ""}
            className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>
        <div>
          <Label htmlFor="bio_ar">Bio (Arabic)</Label>
          <textarea
            id="bio_ar"
            name="bio_ar"
            dir="rtl"
            rows={3}
            defaultValue={defaultValues.bio_ar ?? ""}
            className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>
      </div>

      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}
