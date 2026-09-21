import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { PrimaryButton } from "@/components/ui/primary-button";
import { Screen } from "@/components/ui/screen";
import { ScreenHeader } from "@/components/ui/screen-header";
import { ErrorView } from "@/components/ui/state-views";
import { useJoinQueue } from "@/hooks/use-join-queue";
import { useQueueStatus } from "@/hooks/use-queue-status";
import { useJourney } from "@/lib/journey-context";
import { useLocale } from "@/lib/locale-context";
import type { QueueStatus } from "@gas-station/types";
import { Spacing } from "@/constants/theme";

const STATUS_KEY: Record<QueueStatus, "queue.statusWaiting" | "queue.statusCalled" | "queue.statusInService" | "queue.statusCompleted" | "queue.statusCancelled" | "queue.statusNoShow"> = {
  WAITING: "queue.statusWaiting",
  CALLED: "queue.statusCalled",
  IN_SERVICE: "queue.statusInService",
  COMPLETED: "queue.statusCompleted",
  CANCELLED: "queue.statusCancelled",
  NO_SHOW: "queue.statusNoShow",
};

/**
 * Step 4 (Start Now path): join the walk-in queue, then show the live
 * ticket in place — position, rank, estimated wait, status — with
 * realtime + polling refresh (see hooks/use-queue-status.ts). The
 * entryId route param is what makes this screen addressable/refreshable
 * once joined, distinct from the ephemeral station/service selections in
 * JourneyContext.
 */
export default function QueueScreen() {
  const { t, locale, isRTL } = useLocale();
  const { station, service } = useJourney();
  const { entryId } = useLocalSearchParams<{ entryId?: string }>();

  const joinQueue = useJoinQueue();
  const status = useQueueStatus(entryId);

  useEffect(() => {
    if (!station || !service) router.replace("/stations");
  }, [station, service]);

  if (!station || !service) return null;

  function handleJoin() {
    joinQueue.mutate(service!.stationServiceId, {
      onSuccess: (ticket) => {
        router.replace({ pathname: "/queue", params: { entryId: ticket.queueEntryId } });
      },
    });
  }

  if (!entryId) {
    return (
      <Screen>
        <ScreenHeader title={t("queue.title")} step={{ current: 3, total: 5 }} />
        <View style={styles.summary}>
          <ThemedText type="default" style={{ textAlign: isRTL ? "right" : "left" }}>
            {locale === "ar" ? station.nameAr : station.nameEn} · {locale === "ar" ? service.nameAr : service.nameEn}
          </ThemedText>
        </View>
        {joinQueue.isError && <ErrorView message={t("queue.errorJoining")} onRetry={handleJoin} />}
        {!joinQueue.isError && (
          <PrimaryButton
            label={joinQueue.isPending ? t("queue.joining") : t("queue.joinCta")}
            loading={joinQueue.isPending}
            onPress={handleJoin}
          />
        )}
      </Screen>
    );
  }

  if (status.isLoading) {
    return (
      <Screen>
        <ScreenHeader title={t("queue.title")} />
        <ThemedText themeColor="textSecondary">{t("common.loading")}</ThemedText>
      </Screen>
    );
  }

  if (status.isError || !status.data) {
    return (
      <Screen>
        <ScreenHeader title={t("queue.title")} />
        <ErrorView message={t("common.error")} onRetry={() => status.refetch()} />
      </Screen>
    );
  }

  const ticket = status.data;

  return (
    <Screen>
      <ScreenHeader title={t("confirmation.queueTitle")} />
      <ThemedText themeColor="textSecondary" style={{ textAlign: isRTL ? "right" : "left" }}>
        {t("confirmation.queueSubtitle")}
      </ThemedText>

      <View style={styles.ticketCard}>
        <ThemedText type="title" style={styles.ticketNumber}>
          #{ticket.position}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.ticketNumber}>
          {t("queue.ticketLabel")}
        </ThemedText>

        <View style={styles.statRow}>
          <ThemedText themeColor="textSecondary">{t("queue.ahead")}</ThemedText>
          <ThemedText type="smallBold">{ticket.rank}</ThemedText>
        </View>
        <View style={styles.statRow}>
          <ThemedText themeColor="textSecondary">{t("queue.estimatedWait")}</ThemedText>
          <ThemedText type="smallBold">
            ~{ticket.estimatedWaitMinutes} {t("common.minutesShort")}
          </ThemedText>
        </View>
        <View style={styles.statRow}>
          <ThemedText themeColor="textSecondary">{t("queue.status")}</ThemedText>
          <ThemedText type="smallBold">{t(STATUS_KEY[ticket.status])}</ThemedText>
        </View>
      </View>

      <PrimaryButton
        label={status.isRefetching ? t("queue.refreshing") : t("queue.refresh")}
        variant="secondary"
        loading={status.isRefetching}
        onPress={() => status.refetch()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { paddingVertical: Spacing.two },
  ticketCard: { gap: Spacing.two, alignItems: "center", paddingVertical: Spacing.four },
  ticketNumber: { textAlign: "center" },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    paddingVertical: Spacing.one,
  },
});
