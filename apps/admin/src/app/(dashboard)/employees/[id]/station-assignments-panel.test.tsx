import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach } from "vitest";
import { StationAssignmentsPanel } from "./station-assignments-panel";
import { assignStationAction } from "../actions";

// Mocks the whole Server Action module — assignStationAction is a "use
// server" export that talks to Supabase; this test only cares about what
// FormData the panel hands to it, not what the action does with it.
vi.mock("../actions", () => ({
  assignStationAction: vi.fn(async () => ({})),
  removeStationAssignmentAction: vi.fn(async () => ({})),
}));

afterEach(() => {
  cleanup();
  vi.mocked(assignStationAction).mockClear();
});

describe("StationAssignmentsPanel", () => {
  it("sends the selected station's id to assignStationAction when Assign is clicked", async () => {
    render(
      <StationAssignmentsPanel
        employeeId="employee-1"
        assignments={[]}
        available={[
          { id: "station-1", nameEn: "Station 1" },
          { id: "station-2", nameEn: "Station 2" },
        ]}
      />,
    );

    const select = screen.getByLabelText("Assign to a station") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "station-2" } });
    expect(select.value).toBe("station-2");

    fireEvent.click(screen.getByRole("button", { name: "Assign" }));

    await waitFor(() => expect(assignStationAction).toHaveBeenCalledTimes(1));

    const [, submittedFormData] = vi.mocked(assignStationAction).mock.calls[0];
    expect(submittedFormData).toBeInstanceOf(FormData);
    expect((submittedFormData as FormData).get("station_id")).toBe("station-2");
    expect((submittedFormData as FormData).get("employee_id")).toBe("employee-1");
  });

  it("does not submit when no station has been selected", () => {
    render(
      <StationAssignmentsPanel
        employeeId="employee-1"
        assignments={[]}
        available={[{ id: "station-1", nameEn: "Station 1" }]}
      />,
    );

    // The <select>'s own `required` attribute normally blocks this via the
    // browser's constraint validation before our submit handler even runs;
    // jsdom doesn't enforce that, so this exercises the handler's own
    // `if (!selectedStationId) return;` guard directly.
    fireEvent.click(screen.getByRole("button", { name: "Assign" }));

    expect(assignStationAction).not.toHaveBeenCalled();
  });
});
