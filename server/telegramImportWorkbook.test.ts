import XlsxPopulate from "xlsx-populate";
import officeCrypto from "officecrypto-tool";
import { describe, expect, it } from "vitest";
import { parseTelegramWorkbookBase64 } from "./telegramImportWorkbook";

const headers = [
  "الرقم المتسلسل",
  "ساعة الأرسال أو الوصول",
  "الجهة المرسلة واسم المرسل",
  "تاريخ البرقية",
  "نـــــــــــص البرقيــــــــــــــــــــــــة",
  "الجهة المرسلة واسم المستلم",
  "توقيع المرسل أو المستلم",
  "ملاحظات",
];

describe("server-side password protected workbook preview", () => {
  it("opens an Office-encrypted OOXML workbook before parsing its sheets", async () => {
    const workbook = await XlsxPopulate.fromBlankAsync();
    const sheet = workbook.sheet(0).name("وارد");
    headers.forEach((header, index) =>
      sheet.cell(`${String.fromCharCode(65 + index)}1`).value(header)
    );
    const values = [
      "IN-AGILE-1",
      "09:00",
      "الإدارة",
      "2026-10-18",
      "نص برقية مشفرة من Excel",
      "القسم",
      "موقّع",
      "",
    ];
    values.forEach((value, index) =>
      sheet.cell(`${String.fromCharCode(65 + index)}2`).value(value)
    );

    const plainBytes = Buffer.from(await workbook.outputAsync());
    const encryptedBytes = officeCrypto.encrypt(plainBytes, {
      password: "Excel Agile password",
    });
    const result = await parseTelegramWorkbookBase64(
      encryptedBytes.toString("base64"),
      "Excel Agile password"
    );

    expect(result.sheets).toContain("وارد");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      originalSerial: "IN-AGILE-1",
      body: "نص برقية مشفرة من Excel",
      sheetName: "وارد",
    });
  });

  it("decrypts a protected workbook and skips repeated serial numbers", async () => {
    const workbook = await XlsxPopulate.fromBlankAsync();
    const sheet = workbook.sheet(0).name("وارد");
    headers.forEach((header, index) =>
      sheet.cell(`${String.fromCharCode(65 + index)}1`).value(header)
    );
    [
      [
        "٢١",
        "09:00",
        "الإدارة",
        "2026-10-18",
        "نص برقية أولى",
        "القسم",
        "موقّع",
        "",
      ],
      [
        "21",
        "09:05",
        "الإدارة",
        "2026-10-18",
        "نص آخر مكرر",
        "القسم",
        "موقّع",
        "",
      ],
    ].forEach((row, rowIndex) =>
      row.forEach((value, columnIndex) => {
        sheet
          .cell(`${String.fromCharCode(65 + columnIndex)}${rowIndex + 2}`)
          .value(value);
      })
    );
    const encrypted = await workbook.outputAsync({ password: " secret-pass " });
    const result = await parseTelegramWorkbookBase64(
      Buffer.from(encrypted).toString("base64"),
      " secret-pass "
    );

    expect(result.sheets).toEqual(["وارد"]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      originalSerial: "٢١",
      sheetName: "وارد",
      body: "نص برقية أولى",
    });
    expect(result.duplicateRows).toBe(1);
  });

  it("returns a clear error for an incorrect password", async () => {
    const workbook = await XlsxPopulate.fromBlankAsync();
    const bytes = await workbook.outputAsync({ password: "secret-pass" });
    await expect(
      parseTelegramWorkbookBase64(
        Buffer.from(bytes).toString("base64"),
        "wrong"
      )
    ).rejects.toThrow("تحقق من كلمة المرور");
  });
});
