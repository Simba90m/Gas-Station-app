import type en from "./en";

// Arabic strings. `satisfies Record<keyof typeof en, string>` makes it a
// compile error to forget a key or mistype one when translating.
const ar = {
  "common.appName": "منصة محطة الوقود",
  "common.loading": "جاري التحميل...",
  "common.error": "حدث خطأ ما",
  "common.retry": "إعادة المحاولة",
  "common.cancel": "إلغاء",
  "common.confirm": "تأكيد",
} satisfies Record<keyof typeof en, string>;

export default ar;
