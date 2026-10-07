import * as XLSX from "xlsx";

export const TELEGRAM_SHEET_HEADERS = [
  "الرقم المتسلسل",
  "ساعة الأرسال أو الوصول",
  "الجهة المرسلة واسم المرسل",
  "تاريخ البرقية",
  "نـــــــــــص البرقيــــــــــــــــــــــــة",
  "الجهة المرسلة واسم المستلم",
  "توقيع المرسل أو المستلم",
  "ملاحظات",
] as const;

export type TelegramSpreadsheetDirection = "صادر" | "وارد";

export type TelegramSpreadsheetRow = {
  originalSerial: string;
  time: string;
  sender: string;
  date: string;
  body: string;
  recipient: string;
  signature: string;
  notes: string;
  sheetName: TelegramSpreadsheetDirection;
};

export type TelegramSpreadsheetExportRow = {
  serial: string;
  time: string;
  sender: string;
  date: string;
  body: string;
  recipient: string;
  signature: string;
  notes: string;
  direction: TelegramSpreadsheetDirection;
};

export type TelegramSpreadsheetIssue = {
  rowNumber: number;
  sheetName: string;
  reason: string;
  value?: string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalized(value: unknown) {
  return text(value)
    .replace(/[\s_ـ]+/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/[ى]/g, "ي")
    .toLowerCase();
}

function makeSheet(rows: TelegramSpreadsheetExportRow[]) {
  const values = rows.map(row => [
    row.serial,
    row.time,
    row.sender,
    row.date,
    row.body,
    row.recipient,
    row.signature,
    row.notes,
  ]);
  const sheet = XLSX.utils.aoa_to_sheet([
    [...TELEGRAM_SHEET_HEADERS],
    ...values,
  ]);
  sheet["!cols"] = [
    { wch: 16 },
    { wch: 22 },
    { wch: 28 },
    { wch: 18 },
    { wch: 100 },
    { wch: 28 },
    { wch: 24 },
    { wch: 34 },
  ];
  sheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  sheet["!autofilter"] = {
    ref: `A1:H${Math.max(1, values.length + 1)}`,
  };
  return sheet;
}

export function downloadTelegramWorkbook(
  rows: TelegramSpreadsheetExportRow[],
  fileName: string
) {
  const workbook = XLSX.utils.book_new();
  const outgoing = rows.filter(row => row.direction === "صادر");
  const incoming = rows.filter(row => row.direction === "وارد");
  XLSX.utils.book_append_sheet(workbook, makeSheet(outgoing), "صادر");
  XLSX.utils.book_append_sheet(workbook, makeSheet(incoming), "وارد");
  XLSX.writeFile(workbook, fileName, { bookType: "xlsx" });
}

function findHeaderIndexes(headerRow: unknown[]) {
  const normalizedHeaders = headerRow.map(normalized);
  const find = (...aliases: string[]) =>
    normalizedHeaders.findIndex(header =>
      aliases.some(alias => header.includes(normalized(alias)))
    );
  return {
    serial: find("الرقم المتسلسل", "رقم البرقية", "الرقم"),
    time: find("ساعة الأرسال أو الوصول", "ساعة الإرسال أو الوصول", "الوقت"),
    sender: find("الجهة المرسلة واسم المرسل", "الجهة والمرسل", "المرسل"),
    date: find("تاريخ البرقية", "تاريخ"),
    body: find("نص البرقية", "نص البرقية الرسمي", "نص"),
    recipient: find("الجهة المرسلة واسم المستلم", "الجهة والمستلم", "المستلم"),
    signature: find("توقيع المرسل أو المستلم", "التوقيع"),
    notes: find("ملاحظات", "الملاحظة"),
  };
}

function cell(row: unknown[], index: number) {
  return index >= 0 ? text(row[index]) : "";
}

export async function parseTelegramWorkbook(file: File): Promise<{
  rows: TelegramSpreadsheetRow[];
  skippedRows: number;
  duplicateRows: number;
  issues: TelegramSpreadsheetIssue[];
  sheets: string[];
}> {
  if (!/\.(xlsx|xls)$/i.test(file.name)) {
    throw new Error("يرجى اختيار ملف Excel بصيغة xlsx أو xls.");
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error("حجم ملف Excel أكبر من الحد المسموح وهو 15 ميغابايت.");
  }
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const rows: TelegramSpreadsheetRow[] = [];
  const issues: TelegramSpreadsheetIssue[] = [];
  const fingerprints = new Set<string>();
  let skippedRows = 0;
  let duplicateRows = 0;

  for (const sheetName of workbook.SheetNames) {
    const direction: TelegramSpreadsheetDirection =
      sheetName.trim() === "وارد" ? "وارد" : "صادر";
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
    });
    if (matrix.length === 0) continue;

    const headerIndex = Math.min(
      10,
      Math.max(
        0,
        matrix.findIndex(row =>
          row.some(value => normalized(value).includes("الرقمالمتسلسل"))
        )
      )
    );
    const indexes = findHeaderIndexes(matrix[headerIndex] ?? []);
    const hasDateColumn = indexes.date >= 0;
    const fallback = {
      serial: indexes.serial >= 0 ? indexes.serial : 0,
      time: indexes.time >= 0 ? indexes.time : 1,
      sender: indexes.sender >= 0 ? indexes.sender : 2,
      date: indexes.date >= 0 ? indexes.date : -1,
      body: indexes.body >= 0 ? indexes.body : hasDateColumn ? 4 : 3,
      recipient:
        indexes.recipient >= 0 ? indexes.recipient : hasDateColumn ? 5 : 4,
      signature:
        indexes.signature >= 0 ? indexes.signature : hasDateColumn ? 6 : 5,
      notes: indexes.notes >= 0 ? indexes.notes : hasDateColumn ? 7 : 6,
    };

    const dataRows = matrix.slice(headerIndex + 1);
    for (let offset = 0; offset < dataRows.length; offset += 1) {
      const rawRow = dataRows[offset];
      const row = Array.isArray(rawRow) ? rawRow : [];
      const body = cell(row, fallback.body);
      const sender = cell(row, fallback.sender);
      const recipient = cell(row, fallback.recipient);
      const notes = cell(row, fallback.notes);
      if (!body && !sender && !recipient && !notes) continue;
      if (body.length < 3) {
        skippedRows += 1;
        issues.push({
          rowNumber: headerIndex + 2 + rows.length,
          sheetName,
          reason: "نص البرقية فارغ أو أقصر من الحد الأدنى.",
          value: body,
        });
        continue;
      }
      const date = cell(row, fallback.date);
      const originalSerial = cell(row, fallback.serial);
      const fingerprint = [
        direction,
        normalized(originalSerial),
        normalized(date),
        normalized(cell(row, fallback.time)),
        normalized(body),
      ].join("|");
      if (fingerprints.has(fingerprint)) {
        duplicateRows += 1;
        issues.push({
          rowNumber: headerIndex + 2 + rows.length,
          sheetName,
          reason: "صف مكرر داخل الملف وتم استبعاده تلقائيًا.",
          value: originalSerial || body.slice(0, 80),
        });
        continue;
      }
      fingerprints.add(fingerprint);
      rows.push({
        originalSerial,
        time: cell(row, fallback.time),
        sender,
        date,
        body,
        recipient,
        signature: cell(row, fallback.signature),
        notes,
        sheetName: direction,
      });
    }
  }

  if (rows.length === 0) {
    throw new Error(
      "لم يعثر النظام على صفوف برقيات صالحة. تأكد من وجود عمود نص البرقية وعدم رفع قالب فارغ."
    );
  }
  if (rows.length > 1000) {
    throw new Error("الحد الأقصى للاستيراد في العملية الواحدة هو 1000 برقية.");
  }
  return {
    rows,
    skippedRows,
    duplicateRows,
    issues: issues.slice(0, 100),
    sheets: workbook.SheetNames,
  };
}
