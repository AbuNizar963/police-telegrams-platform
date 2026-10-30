export type AuditField = { label: string; value: string };

export const auditActionLabels: Record<string, string> = {
  "organization.settings.update": "تحديث إعدادات الجهة",
  "organization.create": "إنشاء جهة",
  "organization.update": "تعديل جهة",
  "settings.update": "تحديث الإعدادات",
  "platform.document_settings.update": "تحديث إعدادات الوثائق",
  "attachment.upload": "رفع مرفق",
  "attachment.download": "تنزيل مرفق",
  "telegram.update": "تعديل برقية",
  "telegram.delete": "حذف برقية",
  "telegram.route": "إحالة برقية",
  "telegram.route.receive": "تأكيد استلام إحالة",
  "telegram.status.transition": "تغيير حالة برقية",
  "telegram.create": "إنشاء برقية",
  "telegram.document.print": "طباعة وثيقة برقية",
  "telegram.document.download": "تنزيل أو مشاركة وثيقة برقية",
  "telegram.export.rows": "تجهيز تصدير سجل البرقيات",
  "telegram.export.workbook": "تصدير سجل البرقيات إلى Excel",
  "telegram.import.excel": "استيراد برقيات من Excel",
  "telegram.broadcast": "توزيع برقية على جهات",
  "telegram.broadcast.atomic_failure": "تعذّر توزيع البرقية",
  "user.create": "إنشاء حساب مستخدم",
  "user.update": "تعديل بيانات مستخدم",
  "user.disable": "تعطيل حساب مستخدم",
  "user.enable": "تفعيل حساب مستخدم",
  "user.delete": "حذف حساب مستخدم",
  "platform.owner_workplace.switch": "تغيير جهة عمل المالك",
};

const entityLabels: Record<string, string> = {
  telegram: "البرقية",
  telegram_attachment: "مرفق البرقية",
  telegram_collection: "مجموعة البرقيات",
  telegram_route: "إحالة البرقية",
  organization: "الجهة",
  user: "حساب المستخدم",
  settings: "الإعدادات",
  attachment: "المرفق",
  platform: "النظام",
};

const fieldLabels: Record<string, string> = {
  serialNumber: "رقم البرقية",
  serialCode: "الرقم المرجعي",
  originalSerial: "الرقم السابق",
  subject: "الموضوع",
  recipient: "الجهة المستلمة",
  body: "نص الوثيقة",
  classification: "درجة السرية",
  priority: "درجة الأسبقية",
  category: "التصنيف",
  status: "الحالة",
  fromStatus: "الحالة السابقة",
  toStatus: "الحالة الجديدة",
  statusAtDeletion: "الحالة عند الحذف",
  format: "صيغة الملف",
  operation: "نوع العملية",
  mode: "طريقة التنفيذ",
  reason: "السبب",
  username: "اسم المستخدم",
  name: "الاسم",
  rank: "الرتبة",
  role: "الصلاحية",
  accepted: "نتيجة الاستلام",
  approved: "نتيجة الاعتماد",
  deletedAttachmentCount: "عدد المرفقات المحذوفة",
  pendingStorageCleanup: "ملفات بانتظار التنظيف",
  rowCount: "عدد السجلات",
  recordCount: "عدد السجلات",
  createdCount: "عدد السجلات المنشأة",
  updatedCount: "عدد السجلات المعدّلة",
  targetCount: "عدد الجهات المستهدفة",
  rollbackGuaranteed: "تم التراجع عن العملية بالكامل",
  failure: "ملخص التعذّر",
  occurredAt: "وقت تنفيذ العملية",
  telegramId: "رقم البرقية المرتبطة",
  toOrganizationName: "الجهة المحال إليها",
  fromOrganizationName: "الجهة المحيلة",
  fileName: "اسم الملف",
  originalName: "اسم الملف الأصلي",
  mimeType: "نوع الملف",
  sizeBytes: "حجم الملف",
};

const tokenLabels: Record<string, string> = {
  normal: "عادية",
  routine: "عادية",
  secret: "سرية",
  confidential: "سرية",
  restricted: "مقيّدة",
  top_secret: "سرية مشددة",
  urgent: "عاجلة",
  immediate: "فورية",
  high: "مرتفعة",
  low: "منخفضة",
  security: "أمنية",
  administrative: "إدارية",
  pending: "قيد المعالجة",
  draft: "مسودة",
  approved: "معتمدة",
  rejected: "مرفوضة",
  completed: "مكتملة",
  sent: "مرسلة",
  archived: "مؤرشفة",
  deleted: "محذوفة",
  print: "طباعة",
  download: "تنزيل",
  upload: "رفع",
  pdf: "ملف PDF",
  png: "صورة PNG",
  jpg: "صورة JPG",
  jpeg: "صورة JPEG",
  xlsx: "ملف Excel",
  excel: "Excel",
  permanent: "حذف نهائي",
  soft: "حذف قابل للاستعادة",
  true: "نعم",
  false: "لا",
  success: "ناجحة",
  failed: "فاشلة",
  web: "موقع الويب",
  mobile: "تطبيق الهاتف",
  owner: "مالك النظام",
  platform_owner: "مالك المنصة",
  admin: "مسؤول النظام",
  unit_admin: "مسؤول الجهة",
  reviewer: "مراجع",
  auditor: "مدقق",
  officer: "موظف",
  member: "موظف جهة",
};

