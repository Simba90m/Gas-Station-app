import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach } from "vitest";
import { CapabilitiesPanel } from "./capabilities-panel";
import { addCapabilityAction } from "../actions";

// Same reasoning as station-assignments-panel.test.tsx: mock the "use
// server" module, assert only on what FormData the panel builds and hands
// to formAction.
vi.mock("../actions", () => ({
  addCapabilityAction: vi.fn(async () => ({})),
  removeCapabilityAction: vi.fn(async () => ({})),
}));

afterEach(() => {
  cleanup();
  vi.mocked(addCapabilityAction).mockClear();
});

describe("CapabilitiesPanel", () => {
  it("sends the selected service's id to addCapabilityAction when Add is clicked", async () => {
    render(
      <CapabilitiesPanel
        employeeId="employee-1"
        capabilities={[]}
        available={[
          { id: "service-1", nameEn: "Car Wash Standard" },
          { id: "service-2", nameEn: "Oil Change" },
        ]}
      />,
    );

    const select = screen.getByLabelText("Add a service capability") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "service-2" } });
    expect(select.value).toBe("service-2");

    fireEvent.click(screen.getByRole("button", { name: "+ Add service capability" }));

    await waitFor(() => expect(addCapabilityAction).toHaveBeenCalledTimes(1));

    const [, submittedFormData] = vi.mocked(addCapabilityAction).mock.calls[0];
    expect(submittedFormData).toBeInstanceOf(FormData);
    expect((submittedFormData as FormData).get("service_id")).toBe("service-2");
    expect((submittedFormData as FormData).get("employee_id")).toBe("employee-1");
  });

  it("does not submit when no service has been selected", () => {
    render(
      <CapabilitiesPanel
        employeeId="employee-1"
        capabilities={[]}
        available={[{ id: "service-1", nameEn: "Car Wash Standard" }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "+ Add service capability" }));

    expect(addCapabilityAction).not.toHaveBeenCalled();
  });
});
