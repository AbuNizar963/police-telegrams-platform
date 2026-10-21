import fs from "node:fs/promises";
import path from "node:path";
import XlsxPopulate from "xlsx-populate";

export type TelegramWorkbookExportRow = {
  serial: string;
  time: string;
  sender: string;
  date: string;
  body: string;
  recipient: string;
  signature: string;
  notes: string;
  direction: "صادر" | "وارد";
};

const TEMPLATE_PATH = path.resolve(
  process.cwd(),
  "server/assets/telegram-register-template.xlsx"
);

export function formatTelegramWorkbookDateTime(
  value: Date | string | number,
  timezone: string
): { date: string; time: string } {
  const sourceDate = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(sourceDate.getTime())) {
    return { date: "", time: "" };
  }

  const dateParts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(sourceDate)
      .map(part => [part.type, part.value])
  );
  const timeParts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(sourceDate)
      .map(part => [part.type, part.value])
  );

  return {
    date: `${dateParts.year}-${dateParts.month}-${dateParts.day}`,
    time: `${timeParts.hour}:${timeParts.minute}:${timeParts.second}`,
  };
}

export async function buildTelegramWorkbook(input: {
  rows: TelegramWorkbookExportRow[];
  password?: string;
}): Promise<string> {
  const template = await fs.readFile(TEMPLATE_PATH);
  const workbook = await XlsxPopulate.fromDataAsync(template);
  const columns = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

  for (const direction of ["صادر", "وارد"] as const) {
    const sheet = workbook.sheet(direction);
    // Clear historical source values while retaining the workbook formatting.
    for (let rowIndex = 2; rowIndex <= 1001; rowIndex += 1) {
      for (const column of columns) {
        sheet.cell(`${column}${rowIndex}`).value(null);
      }
    }
    const rows = input.rows.filter(row => row.direction === direction);
    rows.forEach((row, rowIndex) => {
      const values = [
        row.serial,
        row.time,
        row.date,
        row.sender,
        row.body,
        row.recipient,
        row.signature,
        row.notes,
      ];
      const excelRow = rowIndex + 2;
      values.forEach((value, columnIndex) => {
        sheet.cell(`${columns[columnIndex]}${excelRow}`).value(value ?? "");
      });
    });
  }

  const output = await workbook.outputAsync(
    input.password?.trim() ? { password: input.password } : undefined
  );
  return Buffer.from(output as ArrayBuffer).toString("base64");
}
