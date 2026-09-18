import en from "./locales/en";
import ar from "./locales/ar";

export type Locale = "en" | "ar";
export type TranslationKey = keyof typeof en;

export interface LocaleInfo {
  code: Locale;
  label: string;
  direction: "ltr" | "rtl";
}

export const LOCALES: Record<Locale, LocaleInfo> = {
  en: { code: "en", label: "English", direction: "ltr" },
  ar: { code: "ar", label: "العربية", direction: "rtl" },
};

export const DEFAULT_LOCALE: Locale = "ar";

const dictionaries: Record<Locale, Record<TranslationKey, string>> = { en, ar };

/** Look up a string for a locale. Falls back to the English string if a key is somehow missing at runtime. */
export function translate(locale: Locale, key: TranslationKey): string {
  return dictionaries[locale][key] ?? dictionaries.en[key];
}
