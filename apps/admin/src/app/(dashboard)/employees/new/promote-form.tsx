"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { promoteToEmployeeAction, type EmployeeActionState } from "../actions";

const INITIAL_STATE: EmployeeActionState = {};

export interface CandidateProfile {
  id: string;
  fullName: string;
  phone: string | null;
}

export function PromoteForm({ candidates }: { candidates: CandidateProfile[] }) {
  const [state, formAction, isPending] = useActionState(promoteToEmployeeAction, INITIAL_STATE);

  if (candidates.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No existing accounts are available to promote right now — a customer needs to sign up (e.g. via the mobile
        app) before they can be made an employee here. See the Phase 6 report for why account creation isn&apos;t
        done from this screen.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <div>
        <Label htmlFor="profile_id">Existing account to promote</Label>
        <select
          id="profile_id"
          name="profile_id"
          defaultValue=""
          required
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        >
          <option value="" disabled>
            Choose an account...
          </option>
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.fullName}
              {candidate.phone ? ` — ${candidate.phone}` : ""}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-400">Only accounts that don&apos;t already have a staff role are listed.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="hire_date">Hire date (optional)</Label>
          <Input id="hire_date" name="hire_date" type="date" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="bio_en">Bio (English, optional)</Label>
          <textarea
            id="bio_en"
            name="bio_en"
            rows={3}
            className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>
        <div>
          <Label htmlFor="bio_ar">Bio (Arabic, optional)</Label>
          <textarea
            id="bio_ar"
            name="bio_ar"
            dir="rtl"
            rows={3}
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
        {isPending ? "Promoting..." : "Promote to employee"}
      </Button>
    </form>
  );
}