const keyWordLabels: Record<string, string> = {
  serial: "رقم",
  number: "رقم",
  code: "مرجعي",
  date: "التاريخ",
  time: "الوقت",
  status: "الحالة",
  from: "من",
  to: "إلى",
  count: "العدد",
  file: "الملف",
  attachment: "المرفق",
  organization: "الجهة",
  user: "المستخدم",
  accepted: "الاستلام",
  approved: "الاعتماد",
  created: "الإنشاء",
  updated: "التعديل",
};

const technicalKeys = new Set([
  "actoruserid",
  "createdbyuserid",
  "userid",
  "organizationid",
  "parentorganizationid",
  "resourceid",
  "entityid",
  "ipaddress",
  "useragent",
  "deviceid",
  "storagekey",
  "endpoint",
  "url",
]);

function recordFrom(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function isTechnicalField(key: string, value: unknown): boolean {
  const normalized = key.replace(/[_-]/g, "").toLowerCase();
  if (
    technicalKeys.has(normalized) ||
    normalized.includes("hash") ||
    normalized.includes("token") ||
    normalized.includes("secret")
  ) {
    return true;
  }
  return (
    normalized.endsWith("id") &&
    key !== "telegramId" &&
    typeof value === "string" &&
    value.length > 24
  );
}

function labelForKey(key: string): string {
  if (fieldLabels[key]) return fieldLabels[key];
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const translated = words.map(word => keyWordLabels[word]);
  return translated.every(Boolean) ? translated.join(" ") : "معلومة إضافية";
}

function displayFieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "غير محدد";
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  if (typeof value === "number")
    return new Intl.NumberFormat("ar-SY").format(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "لا توجد عناصر";
    if (/ids?$/i.test(key)) return `${value.length} عناصر مرتبطة`;
    return value
      .slice(0, 5)
      .map(item => displayFieldValue(key, item))
      .join("، ");
  }
  if (typeof value === "object") {
    const count = Object.keys(value as Record<string, unknown>).length;
    return count ? `تفاصيل إضافية (${count})` : "لا توجد تفاصيل";
  }
  const text = String(value).trim();
  if (["occurredAt", "createdAt", "updatedAt"].includes(key)) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat("ar-SY", {
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(date);
    }
  }
  const normalized = text.toLowerCase().replace(/[\s-]+/g, "_");
  const fieldToken = `${key}:${normalized}`;
  if (tokenLabels[fieldToken]) return tokenLabels[fieldToken];
  if (tokenLabels[normalized]) return tokenLabels[normalized];
  if (/^[a-z0-9_.-]{1,64}$/i.test(text)) return "قيمة مسجلة";
  if (/^[0-9a-f]{24,}$/i.test(text)) return "معرّف مسجل";
  return text.length > 240 ? `${text.slice(0, 237)}…` : text;
}

export function auditActionLabel(value: unknown): string {
  const action = String(value ?? "").trim();
  return auditActionLabels[action] ?? "إجراء مسجل";
}

export function auditEntitySummary(
  typeValue: unknown,
  idValue: unknown
): string {
  const type = String(typeValue ?? "").trim();
  const label = entityLabels[type] ?? "سجل النظام";
  const id = String(idValue ?? "").trim();
  if (!id || id === "null") return label;
  if (/^\d{1,12}$/.test(id)) return `${label} رقم ${id}`;
  return label;
}

export function auditRoleLabel(value: unknown): string {
  const role = String(value ?? "")
    .trim()
    .toLowerCase();
  return tokenLabels[role] ?? (role ? "صلاحية مسجلة" : "غير محددة");
}

export function auditDeviceLabel(value: unknown): string {
  const device = String(value ?? "")
    .trim()
    .toLowerCase();
  if (
    device === "mobile" ||
    device === "app" ||
    device === "android" ||
    device === "ios"
  ) {
    return "تطبيق الهاتف";
  }
  if (device === "web" || device === "browser" || device === "desktop") {
    return "موقع الويب";
  }
  return "غير محدد";
}

export function auditUserAgentSummary(value: unknown): string {
  const agent = String(value ?? "").trim();
  if (!agent) return "بيانات المتصفح غير متاحة";
  const browser = /Edg\//i.test(agent)
    ? "Microsoft Edge"
    : /Firefox\//i.test(agent)
      ? "Firefox"
      : /Chrome\//i.test(agent)
        ? "Google Chrome"
        : /Safari\//i.test(agent)
          ? "Safari"
          : /AppleWebKit/i.test(agent)
            ? "متصفح الهاتف"
            : "متصفح غير محدد";
  const platform = /Android/i.test(agent)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(agent)
      ? "iPhone أو iPad"
      : /Windows/i.test(agent)
        ? "Windows"
        : /Mac OS|Macintosh/i.test(agent)
          ? "macOS"
          : /Linux/i.test(agent)
            ? "Linux"
            : "جهاز غير محدد";
  return `${browser} على ${platform}`;
}

export function readableAuditFields(value: unknown): AuditField[] {
  const record = recordFrom(value);
  if (!record) {
    if (
      typeof value === "string" &&
      value.trim() &&
      !/^[\s{}[\]]+$/.test(value)
    ) {
      return [{ label: "ملاحظة", value: displayFieldValue("note", value) }];
    }
    return [];
  }
  return Object.entries(record)
    .filter(([key, item]) => !isTechnicalField(key, item))
    .slice(0, 24)
    .map(([key, item]) => ({
      label: labelForKey(key),
      value: displayFieldValue(key, item),
    }));
}

export function rawAuditDetails(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
