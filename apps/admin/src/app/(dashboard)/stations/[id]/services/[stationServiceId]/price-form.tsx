"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updateStationServicePriceAction, type ServiceActionState } from "../actions";

const INITIAL_STATE: ServiceActionState = {};

export function PriceForm({
  stationId,
  stationServiceId,
  basePrice,
  priceOverride,
}: {
  stationId: string;
  stationServiceId: string;
  basePrice: number;
  priceOverride: number | null;
}) {
  const [state, formAction, isPending] = useActionState(updateStationServicePriceAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex items-end gap-3">
      <input type="hidden" name="station_id" value={stationId} />
      <input type="hidden" name="station_service_id" value={stationServiceId} />
      <div className="max-w-[160px]">
        <Label htmlFor="price_override">Price at this station (EGP)</Label>
        <Input
          id="price_override"
          name="price_override"
          type="number"
          step="0.01"
          min={0}
          placeholder={`${basePrice} (catalog)`}
          defaultValue={priceOverride ?? ""}
        />
      </div>
      <Button type="submit" variant="secondary" disabled={isPending}>
        {isPending ? "Saving..." : "Save price"}
      </Button>
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
