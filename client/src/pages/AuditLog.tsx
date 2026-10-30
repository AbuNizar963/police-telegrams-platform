import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FilterX,
  History,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

const actionLabels: Record<string, string> = {
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
  "telegram.broadcast.atomic_failure": "فشل توزيع البرقية",
  "user.create": "إنشاء مستخدم",
  "user.update": "تعديل بيانات مستخدم",
  "user.disable": "تعطيل مستخدم",
  "user.enable": "تفعيل مستخدم",
  "user.delete": "حذف مستخدم",
  "platform.owner_workplace.switch": "تغيير جهة عمل المالك",
};

const entityLabels: Record<string, string> = {
  telegram: "برقية",
  telegram_attachment: "مرفق برقية",
  telegram_collection: "مجموعة برقيات",
  organization: "جهة",
  user: "مستخدم",
  settings: "إعدادات",
  attachment: "مرفق",
  platform: "النظام",
};

type Filters = {
  search: string;
  action: string;
  resourceId: string;
  from: string;
  to: string;
  page: number;
};

const defaultFilters: Filters = {
  search: "",
  action: "",
  resourceId: "",
  from: "",
  to: "",
  page: 1,
};

function displayValue(value: unknown, fallback = "—"): string {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text && text !== "null" ? text : fallback;
}

function formatDate(value: unknown): string {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "تاريخ غير متاح";
  return date.toLocaleString("ar-SY", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hour12: false,
  });
}

