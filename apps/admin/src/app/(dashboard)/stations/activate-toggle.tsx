"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setStationActiveAction } from "./actions";

export function ActivateToggle({ stationId, isActive }: { stationId: string; isActive: boolean }) {
  const [active, setActive] = useState(isActive);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    setError(undefined);
    const next = !active;
    startTransition(async () => {
      const result = await setStationActiveAction(stationId, next);
      if (result.error) {
        setError(result.error);
      } else {
        setActive(next);
      }
    });
  }

  return (
    <div>
      <Button variant={active ? "danger" : "primary"} onClick={handleToggle} disabled={isPending}>
        {isPending ? "Saving..." : active ? "Deactivate station" : "Activate station"}
      </Button>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
