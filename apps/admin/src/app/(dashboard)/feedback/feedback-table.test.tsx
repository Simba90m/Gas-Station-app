import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FeedbackTable, type FeedbackRow, type StationOption } from "./feedback-table";

afterEach(cleanup);

const STATIONS: StationOption[] = [
  { id: "station-1", nameEn: "Smouha" },
  { id: "station-2", nameEn: "Miami" },
];

const FEEDBACK: FeedbackRow[] = [
  {
    id: "feedback-1",
    customerName: "Ahmed Hassan",
    stationName: "Smouha",
    serviceName: "Car Wash Standard",
    employeeName: "Sara Ali",
    rating: 5,
    category: "SERVICE_QUALITY",
    comment: "Excellent, fast service.",
    createdAt: "2026-09-20T10:00:00.000Z",
  },
  {
    id: "feedback-2",
    customerName: "Mona Youssef",
    stationName: "Miami",
    serviceName: "Oil Change",
    employeeName: null,
    rating: 2,
    category: "WAITING_TIME",
    comment: "Waited far too long.",
    createdAt: "2026-09-19T10:00:00.000Z",
  },
  {
    id: "feedback-3",
    customerName: "Karim Adel",
    stationName: "Smouha",
    serviceName: "Tire Change",
    employeeName: "Sara Ali",
    rating: 4,
    category: "OTHER",
    comment: null,
    createdAt: "2026-09-18T10:00:00.000Z",
  },
];

describe("FeedbackTable", () => {
  it("shows every row when no filter is applied", () => {
    render(<FeedbackTable feedback={FEEDBACK} stations={STATIONS} />);

    expect(screen.getByText("Ahmed Hassan")).toBeTruthy();
    expect(screen.getByText("Mona Youssef")).toBeTruthy();
    expect(screen.getByText("Karim Adel")).toBeTruthy();
  });

  it("filters by search query against customer name and comment", () => {
    render(<FeedbackTable feedback={FEEDBACK} stations={STATIONS} />);

    fireEvent.change(screen.getByLabelText("Search feedback"), { target: { value: "waited" } });

    expect(screen.getByText("Mona Youssef")).toBeTruthy();
    expect(screen.queryByText("Ahmed Hassan")).toBeNull();
    expect(screen.queryByText("Karim Adel")).toBeNull();
  });

  it("filters by station", () => {
    render(<FeedbackTable feedback={FEEDBACK} stations={STATIONS} />);

    fireEvent.change(screen.getByLabelText("Filter by station"), { target: { value: "Miami" } });

    expect(screen.getByText("Mona Youssef")).toBeTruthy();
    expect(screen.queryByText("Ahmed Hassan")).toBeNull();
    expect(screen.queryByText("Karim Adel")).toBeNull();
  });

  it("filters by rating", () => {
    render(<FeedbackTable feedback={FEEDBACK} stations={STATIONS} />);

    fireEvent.change(screen.getByLabelText("Filter by rating"), { target: { value: "5" } });

    expect(screen.getByText("Ahmed Hassan")).toBeTruthy();
    expect(screen.queryByText("Mona Youssef")).toBeNull();
    expect(screen.queryByText("Karim Adel")).toBeNull();
  });

  it("filters by category", () => {
    render(<FeedbackTable feedback={FEEDBACK} stations={STATIONS} />);

    fireEvent.change(screen.getByLabelText("Filter by category"), { target: { value: "WAITING_TIME" } });

    expect(screen.getByText("Mona Youssef")).toBeTruthy();
    expect(screen.queryByText("Ahmed Hassan")).toBeNull();
    expect(screen.queryByText("Karim Adel")).toBeNull();
  });

  it("shows an empty state when no feedback matches the filters", () => {
    render(<FeedbackTable feedback={FEEDBACK} stations={STATIONS} />);

    fireEvent.change(screen.getByLabelText("Search feedback"), { target: { value: "nonexistent customer" } });

    expect(screen.getByText("No feedback matches your search/filters.")).toBeTruthy();
  });

  it("shows a distinct empty state when there is no feedback at all", () => {
    render(<FeedbackTable feedback={[]} stations={STATIONS} />);

    expect(screen.getByText("No feedback yet.")).toBeTruthy();
  });
});
