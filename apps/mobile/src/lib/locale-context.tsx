import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_LOCALE, LOCALES, translate, type Locale, type TranslationKey } from "@gas-station/i18n";

const STORAGE_KEY = "gas-station.locale";

export interface LocaleContextValue {
  locale: Locale;
  direction: "ltr" | "rtl";
  isRTL: boolean;
  setLocale: (locale: Locale) => void;
  /** Short for translate(locale, key) — the one translation entry point every screen uses. */
  t: (key: TranslationKey) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * English by default, Arabic fully supported and switchable at runtime —
 * see packages/i18n for the dictionaries this reads from.
 *
 * Deliberately does NOT call React Native's I18nManager.forceRTL(): that
 * API mirrors native layout direction platform-wide but only takes effect
 * after an app reload, which is real complexity (a forced restart, or
 * expo-updates) not worth taking on for this phase's scope ("structure the
 * UI so i18n can be added cleanly", not the complete system). Instead,
 * `direction`/`isRTL` are exposed here for screens to apply directly
 * (flexDirection, textAlign, writingDirection) — a live, reload-free
 * switch that correctly mirrors THIS app's own screens, at the cost of not
 * mirroring native chrome (e.g. the OS-level back-gesture edge). Revisit
 * with I18nManager.forceRTL() + a reload prompt if/when full native RTL
 * parity is needed.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === "en" || stored === "ar") setLocaleState(stored);
      })
      .catch(() => {
        // No persisted preference (or storage unavailable) — DEFAULT_LOCALE stands.
      });
  }, []);

  function setLocale(next: Locale) {
    setLocaleState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // Best-effort persistence — the in-memory switch above already applied.
    });
  }

  const value = useMemo<LocaleContextValue>(() => {
    const direction = LOCALES[locale].direction;
    return {
      locale,
      direction,
      isRTL: direction === "rtl",
      setLocale,
      t: (key: TranslationKey) => translate(locale, key),
    };
  }, [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within a LocaleProvider");
  return ctx;
}
