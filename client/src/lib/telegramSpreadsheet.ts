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

const INCOMING_SHEET_HEADERS = [
  "الرقم المتسلسل",
  "ساعة الأرسال أو الوصول",
  "الجهة المرسلة واسم المرسل",
  "نـــــــــــص البرقيــــــــــــــــــــــــة",
  "الجهة المرسلة واسم المستلم",
  "توقيع المرسل أو المستلم",
  "ملاحظات",
] as const;

const TEMPLATE_HEADER_COLORS = [
  "FF10233F",
  "FF00B0F0",
  "FF92D050",
  "FF00B0F0",
  "FFFF0000",
  "FF00B0F0",
  "FF00B050",
  "FFFFFF00",
];

function applyTemplateStyle(
  sheet: XLSX.WorkSheet,
  rowIndex: number,
  columnIndex: number,
  color: string,
  isHeader: boolean,
  isSerial: boolean,
  isBody: boolean
) {
  const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
  const cell = sheet[address] as (XLSX.CellObject & { s?: Record<string, unknown> }) | undefined;
  if (!cell) return;
  const borderSide = { style: "thin", color: { rgb: "FF000000" } };
  cell.s = {
    fill: color
      ? { patternType: "solid", fgColor: { rgb: color } }
      : { patternType: "none" },
    font: {
      name: "Times New Roman",
      sz: isHeader && (isSerial || isBody) ? 18 : 14,
      bold: true,
      color: { rgb: isHeader && color === "FFFFFF00" ? "FFFF0000" : "FF000000" },
    },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: {
      top: borderSide,
      bottom: borderSide,
      left: borderSide,
      right: borderSide,
    },
  };
}

function makeSheet(
  rows: TelegramSpreadsheetExportRow[],
  direction: TelegramSpreadsheetDirection
) {
  const isOutgoing = direction === "صادر";
  const headers = isOutgoing ? TELEGRAM_SHEET_HEADERS : INCOMING_SHEET_HEADERS;
  const values = rows.map(row =>
    isOutgoing
      ? [row.serial, row.time, row.date, row.sender, row.body, row.recipient, row.signature, row.notes]
      : [row.serial, row.time, row.sender, row.body, row.recipient, row.signature, row.notes]
  );
  const sheet = XLSX.utils.aoa_to_sheet([[...headers], ...values]);
  const widths = isOutgoing ? [16, 11, 11, 15, 100, 18, 17, 14] : [16, 11, 15, 100, 18, 17, 25];
  const colors = isOutgoing
    ? TEMPLATE_HEADER_COLORS
    : [TEMPLATE_HEADER_COLORS[0], TEMPLATE_HEADER_COLORS[1], TEMPLATE_HEADER_COLORS[3], TEMPLATE_HEADER_COLORS[4], TEMPLATE_HEADER_COLORS[5], TEMPLATE_HEADER_COLORS[6], TEMPLATE_HEADER_COLORS[7]];
  sheet["!cols"] = widths.map(wch => ({ wch }));
  sheet["!rows"] = [
    { hpt: 52.2 },
    ...values.map(row => ({
      hpt: Math.min(
        210,
        Math.max(34.8, 34.8 * Math.ceil(String(row[isOutgoing ? 4 : 3] ?? "").length / 95))
      ),
    })),
  ];
  for (let column = 0; column < headers.length; column += 1) {
    applyTemplateStyle(
      sheet, 0, column, colors[column], true, column === 0,
      column === (isOutgoing ? 4 : 3)
    );
  }
  for (let rowIndex = 1; rowIndex <= values.length; rowIndex += 1) {
    for (let column = 0; column < headers.length; column += 1) {
      const isSerial = column === 0;
      const isBody = column === (isOutgoing ? 4 : 3);
      applyTemplateStyle(
        sheet, rowIndex, column,
        isSerial ? "FF00B0F0" : isBody ? "FFFFE8E8" : "",
        false, isSerial, isBody
      );
    }
  }
  sheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  sheet["!autofilter"] = {
    ref: `A1:${XLSX.utils.encode_col(headers.length - 1)}${Math.max(1, values.length + 1)}`,
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
  XLSX.utils.book_append_sheet(workbook, makeSheet(outgoing, "صادر"), "صادر");
  XLSX.utils.book_append_sheet(workbook, makeSheet(incoming, "وارد"), "وارد");
  XLSX.writeFile(workbook, fileName, { bookType: "xlsx", cellStyles: true });
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
