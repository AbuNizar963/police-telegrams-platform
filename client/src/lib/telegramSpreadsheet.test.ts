import * as XLSX from "xlsx";
import XlsxPopulate from "xlsx-populate";
import { describe, expect, it } from "vitest";
import {
  parseTelegramWorkbook,
  TELEGRAM_SHEET_HEADERS,
} from "./telegramSpreadsheet";

function createWorkbookFile(
  rows: unknown[][],
  fileName = "telegrams.xlsx"
): File {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "صادر");
  const output = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  }) as ArrayBuffer;
  return new File([output], fileName);
}

describe("telegram spreadsheet parsing", () => {
  it("imports a valid workbook with the current official headers", async () => {
    const file = createWorkbookFile([
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

    const result = await parseTelegramWorkbook(file);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      originalSerial: "123",
      body: "نص برقية اختبار",
      sheetName: "صادر",
    });
  });

  it("normalizes an hour-only source time to HH:mm:ss", async () => {
    const file = createWorkbookFile([
      [...TELEGRAM_SHEET_HEADERS],
      [
        "17",
        "17",
        "قسم شرطة",
        "2026-10-18",
        "نص برقية لاختبار الوقت",
        "القيادة",
        "",
        "",
      ],
    ]);

    const result = await parseTelegramWorkbook(file);

    expect(result.rows[0].time).toBe("17:00:00");
  });

  it("rejects a sheet when no valid header row can be detected", async () => {
    const file = createWorkbookFile([
      ["اسم المرسل", "ملاحظات"],
      ["قسم الاختبار", "هذه ليست ورقة برقيات"],
    ]);

    await expect(parseTelegramWorkbook(file)).rejects.toThrow(
      'تعذر العثور على صف العناوين الصحيح في ورقة "صادر"'
    );
  });

  it("preserves different telegrams that happen to share a serial number", async () => {
    const file = createWorkbookFile([
      [...TELEGRAM_SHEET_HEADERS],
      [
        "123",
        "10:30",
        "قسم شرطة الشهباء",
        "2026-10-01",
        "نص البرقية الأولى",
        "قيادة الأمن الداخلي",
        "التوقيع",
        "ملاحظة",
      ],
      [
        "123",
        "11:30",
        "قسم شرطة آخر",
        "2026-10-02",
        "نص البرقية الثانية المختلفة",
        "قيادة أخرى",
        "توقيع آخر",
        "ملاحظة أخرى",
      ],
    ]);

    const result = await parseTelegramWorkbook(file);

    expect(result.rows).toHaveLength(2);
    expect(result.duplicateRows).toBe(0);
  });

  it("removes exact duplicate rows but records the correct source row number", async () => {
    const telegram = [
      "123",
      "10:30",
      "قسم شرطة الشهباء",
      "2026-10-01",
      "نص برقية اختبار",
      "قيادة الأمن الداخلي",
      "التوقيع",
      "ملاحظة اختبار",
    ];
    const file = createWorkbookFile([
      [...TELEGRAM_SHEET_HEADERS],
      telegram,
      telegram,
    ]);

    const result = await parseTelegramWorkbook(file);

    expect(result.rows).toHaveLength(1);
    expect(result.duplicateRows).toBe(1);
    expect(result.issues[0].rowNumber).toBe(3);
  });

  it("opens an Agile-encrypted workbook with a supplied password", async () => {
    const workbook = await XlsxPopulate.fromBlankAsync();
    const sheet = workbook.sheet(0).name("صادر");
    sheet.cell("A1").value("الرقم المتسلسل");
    sheet.cell("B1").value("ساعة الأرسال أو الوصول");
    sheet.cell("C1").value("الجهة المرسلة واسم المرسل");
    sheet.cell("D1").value("تاريخ البرقية");
    sheet.cell("E1").value("نـــــــــــص البرقيــــــــــــــــــــــــة");
    sheet.cell("F1").value("الجهة المرسلة واسم المستلم");
    sheet.cell("G1").value("توقيع المرسل أو المستلم");
    sheet.cell("H1").value("ملاحظات");
    [
      "77",
      "10:30",
      "قسم الاختبار",
      "2026-10-18",
      "برقية اختبار مشفرة",
      "القيادة",
      "موقّع",
      "ملاحظة",
    ].forEach((value, index) => {
      sheet.cell(`${String.fromCharCode(65 + index)}2`).value(value);
    });
    const encrypted = await workbook.outputAsync({
      password: "sample-password",
    });
    const file = new File([encrypted], "protected.xlsx");

    const result = await parseTelegramWorkbook(file, "sample-password");

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      originalSerial: "77",
      body: "برقية اختبار مشفرة",
      sheetName: "صادر",
    });
  });

  it("preserves leading and trailing spaces in a valid workbook password", async () => {
    const workbook = await XlsxPopulate.fromBlankAsync();
    const sheet = workbook.sheet(0).name("صادر");
    sheet.cell("A1").value("الرقم المتسلسل");
    sheet.cell("B1").value("ساعة الأرسال أو الوصول");
    sheet.cell("C1").value("الجهة المرسلة واسم المرسل");
    sheet.cell("D1").value("تاريخ البرقية");
    sheet.cell("E1").value("نـــــــــــص البرقيــــــــــــــــــــــــة");
    sheet.cell("F1").value("الجهة المرسلة واسم المستلم");
    sheet.cell("G1").value("توقيع المرسل أو المستلم");
    sheet.cell("H1").value("ملاحظات");
    sheet.cell("A2").value("78");
    sheet.cell("E2").value("برقية بكلمة مرور تحتوي مسافات");
    const password = " secure password ";
    const encrypted = await workbook.outputAsync({ password });
    const file = new File([encrypted], "protected-spaces.xlsx");

    const result = await parseTelegramWorkbook(file, password);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].originalSerial).toBe("78");
  });

  it("rejects files that are not Excel workbooks", async () => {
    const file = new File(["not an Excel workbook"], "telegrams.txt");

    await expect(parseTelegramWorkbook(file)).rejects.toThrow(
      "يرجى اختيار ملف Excel بصيغة xlsx أو xls."
    );
  });
});
