import { Card } from "@/components/ui/card";
import { createStationAction } from "../actions";
import { StationForm } from "../station-form";

export default function NewStationPage() {
  return (
    <div>
      <h1 className="text-lg font-semibold text-slate-900">New station</h1>
      <p className="mt-1 text-sm text-slate-500">Owner/manager only — station managers manage their existing station instead.</p>

      <Card className="mt-6 max-w-2xl">
        <StationForm action={createStationAction} submitLabel="Create station" />
      </Card>
    </div>
  );
}
