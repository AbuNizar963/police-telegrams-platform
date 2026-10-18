import * as XLSX from "xlsx";
import XlsxPopulate from "xlsx-populate";
import officeCrypto from "officecrypto-tool";
import { decryptWorkbook } from "@node-projects/excelforge";

export type TelegramWorkbookImportRow = {
  originalSerial: string;
  time: string;
  sender: string;
  date: string;
  body: string;
  recipient: string;
  signature: string;
  notes: string;
  sheetName: "صادر" | "وارد";
};

export type TelegramWorkbookImportIssue = {
  rowNumber: number;
  sheetName: string;
  reason: string;
  value?: string;
};

function text(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object" && "text" in value) {
    return String((value as { text?: unknown }).text ?? "").trim();
  }
  return String(value).trim();
}

function normalize(value: unknown): string {
  return text(value)
    .replace(/[\s_ـ]+/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[٠-٩۰-۹]/g, digit =>
      String("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹".indexOf(digit) % 10)
    )
    .toLowerCase();
}

function indexOf(headers: unknown[], aliases: string[]): number {
  const values = headers.map(normalize);
  return values.findIndex(value =>
    aliases.some(alias => value.includes(normalize(alias)))
  );
}


function isZipPackage(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

async function decryptProtectedWorkbook(
  bytes: Buffer,
  password: string
): Promise<XLSX.WorkBook> {
  let foundZipPackage = false;
  const decryptors: Array<() => Promise<Uint8Array>> = [
    () => decryptWorkbook(new Uint8Array(bytes), password),
    () => officeCrypto.decrypt(bytes, { password }),
    async () => {
      const workbook = await XlsxPopulate.fromDataAsync(bytes, { password });
      return new Uint8Array(Buffer.from(await workbook.outputAsync()));
    },
  ];

  for (const decrypt of decryptors) {
    let decrypted: Uint8Array;
    try {
      decrypted = new Uint8Array(await decrypt());
    } catch {
      continue;
    }
    if (!isZipPackage(decrypted)) continue;
    foundZipPackage = true;
    try {
      const workbook = XLSX.read(Buffer.from(decrypted), {
        type: "buffer",
        cellDates: false,
      });
      if (workbook.SheetNames.length > 0) return workbook;
    } catch {
      // Continue to the next independent decryption implementation.
    }
  }

  if (foundZipPackage) {
    throw new Error(
      "تم فك التشفير لكن تعذرت قراءة محتوى الملف. قد تكون صيغة Excel غير مدعومة أو أن الملف تالف."
    );
  }
  throw new Error(
    "تعذر فك تشفير ملف Excel. تحقق من كلمة المرور أو أن صيغة التشفير مدعومة وأن الملف غير تالف."
  );
}

export async function parseTelegramWorkbookBase64(
  base64: string,
  password?: string
): Promise<{
  rows: TelegramWorkbookImportRow[];
  skippedRows: number;
  duplicateRows: number;
  issues: TelegramWorkbookImportIssue[];
  sheets: string[];
}> {
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0 || bytes.length > 15 * 1024 * 1024) {
    throw new Error(
      "حجم ملف Excel فارغ أو يتجاوز الحد المسموح وهو 15 ميغابايت."
    );
  }
  let workbook: XLSX.WorkBook;
  if (encrypted) {
    if (password === undefined || password.length === 0) {
      throw new Error("هذا الملف محمي بكلمة مرور. أدخل كلمة المرور لفتحه.");
    }
    workbook = await decryptProtectedWorkbook(bytes, password);
  } else {
    try {
      workbook = XLSX.read(bytes, {
        type: "buffer",
        cellDates: false,
      });
    } catch {
      throw new Error(
        "تعذر قراءة محتوى ملف Excel. تأكد من سلامة الملف وصيغته."
      );
    }
  }

  const sheets = workbook.SheetNames.map(sheetName => {
    const worksheet = workbook.Sheets[sheetName]!;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: "",
      raw: false,
    });
    return { sheetName, matrix };
  });

  const rows: TelegramWorkbookImportRow[] = [];
  const issues: TelegramWorkbookImportIssue[] = [];
  const fingerprints = new Set<string>();
  const serials = new Set<string>();
  let skippedRows = 0;
  let duplicateRows = 0;

  for (const { sheetName, matrix } of sheets) {
    const direction: "صادر" | "وارد" =
      sheetName.trim() === "وارد" ? "وارد" : "صادر";
    if (matrix.length === 0) continue;
    let header = matrix.findIndex(row =>
      row.some(value => normalize(value).includes("الرقمالمتسلسل"))
    );
    if (header < 0) header = 0;
    if (header > 10) header = 10;
    const headings = matrix[header] ?? [];
    const found = {
      serial: indexOf(headings, ["الرقم المتسلسل", "رقم البرقية", "الرقم"]),
      time: indexOf(headings, [
        "ساعة الأرسال أو الوصول",
        "ساعة الإرسال أو الوصول",
        "الوقت",
      ]),
      sender: indexOf(headings, [
        "الجهة المرسلة واسم المرسل",
        "الجهة والمرسل",
        "المرسل",
      ]),
      date: indexOf(headings, ["تاريخ البرقية", "تاريخ"]),
      body: indexOf(headings, ["نص البرقية", "نص البرقية الرسمي", "نص"]),
      recipient: indexOf(headings, [
        "الجهة المرسلة واسم المستلم",
        "الجهة والمستلم",
        "المستلم",
      ]),
      signature: indexOf(headings, ["توقيع المرسل أو المستلم", "التوقيع"]),
      notes: indexOf(headings, ["ملاحظات", "الملاحظة"]),
    };
    const hasDate = found.date >= 0;
    const col = {
      serial: found.serial >= 0 ? found.serial : 0,
      time: found.time >= 0 ? found.time : 1,
      sender: found.sender >= 0 ? found.sender : 2,
      date: found.date >= 0 ? found.date : -1,
      body: found.body >= 0 ? found.body : hasDate ? 4 : 3,
      recipient: found.recipient >= 0 ? found.recipient : hasDate ? 5 : 4,
      signature: found.signature >= 0 ? found.signature : hasDate ? 6 : 5,
      notes: found.notes >= 0 ? found.notes : hasDate ? 7 : 6,
    };
    for (let offset = header + 1; offset < matrix.length; offset += 1) {
      const row = matrix[offset] ?? [];
      const get = (position: number) =>
        position >= 0 ? text(row[position]) : "";
      const body = get(col.body);
      const sender = get(col.sender);
      const recipient = get(col.recipient);
      const notes = get(col.notes);
      if (!body && !sender && !recipient && !notes) continue;
      const originalSerial = get(col.serial);
      if (body.length < 3) {
        skippedRows += 1;
        issues.push({
          rowNumber: offset + 1,
          sheetName,
          reason: "نص البرقية فارغ أو أقصر من الحد الأدنى.",
          value: body,
        });
        continue;
      }
      const serialKey = `${direction}|${normalize(originalSerial)}`;
      const signature = [
        direction,
        normalize(originalSerial),
        normalize(get(col.date)),
        normalize(get(col.time)),
        normalize(body),
      ].join("|");
      if (
        fingerprints.has(signature) ||
        (originalSerial && serials.has(serialKey))
      ) {
        duplicateRows += 1;
        issues.push({
          rowNumber: offset + 1,
          sheetName,
          reason: "رقم أو صف مكرر داخل الملف وتم استبعاده.",
          value: originalSerial || body.slice(0, 80),
        });
        continue;
      }
      fingerprints.add(signature);
      if (originalSerial) serials.add(serialKey);
      rows.push({
        originalSerial,
        time: get(col.time),
        sender,
        date: get(col.date),
        body,
        recipient,
        signature: get(col.signature),
        notes,
        sheetName: direction,
      });
    }
  }
  if (!rows.length) throw new Error("لم يعثر النظام على صفوف برقيات صالحة.");
  if (rows.length > 1000)
    throw new Error("الحد الأقصى للاستيراد في العملية الواحدة هو 1000 برقية.");
  return {
    rows,
    skippedRows,
    duplicateRows,
    issues: issues.slice(0, 100),
    sheets: sheets.map(sheet => sheet.sheetName),
  };
}
