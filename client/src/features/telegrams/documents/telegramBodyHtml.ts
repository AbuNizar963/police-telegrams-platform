import { localizeDigits } from "@shared/numberSystem";

const DATE_TOKEN_PATTERN =
  /(^|[^0-9\u0660-\u0669\u06f0-\u06f9])([0-9\u0660-\u0669\u06f0-\u06f9]{1,2})[\/.-]([0-9\u0660-\u0669\u06f0-\u06f9]{1,2})[\/.-]([0-9\u0660-\u0669\u06f0-\u06f9]{4})(?=$|[^0-9\u0660-\u0669\u06f0-\u06f9])/g;

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    character =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character
  );
}

/** Escapes RTL telegram text and exports day/month/year dates as year/month/day. */
export function renderTelegramBodyHtml(
  value: string,
  numberSystem: unknown
): string {
  const escaped = escapeHtml(localizeDigits(value, numberSystem));
  return escaped.replace(
    DATE_TOKEN_PATTERN,
    (_match, prefix: string, day: string, month: string, year: string) =>
      `${prefix}<bdi class="telegram-date-token" dir="ltr">${year}/${month}/${day}</bdi>`
  );
}