function formatMetadata(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function dayStart(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function dayEnd(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export default function AuditLogPage() {
  const [draft, setDraft] = useState(defaultFilters);
  const [filters, setFilters] = useState(defaultFilters);
  const input = useMemo(
    () => ({
      page: filters.page,
      pageSize: 25,
      ...(filters.search.trim() ? { search: filters.search.trim() } : {}),
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.resourceId.trim()
        ? { resourceId: filters.resourceId.trim() }
        : {}),
      ...(dayStart(filters.from) ? { from: dayStart(filters.from) } : {}),
      ...(dayEnd(filters.to) ? { to: dayEnd(filters.to) } : {}),
    }),
    [filters]
  );
  const auditQuery = trpc.auditLogs.search.useQuery(input, {
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });
  const result = auditQuery.data ?? {
    items: [],
    total: 0,
    page: filters.page,
    pageSize: 25,
    totalPages: 1,
  };
  const hasFilters = Boolean(
    filters.search ||
    filters.action ||
    filters.resourceId ||
    filters.from ||
    filters.to
  );

  const applyFilters = (event?: FormEvent) => {
    event?.preventDefault();
    setFilters({ ...draft, page: 1 });
  };
  const clearFilters = () => {
    setDraft(defaultFilters);
    setFilters(defaultFilters);
  };
  const goToPage = (page: number) => {
    if (page < 1 || page > result.totalPages) return;
    setFilters(current => ({ ...current, page }));
  };

  return (
    <section dir="rtl" className="mx-auto w-full max-w-6xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border bg-card p-3 text-primary">
            <History className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">سجل الإجراءات</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              سجل مركزي للعمليات الإدارية والأمنية، للقراءة فقط، يتحدث تلقائيًا
              كل خمس ثوانٍ.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void auditQuery.refetch()}
          disabled={auditQuery.isFetching}
        >
          <RefreshCw
            className={
              auditQuery.isFetching
                ? "ml-2 h-4 w-4 animate-spin"
                : "ml-2 h-4 w-4"
            }
          />
          تحديث الآن
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric icon={History} label="إجمالي النتائج" value={result.total} />
        <Metric
          icon={Search}
          label="نتائج هذه الصفحة"
          value={result.items.length}
        />
        <Metric
          icon={ShieldCheck}
          label="حماية السجل"
          value="قراءة فقط · تسلسل نزاهة"
          text
        />
      </div>

      <Card>
        <CardContent className="p-4 sm:p-5">
          <form className="grid gap-3 lg:grid-cols-6" onSubmit={applyFilters}>
            <label className="grid gap-1.5 text-sm font-medium lg:col-span-2">
              الموظف أو النص
              <div className="relative">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={draft.search}
                  onChange={event =>
                    setDraft(current => ({
                      ...current,
                      search: event.target.value,
                    }))
                  }
                  placeholder="الاسم، الإجراء، أو النص"
                  className="pr-9"
                />
              </div>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              نوع الإجراء
              <select
                value={draft.action}
                onChange={event =>
                  setDraft(current => ({
                    ...current,
                    action: event.target.value,
                  }))
                }
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">كل الإجراءات</option>
                {Object.entries(actionLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              معرّف المورد
              <Input
                value={draft.resourceId}
                onChange={event =>
                  setDraft(current => ({
                    ...current,
                    resourceId: event.target.value,
                  }))
                }
                placeholder="رقم البرقية أو المورد"
                inputMode="numeric"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              من تاريخ
              <Input
                type="date"
                value={draft.from}
                max={draft.to || undefined}
                onChange={event =>
                  setDraft(current => ({
                    ...current,
                    from: event.target.value,
                  }))
                }
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              إلى تاريخ
              <Input
                type="date"
                value={draft.to}
                min={draft.from || undefined}
                onChange={event =>
                  setDraft(current => ({ ...current, to: event.target.value }))
                }
              />
            </label>
            <div className="flex items-end gap-2 lg:col-span-6">
              <Button type="submit" disabled={auditQuery.isFetching}>
                <Search className="ml-2 h-4 w-4" />
                تطبيق المرشحات
              </Button>
              {hasFilters ? (
                <Button type="button" variant="outline" onClick={clearFilters}>
                  <FilterX className="ml-2 h-4 w-4" />
                  مسح المرشحات
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      {auditQuery.isLoading ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            جارٍ تحميل سجل الإجراءات...
          </CardContent>
        </Card>
      ) : auditQuery.error ? (
        <Card>
          <CardContent className="flex items-start gap-3 p-5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="space-y-2">
              <p className="font-semibold">تعذر تحميل سجل الإجراءات</p>
              <p className="text-sm text-muted-foreground">
                {auditQuery.error.message}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => void auditQuery.refetch()}
              >
                إعادة المحاولة
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : result.items.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <History className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-semibold">
              {hasFilters
                ? "لا توجد نتائج مطابقة"
                : "لا توجد إجراءات مسجلة بعد"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasFilters
                ? "جرّب تعديل الموظف أو التاريخ أو نوع الإجراء أو المعرّف."
                : "ستظهر هنا الإجراءات التي يسجلها النظام عند تنفيذ العمليات."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {result.items.map((log: Record<string, unknown>) => (
            <AuditEntry key={String(log.id)} log={log} />
          ))}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3">
            <p className="text-xs text-muted-foreground">
              الصفحة {result.page} من {result.totalPages} · {result.total} نتيجة
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={result.page <= 1 || auditQuery.isFetching}
                onClick={() => goToPage(result.page - 1)}
              >
                <ChevronRight className="ml-1 h-4 w-4" /> الأحدث
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={
                  result.page >= result.totalPages || auditQuery.isFetching
                }
                onClick={() => goToPage(result.page + 1)}
              >
                الأقدم <ChevronLeft className="mr-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  text = false,
}: {
  icon: typeof History;
  label: string;
  value: number | string;
  text?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <Icon className="h-5 w-5 text-primary" />
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p
            className={
              text ? "text-sm font-semibold" : "text-xl font-bold tabular-nums"
            }
          >
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function AuditEntry({ log }: { log: Record<string, unknown> }) {
  const metadata = formatMetadata(log.metadata);
  const beforeState = formatMetadata(log.beforeState);
  const afterState = formatMetadata(log.afterState);
  const action = displayValue(log.action, "إجراء");
  const actionLabel = actionLabels[action] ?? action;
  const entityType = displayValue(log.entityType);
  const userAgent = displayValue(log.userAgent, "غير متوفر");
  const actorSnapshot = [
    displayValue(log.actorName),
    `رقم المستخدم ${displayValue(log.actorUserId)}`,
    displayValue(log.actorRank, "بدون رتبة"),
    displayValue(log.actorRole, "بدون دور"),
  ].join(" · ");

  return (
    <Card>
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h2 className="break-words font-bold">{actionLabel}</h2>
            <p className="text-xs text-muted-foreground">
              {formatDate(log.createdAt)}
            </p>
          </div>
          <Badge variant="outline">
            {displayValue(log.deviceType, "unknown")}
          </Badge>
        </div>
        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="منفّذ الإجراء" value={actorSnapshot} />
          <Detail
            label="العنصر المتأثر"
            value={`${entityLabels[entityType] ?? entityType}${log.entityId ? ` · ${log.entityId}` : ""}`}
          />
          <Detail
            label="عنوان الشبكة"
            value={displayValue(log.ipAddress, "غير متوفر")}
            mono
          />
        </div>
        {log.reason ? (
          <Detail label="سبب الإجراء" value={displayValue(log.reason)} />
        ) : null}
        {metadata ? (
          <JsonDetail title="تفاصيل الإجراء" value={metadata} />
        ) : null}
        {beforeState || afterState ? (
          <details className="rounded-lg border bg-muted/20 p-3">
            <summary className="cursor-pointer text-sm font-semibold">
              مقارنة قبل / بعد
            </summary>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {beforeState ? (
                <JsonDetail title="قبل" value={beforeState} compact />
              ) : null}
              {afterState ? (
                <JsonDetail title="بعد" value={afterState} compact />
              ) : null}
            </div>
          </details>
        ) : null}
        <details className="rounded-lg border bg-muted/10 p-3">
          <summary className="cursor-pointer text-sm font-semibold">
            سياق الجهاز وسلامة السجل
          </summary>
          <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
            <Detail label="المتصفح / الجهاز" value={userAgent} mono />
            <Detail
              label="بصمة السجل"
              value={displayValue(log.entryHash, "بانتظار الترحيل")}
              mono
            />
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function Detail({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          mono ? "break-all font-mono text-xs" : "break-words font-medium"
        }
      >
        {value}
      </p>
    </div>
  );
}

function JsonDetail({
  title,
  value,
  compact = false,
}: {
  title: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <details
      className={
        compact
          ? "rounded-md border bg-background/60 p-2"
          : "rounded-lg border bg-muted/20 p-3"
      }
      open={compact}
    >
      <summary className="cursor-pointer text-sm font-semibold">
        {title}
      </summary>
      <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-5">
        {value}
      </pre>
    </details>
  );
}
