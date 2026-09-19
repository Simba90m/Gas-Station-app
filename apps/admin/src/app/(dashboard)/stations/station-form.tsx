"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { StationFormState } from "./actions";

const INITIAL_STATE: StationFormState = {};

interface StationFormProps {
  action: (prevState: StationFormState, formData: FormData) => Promise<StationFormState>;
  submitLabel: string;
  stationId?: string;
  defaultValues?: {
    name_en: string;
    name_ar: string;
    address_en: string;
    address_ar: string;
    latitude: number;
    longitude: number;
    phone: string | null;
    description_en: string | null;
    description_ar: string | null;
  };
}

export function StationForm({ action, submitLabel, stationId, defaultValues }: StationFormProps) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_STATE);

  return (
    <form action={formAction} className="space-y-6">
      {stationId && <input type="hidden" name="station_id" value={stationId} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="name_en">Name (English)</Label>
          <Input id="name_en" name="name_en" required defaultValue={defaultValues?.name_en} />
        </div>
        <div>
          <Label htmlFor="name_ar">Name (Arabic)</Label>
          <Input id="name_ar" name="name_ar" dir="rtl" required defaultValue={defaultValues?.name_ar} />
        </div>

        <div>
          <Label htmlFor="address_en">Address (English)</Label>
          <Input id="address_en" name="address_en" required defaultValue={defaultValues?.address_en} />
        </div>
        <div>
          <Label htmlFor="address_ar">Address (Arabic)</Label>
          <Input id="address_ar" name="address_ar" dir="rtl" required defaultValue={defaultValues?.address_ar} />
        </div>

        <div>
          <Label htmlFor="latitude">Latitude</Label>
          <Input
            id="latitude"
            name="latitude"
            type="number"
            step="any"
            min={-90}
            max={90}
            required
            defaultValue={defaultValues?.latitude}
          />
        </div>
        <div>
          <Label htmlFor="longitude">Longitude</Label>
          <Input
            id="longitude"
            name="longitude"
            type="number"
            step="any"
            min={-180}
            max={180}
            required
            defaultValue={defaultValues?.longitude}
          />
        </div>

        <div>
          <Label htmlFor="phone">Phone (optional)</Label>
          <Input id="phone" name="phone" defaultValue={defaultValues?.phone ?? ""} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="description_en">Description (English, optional)</Label>
          <textarea
            id="description_en"
            name="description_en"
            rows={3}
            defaultValue={defaultValues?.description_en ?? ""}
            className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>
        <div>
          <Label htmlFor="description_ar">Description (Arabic, optional)</Label>
          <textarea
            id="description_ar"
            name="description_ar"
            dir="rtl"
            rows={3}
            defaultValue={defaultValues?.description_ar ?? ""}
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
        {isPending ? "Saving..." : submitLabel}
      </Button>
    </form>
  );
}
