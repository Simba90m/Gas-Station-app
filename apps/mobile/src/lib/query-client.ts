import { QueryClient } from "@tanstack/react-query";

/**
 * One QueryClient for the whole app (created once at module scope so
 * Fast Refresh/re-renders never spawn a second cache). Defaults tuned for
 * a mobile network: a couple of retries with backoff for a flaky
 * connection, and a short staleTime so station/service pickers don't
 * re-fetch on every screen focus but still pick up real changes quickly —
 * availability/queue data is intentionally NOT cached here at all (see
 * hooks/use-available-slots.ts and hooks/use-queue-status.ts), since those
 * must always reflect the live backend.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
