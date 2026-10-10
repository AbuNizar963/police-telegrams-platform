import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import {
  parseTelegramWorkbook,
  TELEGRAM_SHEET_HEADERS,
} from "./telegramSpreadsheet";

describe("telegram spreadsheet parsing", () => {
  it("imports a valid workbook with the current official headers", async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      [...TELEGRAM_SHEET_HEADERS],
      [
        "123",
        "10:30",
        "قسم شرطة الشهباء",
        "2026-10-01",
        "نص برقية اختبار",
        "قيادة الأمن الداخلي",
        "التوقيع",
        "ملاحظة اختبار",
      ],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "صادر");

    const output = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    }) as ArrayBuffer;
    const file = new File([output], "telegrams.xlsx");

    const result = await parseTelegramWorkbook(file);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      originalSerial: "123",
      body: "نص برقية اختبار",
      sheetName: "صادر",
    });
  });

  it("rejects files that are not Excel workbooks", async () => {
    const file = new File(["not an Excel workbook"], "telegrams.txt");

    await expect(parseTelegramWorkbook(file)).rejects.toThrow(
      "يرجى اختيار ملف Excel بصيغة xlsx أو xls."
    );
  });
});
