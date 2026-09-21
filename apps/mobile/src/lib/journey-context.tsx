import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Holds the customer's in-progress selections across the guided journey
 * (station -> service -> need -> queue|book) — in-memory only, reset on
 * "Get Started"/"Done". This is ephemeral wizard state, not a resource
 * with its own identity, so it lives in a plain React context rather than
 * being round-tripped through the URL the way the eventual created
 * queue entry/booking id is (see app/queue.tsx and app/confirmation.tsx,
 * which use route params for that instead — a real, addressable resource,
 * unlike these selections).
 */
export interface StationSelection {
  id: string;
  nameEn: string;
  nameAr: string;
  addressEn: string;
  addressAr: string;
}

export interface ServiceSelection {
  stationServiceId: string;
  serviceId: string;
  nameEn: string;
  nameAr: string;
  durationMinutes: number;
  queueId: string | null;
  queueIsOpen: boolean;
}

export type JourneyMode = "queue" | "book";

interface JourneyContextValue {
  station: StationSelection | null;
  service: ServiceSelection | null;
  mode: JourneyMode | null;
  setStation: (station: StationSelection) => void;
  setService: (service: ServiceSelection) => void;
  setMode: (mode: JourneyMode) => void;
  reset: () => void;
}

const JourneyContext = createContext<JourneyContextValue | null>(null);

export function JourneyProvider({ children }: { children: ReactNode }) {
  const [station, setStation] = useState<StationSelection | null>(null);
  const [service, setService] = useState<ServiceSelection | null>(null);
  const [mode, setMode] = useState<JourneyMode | null>(null);

  const value = useMemo<JourneyContextValue>(
    () => ({
      station,
      service,
      mode,
      setStation: (next) => {
        setStation(next);
        // Changing station invalidates whatever service/mode was chosen for the previous one.
        setService(null);
        setMode(null);
      },
      setService: (next) => {
        setService(next);
        setMode(null);
      },
      setMode,
      reset: () => {
        setStation(null);
        setService(null);
        setMode(null);
      },
    }),
    [station, service, mode],
  );

  return <JourneyContext.Provider value={value}>{children}</JourneyContext.Provider>;
}

export function useJourney(): JourneyContextValue {
  const ctx = useContext(JourneyContext);
  if (!ctx) throw new Error("useJourney must be used within a JourneyProvider");
  return ctx;
}
