import { IconName } from "@/src/components/Icon";
import { ThemeColors } from "@/src/theme";

// Preset document types shown in the picker. `custom` lets the user name their own.
export const DOC_TYPES: { key: string; label: string; icon: IconName }[] = [
  { key: "licna_karta", label: "Лична карта", icon: "card-account-details" },
  { key: "pasos", label: "Пасош", icon: "passport" },
  { key: "vozacka", label: "Возачка дозвола", icon: "card-account-details-star" },
  { key: "zdravstvena", label: "Здравствена књижица", icon: "medical-bag" },
  { key: "kartica", label: "Картица рачуна", icon: "credit-card-outline" },
  { key: "visa", label: "VISA / MasterCard", icon: "credit-card" },
  { key: "registracija", label: "Регистрација возила", icon: "car" },
  { key: "custom", label: "Друго", icon: "file-document-outline" },
];

export const ALARM_OPTIONS = [2, 5, 10, 15];

export function docIcon(docType: string): IconName {
  return DOC_TYPES.find((d) => d.key === docType)?.icon ?? "file-document-outline";
}

// Days-remaining status → color + label, matching the design's color-coded chips.
export function statusFor(days: number, colors: ThemeColors) {
  if (days < 0) return { color: colors.muted, bg: colors.surfaceTertiary, label: "Истекао" };
  if (days <= 2) return { color: colors.onError, bg: colors.error, label: `${days} дана` };
  if (days <= 5) return { color: colors.onWarning, bg: colors.warning, label: `${days} дана` };
  if (days <= 10) return { color: colors.onInfo, bg: colors.info, label: `${days} дана` };
  if (days <= 30) return { color: colors.onSuccess, bg: colors.success, label: `${days} дана` };
  return { color: colors.onSurfaceTertiary, bg: colors.surfaceTertiary, label: `${days} дана` };
}

const MONTHS = ["", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];

// YYYY-MM-DD -> DD.MM.YYYY
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const datePart = iso.slice(0, 10);
  const [y, m, d] = datePart.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y} год.`;
}

// DD.MM.YYYY (typed) -> YYYY-MM-DD, or null if invalid
export function parseDate(input: string): string | null {
  const m = input.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dd = String(day).padStart(2, "0");
  return `${year}-${MONTHS[month]}-${dd}`;
}

// live mask for DD.MM.YYYY as the user types
export function maskDate(text: string): string {
  const digits = text.replace(/\D/g, "").slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
  return parts.join(".");
}

export function isoToDDMMYYYY(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}
