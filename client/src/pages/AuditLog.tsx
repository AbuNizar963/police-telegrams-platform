import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle,
  History,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";

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
  organization: "جهة",
  user: "مستخدم",
  settings: "إعدادات",
  attachment: "مرفق",
  platform: "النظام",
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

export default function AuditLogPage() {
  const [search, setSearch] = useState("");
  const auditQuery = trpc.auditLogs.list.useQuery(undefined, {
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const logs = auditQuery.data ?? [];
  const filteredLogs = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase();
    if (!normalized) return logs;
    return logs.filter(log =>
      [
        log.actorName,
        log.actorUserId,
        log.action,
        actionLabels[log.action] ?? "",
        log.entityType,
        entityLabels[log.entityType] ?? "",
        log.entityId,
        log.ipAddress,
        log.deviceType,
        log.metadata,
      ]
        .map(value => displayValue(value, ""))
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalized)
    );
  }, [logs, search]);

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
              سجل مركزي للعمليات الإدارية والأمنية المسجلة في النظام.
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
            className={`ml-2 h-4 w-4 ${auditQuery.isFetching ? "animate-spin" : ""}`}
          />
          تحديث السجل
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <History className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">السجلات المحمّلة</p>
              <p className="text-xl font-bold tabular-nums">{logs.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Search className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">نتائج البحث</p>
              <p className="text-xl font-bold tabular-nums">
                {filteredLogs.length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">طريقة العرض</p>
              <p className="text-sm font-semibold">
                قراءة فقط · أحدث 200 إجراء
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="relative">
        <Search
          className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="ابحث بالمستخدم أو نوع الإجراء أو الجهة أو المعرّف..."
          aria-label="البحث في سجل الإجراءات"
          className="pr-9"
        />
      </div>

      {auditQuery.isLoading ? (
        <Card>
          <CardContent
            className="p-8 text-center text-sm text-muted-foreground"
          >
            جارٍ تحميل سجل الإجراءات...
          </CardContent>
        </Card>
      ) : auditQuery.error ? (
        <Card>
          <CardContent className="flex items-start gap-3 p-5">
            <AlertTriangle
              className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
            />
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
      ) : filteredLogs.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <History className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-semibold">
              {search.trim()
                ? "لا توجد نتائج مطابقة"
                : "لا توجد إجراءات مسجلة بعد"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {search.trim()
                ? "جرّب كلمات بحث أخرى."
                : "ستظهر هنا الإجراءات التي يسجلها النظام عند تنفيذ العمليات."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredLogs.map(log => {
            const metadata = formatMetadata(log.metadata);
            const actionLabel = actionLabels[log.action] ?? log.action;
            return (
              <Card key={log.id}>
                <CardContent className="space-y-3 p-4 sm:p-5">
                  <div
                    className="flex flex-wrap items-start justify-between gap-3"
                  >
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
                  <div
                    className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3"
                  >
                    <div>
                      <p className="text-xs text-muted-foreground">
                        منفّذ الإجراء
                      </p>
                      <p className="break-words font-medium">
                        {displayValue(log.actorName)} · رقم المستخدم{" "}
                        {displayValue(log.actorUserId)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        العنصر المتأثر
                      </p>
                      <p className="break-words font-medium">
                        {entityLabels[log.entityType] ??
                          displayValue(log.entityType)}
                        {log.entityId ? ` · ${log.entityId}` : ""}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        عنوان الشبكة
                      </p>
                      <p className="break-all font-mono text-xs">
                        {displayValue(log.ipAddress, "غير متوفر")}
                      </p>
                    </div>
                  </div>
                  {metadata ? (
                    <details className="rounded-lg border bg-muted/20 p-3">
                      <summary className="cursor-pointer text-sm font-semibold">
                        تفاصيل الإجراء
                      </summary>
                      <pre
                        className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-5"
                      >
                        {metadata}
                      </pre>
                    </details>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
