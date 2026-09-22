import { StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { StarRating } from "@/components/ui/star-rating";
import { Screen } from "@/components/ui/screen";
import { ScreenHeader } from "@/components/ui/screen-header";
import { EmptyView, ErrorView, LoadingView } from "@/components/ui/state-views";
import { useFeedbackRepliesFor, useMyFeedback } from "@/hooks/use-feedback";
import { useLocale } from "@/lib/locale-context";
import { useTheme } from "@/hooks/use-theme";
import { Spacing } from "@/constants/theme";

function formatDate(iso: string, locale: "en" | "ar"): string {
  return new Date(iso).toLocaleDateString(locale === "ar" ? "ar" : "en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * "My Feedback": lets the current customer session come back later and see
 * feedback they already submitted, plus any Station Management replies —
 * the thing the completion screen alone can't do, since a customer only
 * ever reaches THAT screen once and there's no route back to it (see
 * hooks/use-feedback.ts and the audit that led to this screen). Read-only
 * and session-scoped: not a chat, no composer, no realtime — same feedback
 * + feedback_replies data and RLS the completion screen already uses.
 */
export default function MyFeedbackScreen() {
  const { t, locale, isRTL } = useLocale();
  const theme = useTheme();
  const textAlign = isRTL ? "right" : "left";

  const myFeedback = useMyFeedback();
  const feedbackIds = myFeedback.data?.map((f) => f.id) ?? [];
  const replies = useFeedbackRepliesFor(feedbackIds);

  return (
    <Screen>
      <ScreenHeader title={t("myFeedback.title")} />

      {myFeedback.isLoading && <LoadingView />}
      {myFeedback.isError && <ErrorView message={t("myFeedback.errorLoading")} onRetry={() => myFeedback.refetch()} />}
      {myFeedback.isSuccess && myFeedback.data.length === 0 && <EmptyView message={t("myFeedback.empty")} />}

      {myFeedback.isSuccess && myFeedback.data.length > 0 && (
        <View style={styles.list}>
          {myFeedback.data.map((entry) => {
            const entryReplies = replies.data?.get(entry.id) ?? [];
            const stationName = locale === "ar" ? entry.stationNameAr : entry.stationNameEn;
            const serviceName = locale === "ar" ? entry.serviceNameAr : entry.serviceNameEn;

            return (
              <View key={entry.id} style={[styles.card, { borderColor: theme.border }]}>
                <View style={[styles.cardHeader, isRTL && styles.rowReverse]}>
                  <ThemedText type="smallBold" style={{ textAlign }}>
                    {stationName} · {serviceName}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatDate(entry.createdAt, locale)}
                  </ThemedText>
                </View>
                <StarRating value={entry.rating} accessibilityLabel={`${entry.rating} out of 5 stars`} />
                {entry.comment && (
                  <ThemedText themeColor="textSecondary" style={{ textAlign }}>
                    {entry.comment}
                  </ThemedText>
                )}

                {entryReplies.length > 0 && (
                  <View style={styles.repliesList}>
                    <ThemedText type="small" themeColor="textSecondary" style={{ textAlign }}>
                      {t("feedback.repliesTitle")}
                    </ThemedText>
                    {entryReplies.map((reply) => (
                      <View key={reply.id} style={[styles.replyBubble, { backgroundColor: theme.backgroundElement }]}>
                        <ThemedText type="small" themeColor="textSecondary" style={{ textAlign }}>
                          {t("feedback.stationManagement")}
                        </ThemedText>
                        <ThemedText style={{ textAlign }}>{reply.message}</ThemedText>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.three, marginTop: Spacing.two },
  card: { gap: Spacing.two, borderWidth: StyleSheet.hairlineWidth, borderRadius: Spacing.two, padding: Spacing.three },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: Spacing.two },
  rowReverse: { flexDirection: "row-reverse" },
  repliesList: { gap: Spacing.two, marginTop: Spacing.one },
  replyBubble: { borderRadius: Spacing.two, padding: Spacing.three, gap: Spacing.half },
});
