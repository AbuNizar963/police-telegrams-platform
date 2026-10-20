import XlsxPopulate from "xlsx-populate";
import { describe, expect, it } from "vitest";
import { buildTelegramWorkbook, formatTelegramWorkbookDateTime } from "./telegramWorkbook";

describe("telegram workbook export", () => {
  it("formats export date and time consistently", () => {
    expect(
      formatTelegramWorkbookDateTime("2026-10-18T17:00:00.000Z", "UTC")
    ).toEqual({
      date: "2026-10-18",
      time: "17:00:00",
    });
  });

  it("exports both matching sheets, supports passwords, and excludes template records", async () => {
    const base64 = await buildTelegramWorkbook({
      password: " secret-123 ",
      rows: [
        {
          serial: "OUT-1",
          time: "08:15",
          sender: "قسم صادر",
          date: "2026-10-18",
          body: "نص صادر للاختبار",
          recipient: "القيادة",
          signature: "الموقّع",
          notes: "",
          direction: "صادر",
        },
        {
          serial: "IN-1",
          time: "09:20",
          sender: "القيادة",
          date: "2026-10-18",
          body: "نص وارد للاختبار",
          recipient: "القسم",
          signature: "المستلم",
          notes: "",
          direction: "وارد",
        },
      ],
    });
    const workbook = await XlsxPopulate.fromDataAsync(
      Buffer.from(base64, "base64"),
      { password: " secret-123 " }
    );

    expect(workbook.sheets().map(sheet => sheet.name())).toEqual([
      "صادر",
      "وارد",
    ]);
    for (const direction of ["صادر", "وارد"]) {
      expect(workbook.sheet(direction).range("A1:H1").value()).toEqual(
        workbook.sheet("صادر").range("A1:H1").value()
      );
    }
    expect(workbook.sheet("صادر").cell("A2").value()).toBe("OUT-1");
    expect(workbook.sheet("صادر").cell("C2").value()).toBe("قسم صادر");
    expect(workbook.sheet("صادر").cell("D2").value()).toBe("2026-10-18");
    expect(workbook.sheet("وارد").cell("A2").value()).toBe("IN-1");
    expect(workbook.sheet("وارد").cell("C2").value()).toBe("القيادة");
    expect(workbook.sheet("وارد").cell("D2").value()).toBe("2026-10-18");
    expect(workbook.sheet("صادر").cell("E2").value()).toBe("نص صادر للاختبار");
    expect(workbook.sheet("وارد").cell("E2").value()).toBe("نص وارد للاختبار");
    expect(workbook.sheet("صادر").cell("E3").value()).toBeUndefined();
    expect(workbook.sheet("وارد").cell("E3").value()).toBeUndefined();
  });
});
