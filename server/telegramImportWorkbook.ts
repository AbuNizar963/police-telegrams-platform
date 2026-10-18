import * as XLSX from "xlsx";
import XlsxPopulate from "xlsx-populate";
import officeCrypto from "officecrypto-tool";

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
  let workbookBytes: Uint8Array = bytes;
  let encrypted: boolean;
  try {
    encrypted = officeCrypto.isEncrypted(bytes);
  } catch {
    throw new Error("تعذر التحقق من بنية ملف Excel. تأكد من سلامة الملف.");
  }

  if (encrypted) {
    if (password === undefined || password.length === 0) {
      throw new Error("هذا الملف محمي بكلمة مرور. أدخل كلمة المرور لفتحه.");
    }
    try {
      workbookBytes = await officeCrypto.decrypt(bytes, { password });
    } catch {
      // Use XlsxPopulate as an independent decryption path for Office Agile
      // encrypted files produced by Excel. Keep the original password exactly
      // as entered; leading/trailing spaces can be part of a valid password.
      try {
        const protectedWorkbook = await XlsxPopulate.fromDataAsync(bytes, {
          password,
        });
        workbookBytes = Buffer.from(await protectedWorkbook.outputAsync());
      } catch {
        throw new Error(
          "تعذر فك تشفير ملف Excel. تحقق من كلمة المرور أو أن نوع التشفير مدعوم."
        );
      }
    }
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(Buffer.from(workbookBytes), {
      type: "buffer",
      cellDates: false,
    });
  } catch {
    const errorMessage = encrypted
      ? "تمت محاولة فك التشفير لكن تعذر قراءة محتوى الملف. قد تكون صيغة Excel غير مدعومة أو أن الملف تالف."
      : "تعذر قراءة محتوى ملف Excel. تأكد من سلامة الملف وصيغته.";
    throw new Error(errorMessage);
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
