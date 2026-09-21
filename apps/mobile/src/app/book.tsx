import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { PrimaryButton } from "@/components/ui/primary-button";
import { Screen } from "@/components/ui/screen";
import { ScreenHeader } from "@/components/ui/screen-header";
import { EmptyView, ErrorView } from "@/components/ui/state-views";
import { useAvailableSlots } from "@/hooks/use-available-slots";
import { useCreateBooking } from "@/hooks/use-create-booking";
import { useJourney } from "@/lib/journey-context";
import { useLocale } from "@/lib/locale-context";
import { useTheme } from "@/hooks/use-theme";
import { Spacing } from "@/constants/theme";

function toDateKey(d: Date): string {
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
}

function formatDateLabel(dateKey: string, locale: "en" | "ar"): string {
  const d = new Date(`${dateKey}T00:00:00`);
  return d.toLocaleDateString(locale === "ar" ? "ar" : "en-US", { weekday: "short", month: "short", day: "numeric" });
}

/**
 * Step 4 (Book for Later path): pick a date, load real available slots
 * from get_available_slots() (never computed client-side), pick one, and
 * create the booking through create_booking() — the existing secure RPC.
 * Employee selection stays optional: p_employee_id is simply omitted, and
 * create_booking() itself auto-assigns one when the service requires it.
 *
 * Date picking is a simple prev/next day stepper rather than a calendar
 * widget — keeps this phase dependency-free; a full calendar picker is a
 * reasonable later polish, not a functional gap (every date is still
 * reachable, just one day at a time).
 */
export default function BookScreen() {
  const { t, locale, isRTL } = useLocale();
  const theme = useTheme();
  const { station, service } = useJourney();
  const [date, setDate] = useState(() => toDateKey(new Date()));

  const slots = useAvailableSlots(station?.id, service?.serviceId, date);
  const createBooking = useCreateBooking();

  useEffect(() => {
    if (!station || !service) router.replace("/stations");
  }, [station, service]);

  if (!station || !service) return null;

  function shiftDate(days: number) {
    const next = new Date(`${date}T00:00:00`);
    next.setDate(next.getDate() + days);
    setDate(toDateKey(next));
  }

  function handleSelectSlot(start: string) {
    createBooking.mutate(
      { stationId: station!.id, serviceId: service!.serviceId, startAt: start },
      {
        onSuccess: ({ bookingId }) => {
          router.replace({ pathname: "/confirmation", params: { bookingId } });
        },
      },
    );
  }

  return (
    <Screen>
      <ScreenHeader title={t("book.title")} step={{ current: 3, total: 5 }} />

      <View style={[styles.dateRow, isRTL && styles.dateRowReverse]}>
        <Pressable accessibilityRole="button" onPress={() => shiftDate(-1)} hitSlop={12} style={styles.dateArrow}>
          <ThemedText type="subtitle" style={{ color: theme.primary }}>
            {isRTL ? "›" : "‹"}
          </ThemedText>
        </Pressable>
        <ThemedText type="default" style={styles.dateLabel}>
          {formatDateLabel(date, locale)}
        </ThemedText>
        <Pressable accessibilityRole="button" onPress={() => shiftDate(1)} hitSlop={12} style={styles.dateArrow}>
          <ThemedText type="subtitle" style={{ color: theme.primary }}>
            {isRTL ? "‹" : "›"}
          </ThemedText>
        </Pressable>
      </View>

      <PrimaryButton
        label={slots.isFetching ? t("book.finding") : t("book.findTimes")}
        variant="secondary"
        loading={slots.isFetching}
        onPress={() => slots.refetch()}
      />

      {slots.isError && <ErrorView message={t("book.errorSlots")} onRetry={() => slots.refetch()} />}
      {createBooking.isError && <ErrorView message={t("book.errorBooking")} onRetry={() => {}} />}

      {slots.isSuccess && slots.data.length === 0 && <EmptyView message={t("book.noSlots")} />}

      {slots.isSuccess && slots.data.length > 0 && (
        <View style={styles.slotsWrap}>
          {slots.data.map((slot) => (
            <Pressable
              key={slot.start}
              accessibilityRole="button"
              disabled={createBooking.isPending}
              onPress={() => handleSelectSlot(slot.start)}
              style={({ pressed }) => [
                styles.slot,
                { borderColor: theme.border, backgroundColor: theme.backgroundElement, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <ThemedText type="smallBold">
                {new Date(slot.start).toLocaleTimeString(locale === "ar" ? "ar" : "en-US", { hour: "2-digit", minute: "2-digit" })}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  dateRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dateRowReverse: { flexDirection: "row-reverse" },
  dateArrow: { padding: Spacing.two },
  dateLabel: { textAlign: "center" },
  slotsWrap: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two },
  slot: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minWidth: 88,
    alignItems: "center",
  },
});
