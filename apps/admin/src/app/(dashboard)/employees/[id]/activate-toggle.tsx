"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setEmployeeActiveAction } from "../actions";

export function ActivateToggle({ employeeId, isActive }: { employeeId: string; isActive: boolean }) {
  const [active, setActive] = useState(isActive);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    setError(undefined);
    const next = !active;
    startTransition(async () => {
      const result = await setEmployeeActiveAction(employeeId, next);
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
        {isPending ? "Saving..." : active ? "Deactivate" : "Activate"}
      </Button>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
