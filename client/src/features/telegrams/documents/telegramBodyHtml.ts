import { localizeDigits } from "@shared/numberSystem";

const DATE_TOKEN_PATTERN =
  /(^|[^0-9\u0660-\u0669\u06f0-\u06f9])([0-9\u0660-\u0669\u06f0-\u06f9]{1,2}[\/.-][0-9\u0660-\u0669\u06f0-\u06f9]{1,2}[\/.-][0-9\u0660-\u0669\u06f0-\u06f9]{4})(?=$|[^0-9\u0660-\u0669\u06f0-\u06f9])/g;

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

/** Escapes telegram text and isolates slash-separated dates within RTL content. */
export function renderTelegramBodyHtml(
  value: string,
  numberSystem: unknown
): string {
  const escaped = escapeHtml(localizeDigits(value, numberSystem));
  return escaped.replace(
    DATE_TOKEN_PATTERN,
    (_match, prefix: string, date: string) =>
      `${prefix}<bdi class="telegram-date-token" dir="ltr">${date}</bdi>`
  );
}
