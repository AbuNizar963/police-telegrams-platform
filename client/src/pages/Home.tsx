import { trpc } from "@/lib/trpc";
import OwnerUserManagement from "@/components/OwnerUserManagement";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowUpLeft,
  Building2,
  Camera,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Command,
  FileDown,
  FileImage,
  FileText,
  ImagePlus,
  Filter,
  LocateFixed,
  LockKeyhole,
  MapPinned,
  Menu,
  Mic,
  Plus,
  Printer,
  Radio,
  Search,
  Save,
  Settings2,
  Share2,
  Shield,
  Siren,
  SlidersHorizontal,
  Square,
  Upload,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createArabicSpeechRecognition,
  extractArabicTextFromImage,
} from "@/lib/localInput";
import {
  correctArabicSpeechText,
  removeRepeatedSpeech,
} from "@/lib/arabicSpeech";
import { showLocalTelegramNotification } from "@/lib/notifications";
import qrcode from "@/lib/qrcode-generator";
import { stringToBytes as utf8StringToBytes } from "@/lib/qrcode-utf8";

qrcode.stringToBytes = utf8StringToBytes;

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    character =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character
  );
}

const numberFormatter = new Intl.NumberFormat("en-US");
const classificationLabels = { secret: "سري", normal: "عادي" } as const;
const priorityLabels = {
  slow: "بطيء",
  normal: "عادي",
  urgent: "عاجل",
} as const;
const categoryLabels = {
  criminal: "جنائي",
  administrative: "إداري",
  traffic: "مروري",
  security: "أمني",
  tactical: "تكتيكي",
} as const;
const statusLabels = {
  draft: "مسودة",
  submitted: "مرسلة للمراجعة",
  in_review: "قيد المراجعة",
  approved: "معتمدة",
  returned: "معادة للتصحيح",
  rejected: "مرفوضة",
  forwarded: "محالة",
  pending: "قيد الانتظار",
  in_progress: "تحت الإجراء",
  resolved: "مكتملة",
  completed: "مكتملة نهائيًا",
  archived: "مؤرشفة",
} as const;
const statusStyles = {
  draft: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  submitted: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  in_review: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  approved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  returned: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  rejected: "bg-red-500/10 text-red-700 dark:text-red-300",
  forwarded: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  in_progress: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  resolved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  completed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  archived: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
} as const;
const classificationStyles = {
  secret:
    "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-300",
  normal:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300",
} as const;

type Classification = keyof typeof classificationLabels;
type Priority = keyof typeof priorityLabels;
type Category = keyof typeof categoryLabels;
type Status = keyof typeof statusLabels;
type NumberSystem = "latin" | "arabic" | "hindi";
type DisplayColumn = "category" | "priority" | "creator";
const DEFAULT_DISPLAY_COLUMNS: Record<DisplayColumn, boolean> = {
  category: true,
  priority: true,
  creator: true,
};

const arabicIndicDigits = "٠١٢٣٤٥٦٧٨٩";
const hindiDigits = "०१२३४५६७८९";
function localizeDigits(value: string, system: NumberSystem) {
  if (system === "latin") return value;
  const digits = system === "arabic" ? arabicIndicDigits : hindiDigits;
  return value.replace(/[0-9]/g, digit => digits[Number(digit)] ?? digit);
}
function formatCount(value: number, system: NumberSystem) {
  return localizeDigits(numberFormatter.format(value), system);
}
function formatConfiguredDate(
  value: Date | string | number,
  settings?: {
    timezone?: string;
    dateFormat?: string;
    numberSystem?: NumberSystem;
  }
) {
  const date = new Date(value);
  const timezone = settings?.timezone ?? "Asia/Riyadh";
  if (settings?.dateFormat === "dd MMM yyyy HH:mm")
    return localizeDigits(
      new Intl.DateTimeFormat("ar-SA", {
        timeZone: timezone,
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date),
      settings?.numberSystem ?? "latin"
    );
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .map(part => [part.type, part.value])
  );
  const text =
    settings?.dateFormat === "yyyy-MM-dd HH:mm:ss"
      ? `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
      : `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
  return localizeDigits(text, settings?.numberSystem ?? "latin");
}

function SeverityBadge({ value }: { value: Classification }) {
  const Icon = value === "secret" ? LockKeyhole : Shield;
  return (
    <Badge
      variant="outline"
      className={`gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold ${classificationStyles[value]}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {classificationLabels[value]}
    </Badge>
  );
}

function StatusBadge({ value }: { value: Status }) {
  const statusDotClass =
    value === "in_progress" || value === "in_review"
      ? "animate-pulse bg-blue-500"
      : value === "resolved" || value === "approved" || value === "completed"
        ? "bg-emerald-500"
        : value === "pending" || value === "returned"
          ? "bg-amber-500"
          : "bg-slate-400";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold ${statusStyles[value]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass}`} />
      {statusLabels[value]}
    </span>
  );
}

function PriorityBadge({ value }: { value: Priority }) {
  const tone =
    value === "urgent"
      ? "bg-red-500/10 text-red-700 dark:text-red-300"
      : value === "slow"
        ? "bg-slate-500/10 text-slate-600 dark:text-slate-300"
        : "bg-blue-500/10 text-blue-700 dark:text-blue-300";
  return (
    <span
      className={`inline-flex rounded-md px-2.5 py-1 text-[11px] font-semibold ${tone}`}
    >
      {priorityLabels[value]}
    </span>
  );
}

function Kpi({
  label,
  value,
  detail,
  icon: Icon,
  tone,
  numberSystem,
}: {
  label: string;
  value: number;
  detail: string;
  icon: typeof FileText;
  tone: string;
  numberSystem: NumberSystem;
}) {
  return (
    <Card className="border-border/60 bg-card shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">
              {formatCount(value, numberSystem)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
          </div>
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}
          >
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState<"all" | Classification>("all");
  const [priority, setPriority] = useState<"all" | Priority>("all");
  const [status, setStatus] = useState<"all" | Status>("all");
  const [category, setCategory] = useState<"all" | Category>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [composerOpen, setComposerOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [displayCustomizeOpen, setDisplayCustomizeOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [displayColumns, setDisplayColumns] = useState<
    Record<DisplayColumn, boolean>
  >(DEFAULT_DISPLAY_COLUMNS);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(
        "police-telegrams.display-columns"
      );
      if (!stored) return;
      const parsed = JSON.parse(stored) as Partial<
        Record<DisplayColumn, unknown>
      >;
      setDisplayColumns({
        category: parsed.category !== false,
        priority: parsed.priority !== false,
        creator: parsed.creator !== false,
      });
    } catch {
      // Ignore invalid or unavailable local display preferences.
    }
  }, []);

  useEffect(() => {
    const telegramId = Number(
      new URLSearchParams(window.location.search).get("telegram")
    );
    if (Number.isInteger(telegramId) && telegramId > 0) {
      setSelectedId(telegramId);
    }
  }, []);

  const updateDisplayColumns = (column: DisplayColumn, visible: boolean) => {
    setDisplayColumns(current => {
      const next = { ...current, [column]: visible };
      try {
        window.localStorage.setItem(
          "police-telegrams.display-columns",
          JSON.stringify(next)
        );
      } catch {
        // Display customization still works for the current session if storage is unavailable.
      }
      return next;
    });
  };

  const resetDisplayColumns = () => {
    setDisplayColumns(DEFAULT_DISPLAY_COLUMNS);
    try {
      window.localStorage.removeItem("police-telegrams.display-columns");
    } catch {
      // Ignore storage errors; the in-memory defaults are still applied.
    }
  };

  const desktopGridClass = [
    "grid",
    "w-full",
    "gap-3",
    "text-right",
    "md:items-center",
    "md:px-5",
    "transition-colors",
    "hover:bg-muted/40",
    displayColumns.category && displayColumns.priority && displayColumns.creator
      ? "md:grid-cols-[110px_minmax(180px,1fr)_120px_125px_145px_32px]"
      : displayColumns.category && displayColumns.priority
        ? "md:grid-cols-[110px_minmax(180px,1fr)_120px_125px_32px]"
        : displayColumns.category && displayColumns.creator
          ? "md:grid-cols-[110px_minmax(180px,1fr)_120px_145px_32px]"
          : displayColumns.priority && displayColumns.creator
            ? "md:grid-cols-[110px_minmax(180px,1fr)_125px_145px_32px]"
            : displayColumns.category
              ? "md:grid-cols-[110px_minmax(180px,1fr)_120px_32px]"
              : displayColumns.priority
                ? "md:grid-cols-[110px_minmax(180px,1fr)_125px_32px]"
                : displayColumns.creator
                  ? "md:grid-cols-[110px_minmax(180px,1fr)_145px_32px]"
                  : "md:grid-cols-[110px_minmax(180px,1fr)_32px]",
  ].join(" ");
  const desktopGridHeaderClass =
    desktopGridClass.match(/md:grid-cols-\[[^\]]+\]/)?.[0] ??
    "md:grid-cols-[110px_minmax(180px,1fr)_120px_125px_145px_32px]";

  const input = useMemo(
    () => ({
      search: search.trim() || undefined,
      classification: severity === "all" ? undefined : severity,
      priority: priority === "all" ? undefined : priority,
      status: status === "all" ? undefined : status,
      category: category === "all" ? undefined : category,
      page,
      pageSize: 50,
    }),
    [search, severity, priority, status, category, page]
  );
  useEffect(() => {
    setPage(1);
  }, [search, severity, priority, status, category]);
  const settings = trpc.settings.get.useQuery();
  const me = trpc.auth.me.useQuery();
  const organizationContext = trpc.organizations.context.useQuery();
  const stats = trpc.dashboard.stats.useQuery();
  const routingTargets = trpc.organizations.routingTargets.useQuery();
  const list = trpc.telegrams.list.useQuery(input);
  const detail = trpc.telegrams.get.useQuery(
    { id: selectedId ?? 0 },
    { enabled: selectedId !== null }
  );
  const utils = trpc.useUtils();
  const create = trpc.telegrams.create.useMutation({
    onSuccess: telegram => {
      toast.success("تم تسجيل البرقية وربطها بهويتك الرقمية");
      void showLocalTelegramNotification({
        serialCode: telegram.serialCode,
        subject: telegram.subject,
        telegramId: telegram.id,
      });
      setComposerOpen(false);
      utils.telegrams.list.invalidate();
      utils.dashboard.stats.invalidate();
    },
    onError: error => toast.error(error.message || "تعذر إنشاء البرقية"),
  });
  const data = stats.data ?? {
    total: 0,
    today: 0,
    urgent: 0,
    secret: 0,
    pending: 0,
    inProgress: 0,
    resolved: 0,
  };
  const numberSystem = ((
    settings.data as { numberSystem?: NumberSystem } | undefined
  )?.numberSystem ?? "latin") as NumberSystem;
  const rows = list.data ?? [];

  return (
    <div dir="rtl" className="min-h-[calc(100vh-3rem)] space-y-4 pb-10">
      <div className="flex flex-col gap-3 border-b border-border/70 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#10233f] text-[#d8c38e] shadow-sm">
            <Radio className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9b7c3d]">
                TELEGRAM OPERATIONS
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-600">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                النظام متصل
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">
              مركز البرقيات
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="hidden items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground md:flex">
            <Clock3 className="h-3.5 w-3.5" />
            {formatConfiguredDate(new Date(), settings.data)}
          </div>
          {(me.data?.role === "admin" ||
            [
              "system_admin",
              "organization_admin",
              "reviewer",
              "reader",
              "auditor",
            ].includes(organizationContext.data?.role ?? "")) && (
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-lg"
              onClick={() => setReportOpen(true)}
              aria-haspopup="dialog"
            >
              تقرير البرقيات
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-lg"
            onClick={() => setDisplayCustomizeOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={displayCustomizeOpen}
          >
            <SlidersHorizontal className="ml-2 h-4 w-4" />
            تخصيص العرض
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-lg"
            onClick={() => setFiltersOpen(value => !value)}
            aria-expanded={filtersOpen}
          >
            <Filter className="ml-2 h-4 w-4" />
            الفلاتر
            {(severity !== "all" ||
              priority !== "all" ||
              status !== "all" ||
              category !== "all") && (
              <span className="mr-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#10233f] px-1.5 text-[10px] text-white">
                {
                  [
                    severity !== "all",
                    priority !== "all",
                    status !== "all",
                    category !== "all",
                  ].filter(Boolean).length
                }
              </span>
            )}
          </Button>
          <Button
            onClick={() => setComposerOpen(true)}
            className="h-10 rounded-lg bg-[#10233f] px-4 text-white hover:bg-[#18375f]"
          >
            <Plus className="ml-2 h-4 w-4" />
            برقية جديدة
          </Button>
        </div>
      </div>

      {data.urgent > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500 text-white">
              <Siren className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-bold">تنبيه أمني يحتاج إلى متابعة</p>
              <p className="text-xs opacity-80">
                يوجد {formatCount(data.urgent, numberSystem)} برقية ذات أولوية
                عاجلة ضمن نطاق صلاحيتك.
              </p>
            </div>
          </div>
          <button
            onClick={() => setPriority("urgent")}
            className="rounded-lg border border-current/20 px-3 py-1.5 text-xs font-semibold hover:bg-red-500/10"
          >
            عرض البرقيات <ArrowUpLeft className="mr-1 inline h-3 w-3" />
          </button>
        </div>
      )}

      <section
        aria-label="إحصائيات البرقيات"
        className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6"
      >
        <Kpi
          numberSystem={numberSystem}
          label="إجمالي البرقيات"
          value={data.total}
          detail="الرصيد التشغيلي"
          icon={FileText}
          tone="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
        />
        <Kpi
          numberSystem={numberSystem}
          label="الصادرة اليوم"
          value={data.today}
          detail="آخر 24 ساعة"
          icon={Activity}
          tone="bg-blue-500/10 text-blue-600"
        />
        <Kpi
          numberSystem={numberSystem}
          label="أولوية عاجل"
          value={data.urgent}
          detail="تحتاج انتباهاً"
          icon={Siren}
          tone="bg-red-500/10 text-red-600"
        />
        <Kpi
          numberSystem={numberSystem}
          label="برقيات سرية"
          value={data.secret}
          detail="مقيدة الصلاحية"
          icon={LockKeyhole}
          tone="bg-violet-500/10 text-violet-600"
        />
        <Kpi
          numberSystem={numberSystem}
          label="تحت الإجراء"
          value={data.inProgress}
          detail="قيد المعالجة"
          icon={Radio}
          tone="bg-cyan-500/10 text-cyan-600"
        />
        <Kpi
          numberSystem={numberSystem}
          label="مكتملة"
          value={data.resolved}
          detail="تم إغلاقها"
          icon={CheckCircle2}
          tone="bg-emerald-500/10 text-emerald-600"
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0 rounded-2xl border border-border/70 bg-card shadow-sm">
          <div className="flex flex-col gap-4 border-b p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">سجل البرقيات</h2>
                <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                  {formatCount(rows.length, numberSystem)} نتيجة
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                مرجع موحّد للبرقيات مع ختم الهوية الرقمية وسجل زمني كامل.
              </p>
            </div>
            <div className="relative w-full lg:w-72">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="بحث بالرقم، الموضوع، الاسم..."
                className="h-10 rounded-lg bg-background pr-10"
              />
            </div>
          </div>
          {filtersOpen && (
            <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-4 py-3">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <select
                value={severity}
                onChange={event =>
                  setSeverity(event.target.value as "all" | Classification)
                }
                className="rounded-md border bg-background px-2.5 py-1.5 text-xs"
              >
                <option value="all">كل درجات السرية</option>
                {(Object.keys(classificationLabels) as Classification[]).map(
                  item => (
                    <option key={item} value={item}>
                      {classificationLabels[item]}
                    </option>
                  )
                )}
              </select>
              <select
                value={priority}
                onChange={event =>
                  setPriority(event.target.value as "all" | Priority)
                }
                className="rounded-md border bg-background px-2.5 py-1.5 text-xs"
              >
                <option value="all">كل الأولويات</option>
                {(Object.keys(priorityLabels) as Priority[]).map(item => (
                  <option key={item} value={item}>
                    {priorityLabels[item]}
                  </option>
                ))}
              </select>
              <select
                value={status}
                onChange={event =>
                  setStatus(event.target.value as "all" | Status)
                }
                className="rounded-md border bg-background px-2.5 py-1.5 text-xs"
              >
                <option value="all">كل الحالات</option>
                {(Object.keys(statusLabels) as Status[]).map(item => (
                  <option key={item} value={item}>
                    {statusLabels[item]}
                  </option>
                ))}
              </select>
              <select
                value={category}
                onChange={event =>
                  setCategory(event.target.value as "all" | Category)
                }
                className="rounded-md border bg-background px-2.5 py-1.5 text-xs"
              >
                <option value="all">كل التصنيفات</option>
                {(Object.keys(categoryLabels) as Category[]).map(item => (
                  <option key={item} value={item}>
                    {categoryLabels[item]}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  setSeverity("all");
                  setPriority("all");
                  setStatus("all");
                  setCategory("all");
                }}
                className="mr-auto text-xs text-muted-foreground hover:text-foreground"
              >
                مسح الفلاتر
              </button>
            </div>
          )}
          <div
            className={`hidden gap-3 border-b bg-muted/30 px-5 py-3 text-[10px] font-bold uppercase tracking-wide text-muted-foreground md:grid ${desktopGridHeaderClass}`}
          >
            <span>الرقم</span>
            <span>موضوع البرقية</span>
            {displayColumns.category && <span>التصنيف</span>}
            {displayColumns.priority && <span>الأولوية / السرية</span>}
            {displayColumns.creator && <span>المنشئ / الوقت</span>}
            <span />
          </div>
          <div className="divide-y">
            {list.isLoading && (
              <div className="p-12 text-center text-sm text-muted-foreground">
                جارٍ تحديث سجل البرقيات...
              </div>
            )}
            {!list.isLoading && rows.length === 0 && (
              <div className="p-14 text-center">
                <FileText className="mx-auto h-10 w-10 text-muted-foreground/30" />
                <p className="mt-3 font-semibold">لا توجد نتائج</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  غيّر الفلاتر أو أنشئ برقية جديدة.
                </p>
              </div>
            )}
            {rows.map(row => (
              <button
                key={row.id}
                onClick={() => setSelectedId(row.id)}
                className={`group ${desktopGridClass} px-4 py-4`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-[#9b7c3d]">
                    {localizeDigits(row.serialCode, numberSystem)}
                  </span>
                  <span className="md:hidden">
                    <StatusBadge value={row.status} />
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{row.subject}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    إلى: {row.recipient}
                  </p>
                </div>
                {displayColumns.category && (
                  <span className="text-xs text-muted-foreground">
                    {categoryLabels[row.category]}
                  </span>
                )}
                {displayColumns.priority && (
                  <div className="flex flex-wrap items-center gap-1">
                    <PriorityBadge value={row.priority} />
                    <SeverityBadge value={row.classification} />
                  </div>
                )}
                {displayColumns.creator && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <UserRound className="h-3.5 w-3.5" />
                    <span className="truncate">{row.creatorName}</span>
                    <span className="hidden lg:inline">
                      {formatConfiguredDate(row.createdAt, settings.data)}
                    </span>
                  </div>
                )}
                <ChevronLeft className="hidden h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-x-1 md:block" />
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
            <span>صفحة {formatCount(page, numberSystem)}</span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page === 1 || list.isFetching}
                onClick={() => setPage(current => Math.max(1, current - 1))}
              >
                السابق
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={rows.length < 50 || list.isFetching}
                onClick={() => setPage(current => current + 1)}
              >
                التالي
              </Button>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Command className="h-4 w-4 text-[#9b7c3d]" />
                  <h3 className="font-bold">مركز الإجراءات</h3>
                </div>
                <Settings2 className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-4 space-y-2">
                {me.data?.role === "admin" && (
                  <QuickAction
                    icon={Users}
                    label="إدارة حسابات الشرطيين"
                    detail="إنشاء حسابات الدخول ومراجعة المسجلين"
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent("open-owner-user-management")
                      )
                    }
                  />
                )}
                <QuickAction
                  icon={Plus}
                  label="إنشاء برقية"
                  detail="فتح نموذج موثق"
                  onClick={() => setComposerOpen(true)}
                />
                <QuickAction
                  icon={MapPinned}
                  label="المواقع المسجلة"
                  detail="البرقيات ذات الإحداثيات"
                  onClick={() =>
                    toast.info("تظهر الإحداثيات المسجلة داخل تفاصيل البرقية")
                  }
                />
                <QuickAction
                  icon={Users}
                  label="الوحدات المرتبطة"
                  detail="الوحدات المتاحة للإحالة"
                  onClick={() =>
                    toast.info("اختر البرقية ثم استخدم لوحة الإحالة المركزية")
                  }
                />
                <QuickAction
                  icon={Archive}
                  label="الأرشيف"
                  detail="السجلات المغلقة"
                  onClick={() => setStatus("archived")}
                />
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-[#10233f] text-white shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-[#d8c38e]">
                <Shield className="h-4 w-4" />
                <span className="text-xs font-semibold tracking-wide">
                  سلامة السجل
                </span>
              </div>
              <p className="mt-3 text-sm font-semibold">الهوية الرقمية مفعلة</p>
              <p className="mt-2 text-xs leading-6 text-slate-300">
                كل برقية تُربط بحساب منشئها وتوقيتها وسجل التدقيق. الأرشفة
                الإدارية متاحة للمالك فقط ويُسجل في سجل التدقيق.
              </p>
              <div className="mt-4 flex items-center gap-2 text-[11px] text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                حماية تشغيلية نشطة
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>

      {displayCustomizeOpen && (
        <DisplayCustomizationModal
          columns={displayColumns}
          onChange={updateDisplayColumns}
          onReset={resetDisplayColumns}
          close={() => setDisplayCustomizeOpen(false)}
        />
      )}
      {reportOpen && (
        <TelegramReportModal
          settings={settings.data}
          close={() => setReportOpen(false)}
        />
      )}
      {composerOpen && (
        <TelegramComposer
          pending={create.isPending}
          close={() => setComposerOpen(false)}
          submit={values => create.mutate(values)}
        />
      )}
      {selectedId !== null && detail.data && (
        <TelegramDetail
          telegram={detail.data}
          settings={settings.data}
          isAdmin={me.data?.role === "admin"}
          canOperate={
            me.data?.role === "admin" ||
            [
              "system_admin",
              "organization_admin",
              "reviewer",
              "dispatcher",
            ].includes(organizationContext.data?.role ?? "")
          }
          routingTargets={routingTargets.data ?? []}
          close={() => setSelectedId(null)}
        />
      )}
      {me.data?.role === "admin" && (
        <DepartmentSettingsModal settings={settings.data} />
      )}
      {me.data?.role === "admin" && <OwnerUserManagement />}
    </div>
  );
}

function DisplayCustomizationModal({
  columns,
  onChange,
  onReset,
  close,
}: {
  columns: Record<DisplayColumn, boolean>;
  onChange: (column: DisplayColumn, visible: boolean) => void;
  onReset: () => void;
  close: () => void;
}) {
  const options: Array<{
    key: DisplayColumn;
    label: string;
    description: string;
  }> = [
    {
      key: "category",
      label: "التصنيف",
      description: "يعرض نوع البرقية مثل جنائي أو إداري.",
    },
    {
      key: "priority",
      label: "الأولوية والسرية",
      description: "يعرض مستوى الأولوية ودرجة السرية.",
    },
    {
      key: "creator",
      label: "المنشئ والوقت",
      description: "يعرض اسم المنشئ ووقت إنشاء البرقية.",
    },
  ];

  return (
    <Modal
      title="تخصيص عرض سجل البرقيات"
      subtitle="DISPLAY / TABLE SETTINGS"
      close={close}
    >
      <div className="space-y-4">
        <div className="rounded-xl border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
          اختر المعلومات التي تظهر في سجل البرقيات على الشاشات الكبيرة. الرقم
          والموضوع يبقيان ظاهرين دائمًا حتى لا تفقد هوية السجل الأساسية.
        </div>
        <div className="space-y-2">
          {options.map(option => (
            <label
              key={option.key}
              className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/40"
            >
              <input
                type="checkbox"
                checked={columns[option.key]}
                onChange={event => onChange(option.key, event.target.checked)}
                className="mt-1 h-4 w-4 accent-[#10233f]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-bold">{option.label}</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <button
            type="button"
            onClick={onReset}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            إعادة العرض الافتراضي
          </button>
          <Button
            type="button"
            onClick={close}
            className="h-10 rounded-lg bg-[#10233f] text-white hover:bg-[#18375f]"
          >
            تم
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function TelegramReportModal({
  settings,
  close,
}: {
  settings?: {
    timezone?: string;
    dateFormat?: string;
    numberSystem?: NumberSystem;
  };
  close: () => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | Status>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const report = trpc.reports.telegrams.useQuery({
    search: search.trim() || undefined,
    status: status === "all" ? undefined : status,
    from: from ? new Date(from).toISOString() : undefined,
    to: to ? new Date(to).toISOString() : undefined,
    page: 1,
    pageSize: 100,
  });
  const rows = report.data?.rows ?? [];
  const safeCsvCell = (value: unknown) => {
    const text = String(value ?? "").replace(/"/g, '""');
    const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${guarded}"`;
  };
  const downloadCsv = () => {
    const header = [
      "رقم البرقية",
      "الموضوع",
      "الجهة",
      "الحالة",
      "السرية",
      "الأولوية",
      "تاريخ الإنشاء",
    ];
    const lines = [
      header,
      ...rows.map(row => [
        row.serialCode,
        row.subject,
        row.recipient,
        statusLabels[row.status],
        classificationLabels[row.classification],
        priorityLabels[row.priority],
        formatConfiguredDate(row.createdAt, settings),
      ]),
    ].map(line => line.map(safeCsvCell).join(","));
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + lines.join("\n")], {
        type: "text/csv;charset=utf-8",
      })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `telegram-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Modal
      title="تقرير البرقيات"
      subtitle={
        report.data
          ? `أُنشئ في ${formatConfiguredDate(report.data.generatedAt, settings)}`
          : "مصدر البيانات الرسمي"
      }
      close={close}
    >
      <div className="space-y-4">
        {report.isError && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800"
          >
            تعذر تحميل التقرير المركزي.
          </div>
        )}
        <div className="grid gap-2 rounded-xl border bg-muted/20 p-3 sm:grid-cols-4">
          <Input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="بحث بالرقم أو الموضوع"
            className="h-9 text-xs"
            aria-label="بحث التقرير"
          />
          <select
            value={status}
            onChange={event => setStatus(event.target.value as "all" | Status)}
            className="h-9 rounded-md border bg-background px-2 text-xs"
            aria-label="حالة التقرير"
          >
            <option value="all">كل الحالات</option>
            {(Object.keys(statusLabels) as Status[]).map(item => (
              <option key={item} value={item}>
                {statusLabels[item]}
              </option>
            ))}
          </select>
          <Input
            type="datetime-local"
            value={from}
            onChange={event => setFrom(event.target.value)}
            className="h-9 text-xs"
            aria-label="من تاريخ"
          />
          <Input
            type="datetime-local"
            value={to}
            onChange={event => setTo(event.target.value)}
            className="h-9 text-xs"
            aria-label="إلى تاريخ"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border bg-muted/20 p-3">
            <p className="text-[11px] text-muted-foreground">إجمالي النتائج</p>
            <p className="mt-1 text-xl font-bold">
              {formatCount(
                report.data?.total ?? 0,
                settings?.numberSystem ?? "latin"
              )}
            </p>
          </div>
          <div className="rounded-xl border bg-muted/20 p-3">
            <p className="text-[11px] text-muted-foreground">المعروض</p>
            <p className="mt-1 text-xl font-bold">
              {formatCount(rows.length, settings?.numberSystem ?? "latin")}
            </p>
          </div>
        </div>
        <div className="max-h-[50vh] overflow-auto rounded-xl border">
          <table className="w-full text-right text-xs">
            <thead className="sticky top-0 bg-muted">
              <tr>
                <th className="p-3">الرقم</th>
                <th className="p-3">الموضوع</th>
                <th className="p-3">الجهة</th>
                <th className="p-3">الحالة</th>
                <th className="p-3">الوقت</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} className="border-t">
                  <td className="p-3 font-mono">{row.serialCode}</td>
                  <td className="p-3 font-semibold">{row.subject}</td>
                  <td className="p-3">{row.recipient}</td>
                  <td className="p-3">{statusLabels[row.status]}</td>
                  <td className="p-3 whitespace-nowrap">
                    {formatConfiguredDate(row.createdAt, settings)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!report.isLoading && rows.length === 0 && (
            <p className="p-8 text-center text-xs text-muted-foreground">
              لا توجد نتائج.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => window.print()}
          >
            طباعة التقرير
          </Button>
          <Button
            type="button"
            onClick={downloadCsv}
            disabled={rows.length === 0}
            className="bg-[#10233f] text-white hover:bg-[#18375f]"
          >
            تصدير CSV آمن
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function QuickAction({
  icon: Icon,
  label,
  detail,
  onClick,
}: {
  icon: typeof Plus;
  label: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border bg-background p-3 text-right transition-colors hover:border-[#b4945a] hover:bg-[#fffaf0] dark:hover:bg-[#2d281b]"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#10233f] text-[#d8c38e]">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-bold">{label}</span>
        <span className="mt-0.5 block text-[10px] text-muted-foreground">
          {detail}
        </span>
      </span>
      <ChevronLeft className="mr-auto h-3.5 w-3.5 text-muted-foreground" />
    </button>
  );
}

function TelegramComposer({
  pending,
  close,
  submit,
}: {
  pending: boolean;
  close: () => void;
  submit: (values: {
    subject: string;
    recipient: string;
    body: string;
    classification: Classification;
    priority: Priority;
    category: Category;
  }) => void;
}) {
  const [subject, setSubject] = useState("");
  const [recipient, setRecipient] = useState("");
  const [body, setBody] = useState("");
  const [classification, setClassification] =
    useState<Classification>("normal");
  const [priority, setPriority] = useState<Priority>("normal");
  const [category, setCategory] = useState<Category>("administrative");
  const [recording, setRecording] = useState(false);
  const [processingInput, setProcessingInput] = useState(false);
  const [imageInputOpen, setImageInputOpen] = useState(false);
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine
  );

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const speechRecognitionRef = useRef<SpeechRecognition | null>(null);
  const speechShouldContinueRef = useRef(false);
  const speechBaseBodyRef = useRef("");
  const speechRestartTimerRef = useRef<number | null>(null);
  const bodyValueRef = useRef(body);
  bodyValueRef.current = body;
  const appendText = (text: string) => {
    const clean = text.trim();
    if (clean) {
      setBody(current =>
        current.trim() ? `${current.trim()}\n${clean}` : clean
      );
    }
  };

  const handleImage = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("اختر صورة واضحة");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("حجم الصورة يجب ألا يتجاوز 10 ميغابايت");
      return;
    }

    setProcessingInput(true);
    try {
      const text = await extractArabicTextFromImage(file);
      appendText(text);
      toast.success(
        text
          ? "تم تحويل الصورة إلى نص مجانًا داخل المتصفح"
          : "لم يتم العثور على نص واضح في الصورة"
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "تعذر تحويل الصورة إلى نص"
      );
    } finally {
      setProcessingInput(false);
    }
  };

  const stopSpeechRecognition = () => {
    speechShouldContinueRef.current = false;
    if (speechRestartTimerRef.current !== null) {
      window.clearTimeout(speechRestartTimerRef.current);
      speechRestartTimerRef.current = null;
    }
    const recognition = speechRecognitionRef.current;
    speechRecognitionRef.current = null;
    setRecording(false);
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        // The recognition session may already have ended.
      }
    }
  };

  const toggleRecording = () => {
    if (recording) {
      stopSpeechRecognition();
      return;
    }

    try {
      const recognition = createArabicSpeechRecognition();
      speechShouldContinueRef.current = true;
      speechBaseBodyRef.current = body.trim() ? `${body.trim()}\n` : "";
      speechRecognitionRef.current = recognition;

      recognition.onresult = event => {
        const finalized: string[] = [];
        const interim: string[] = [];

        for (let index = 0; index < event.results.length; index += 1) {
          const result = event.results[index];
          const transcript = result?.[0]?.transcript?.trim();
          if (!transcript) continue;

          if (result.isFinal) finalized.push(transcript);
          else interim.push(transcript);
        }

        const finalText = correctArabicSpeechText(finalized.join(" "));
        const interimText = correctArabicSpeechText(interim.join(" "));
        const liveText = [finalText, interimText].filter(Boolean).join(" ");
        setBody(
          removeRepeatedSpeech(`${speechBaseBodyRef.current}${liveText}`)
        );
      };

      recognition.onerror = event => {
        // Browsers commonly emit no-speech during a pause. Keep listening and
        // let onend restart the session instead of treating silence as failure.
        if (event.error === "no-speech") return;

        speechShouldContinueRef.current = false;
        const message =
          event.error === "not-allowed"
            ? "اسمح للمتصفح بالوصول إلى الميكروفون"
            : event.error === "network"
              ? "خدمة التعرف الصوتي في المتصفح غير متاحة حاليًا"
              : "تعذر تحويل الصوت إلى نص";

        stopSpeechRecognition();
        toast.error(message);
      };

      recognition.onend = () => {
        const currentBody = bodyValueRef.current.trim();
        if (currentBody) {
          speechBaseBodyRef.current = `${currentBody}\n`;
        }

        if (!speechShouldContinueRef.current) {
          speechRecognitionRef.current = null;
          setRecording(false);
          return;
        }

        speechRestartTimerRef.current = window.setTimeout(() => {
          if (!speechShouldContinueRef.current) return;

          try {
            const nextRecognition = createArabicSpeechRecognition();
            speechRecognitionRef.current = nextRecognition;
            nextRecognition.onresult = recognition.onresult;
            nextRecognition.onerror = recognition.onerror;
            nextRecognition.onend = recognition.onend;
            nextRecognition.onstart = recognition.onstart;
            nextRecognition.start();
          } catch {
            speechShouldContinueRef.current = false;
            speechRecognitionRef.current = null;
            setRecording(false);
            toast.error(
              "توقف التعرف الصوتي؛ اضغط على الميكروفون لإعادة المحاولة"
            );
          }
        }, 250);
      };

      recognition.onstart = () => {
        setRecording(true);
      };

      recognition.start();
    } catch (error) {
      speechShouldContinueRef.current = false;
      speechRecognitionRef.current = null;
      setRecording(false);
      toast.error(
        error instanceof Error ? error.message : "تعذر تشغيل التعرف الصوتي"
      );
    }
  };

  useEffect(
    () => () => {
      speechShouldContinueRef.current = false;
      if (speechRestartTimerRef.current !== null) {
        window.clearTimeout(speechRestartTimerRef.current);
      }
      speechRecognitionRef.current?.stop();
      speechRecognitionRef.current = null;
    },
    []
  );

  const save = () => {
    if (!online) {
      toast.error(
        "لا يوجد اتصال؛ لم تُحفظ البرقية مركزيًا. أعد المحاولة عند عودة الاتصال."
      );
      return;
    }
    if (
      subject.trim().length < 2 ||
      recipient.trim().length < 2 ||
      body.trim().length < 3
    ) {
      toast.error("أكمل الموضوع والجهة ونص البرقية");
      return;
    }

    submit({
      subject: subject.trim(),
      recipient: recipient.trim(),
      body: body.trim(),
      classification,
      priority,
      category,
    });
  };

  return (
    <Modal
      title="إنشاء برقية تشغيلية"
      subtitle="سيتم تثبيت هويتك الرقمية تلقائيًا من الحساب الموثق."
      close={close}
    >
      <div className="grid gap-4">
        {!online && (
          <div
            role="alert"
            className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-6 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100"
          >
            أنت غير متصل حاليًا. هذه البيانات ليست محفوظة مركزيًا ولن تظهر على
            جهاز آخر حتى ينجح الحفظ.
          </div>
        )}
        <label className="grid gap-1.5 text-xs font-bold">
          الموضوع
          <Input
            value={subject}
            onChange={event => setSubject(event.target.value)}
            placeholder="عنوان مختصر ودقيق للبلاغ"
            className="h-11 rounded-lg"
          />
        </label>

        <label className="grid gap-1.5 text-xs font-bold">
          الجهة الموجهة إليها
          <Input
            value={recipient}
            onChange={event => setRecipient(event.target.value)}
            placeholder="القطاع أو المسؤول المعني"
            className="h-11 rounded-lg"
          />
        </label>

        <div className="grid gap-1.5 text-xs font-bold">
          <span>درجة السرية</span>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(classificationLabels) as Classification[]).map(
              item => (
                <button
                  type="button"
                  key={item}
                  onClick={() => setClassification(item)}
                  className={`rounded-lg border p-2.5 text-xs ${
                    classification === item
                      ? "border-[#b4945a] bg-[#fff8e8] text-[#7a5c1e] dark:bg-[#3c301a] dark:text-[#e7cc8c]"
                      : "hover:bg-muted"
                  }`}
                >
                  {classificationLabels[item]}
                </button>
              )
            )}
          </div>
        </div>

        <div className="grid gap-1.5 text-xs font-bold">
          <span>درجة الأولوية</span>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(priorityLabels) as Priority[]).map(item => (
              <button
                type="button"
                key={item}
                onClick={() => setPriority(item)}
                className={`rounded-lg border p-2.5 text-xs ${
                  priority === item
                    ? "border-[#b4945a] bg-[#fff8e8] text-[#7a5c1e] dark:bg-[#3c301a] dark:text-[#e7cc8c]"
                    : "hover:bg-muted"
                }`}
              >
                {priorityLabels[item]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-1.5 text-xs font-bold">
          <span>تصنيف البلاغ</span>
          <select
            value={category}
            onChange={event => setCategory(event.target.value as Category)}
            className="h-11 rounded-lg border bg-background px-3 text-sm font-normal"
          >
            {(Object.keys(categoryLabels) as Category[]).map(item => (
              <option key={item} value={item}>
                {categoryLabels[item]}
              </option>
            ))}
          </select>
        </div>

        <label className="grid gap-1.5 text-xs font-bold">
          نص البرقية
          <Textarea
            value={body}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            onChange={event => setBody(event.target.value)}
            placeholder="اكتب تفاصيل البلاغ أو استخدم الكاميرا أو الميكروفون..."
            className="min-h-36 rounded-lg leading-7"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Button
              type="button"
              variant="outline"
              onClick={() => setImageInputOpen(value => !value)}
              disabled={processingInput}
              className="h-9 rounded-lg text-xs"
              aria-haspopup="menu"
              aria-expanded={imageInputOpen}
            >
              <Camera className="ml-2 h-3.5 w-3.5 text-[#9b7c3d]" />
              {processingInput ? "جارٍ التحليل..." : "إضافة صورة"}
            </Button>
            {imageInputOpen && !processingInput && (
              <div
                role="menu"
                className="absolute right-0 top-full z-20 mt-2 min-w-44 rounded-xl border bg-background p-1.5 shadow-lg"
              >
                <label
                  role="menuitem"
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold hover:bg-muted"
                >
                  <Camera className="h-4 w-4 text-[#9b7c3d]" />
                  تصوير بالكاميرا
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={event => {
                      const file = event.target.files?.[0];
                      setImageInputOpen(false);
                      if (file) void handleImage(file);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                <label
                  role="menuitem"
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold hover:bg-muted"
                >
                  <ImagePlus className="h-4 w-4 text-[#9b7c3d]" />
                  اختيار من المعرض
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={event => {
                      const file = event.target.files?.[0];
                      setImageInputOpen(false);
                      if (file) void handleImage(file);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>
            )}
          </div>

          <Button
            type="button"
            variant={recording ? "destructive" : "outline"}
            onClick={toggleRecording}
            disabled={processingInput}
            className="h-9 rounded-lg text-xs"
          >
            {recording ? (
              <Square className="ml-2 h-3.5 w-3.5" />
            ) : (
              <Mic className="ml-2 h-3.5 w-3.5" />
            )}
            {recording ? "إيقاف الاستماع" : "اضغط للتحدث"}
          </Button>
        </div>

        <div className="rounded-lg border bg-muted/30 p-3 text-[11px] leading-6 text-muted-foreground">
          <p>
            <strong className="text-foreground">الصورة:</strong> تتم قراءتها
            بمحرك Tesseract المجاني داخل المتصفح، ولا تحتاج إلى مفتاح OpenAI.
          </p>
          <p className="mt-1">
            <strong className="text-foreground">الصوت:</strong> يستخدم التعرف
            الصوتي المتاح في المتصفح باللغة العربية. قد يعتمد Chrome على خدمة
            التعرف السحابية حسب إعدادات الجهاز والمتصفح.
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
        <Button variant="outline" onClick={close} className="h-11 rounded-lg">
          إلغاء
        </Button>
        <Button
          onClick={save}
          disabled={pending || processingInput || recording || !online}
          className="h-11 rounded-lg bg-[#10233f] text-white hover:bg-[#18375f]"
        >
          {pending ? "جارٍ التسجيل..." : "تسجيل البرقية"}
        </Button>
      </div>
    </Modal>
  );
}

function TelegramDetail({
  telegram,
  settings,
  isAdmin,
  canOperate,
  routingTargets,
  close,
}: {
  telegram: {
    id: number;
    serialCode: string;
    verificationToken: string;
    subject: string;
    recipient: string;
    body: string;
    creatorName: string;
    classification: Classification;
    priority: Priority;
    category: Category;
    status: Status;
    createdAt: Date;
    gpsLatitude?: string | null;
    gpsLongitude?: string | null;
  };
  settings?: {
    departmentName: string;
    unitName?: string;
    unitChiefRank?: string;
    unitChiefName?: string;
    timezone?: string;
    dateFormat?: string;
    numberSystem?: NumberSystem;
    logoUrl: string | null;
  };
  isAdmin: boolean;
  canOperate: boolean;
  routingTargets: Array<{ id: string; code: string; name: string }>;
  close: () => void;
}) {
  const paperRef = useRef<HTMLDivElement>(null);
  const [editOpen, setEditOpen] = useState(false);
  const utils = trpc.useUtils();
  const updateTelegram = trpc.telegrams.update.useMutation({
    onSuccess: async () => {
      toast.success("تم حفظ تعديلات البرقية");
      setEditOpen(false);
      await Promise.all([
        utils.telegrams.get.invalidate({ id: telegram.id }),
        utils.telegrams.list.invalidate(),
        utils.dashboard.stats.invalidate(),
      ]);
    },
    onError: error => toast.error(error.message || "تعذر تعديل البرقية"),
  });
  const deleteTelegram = trpc.telegrams.delete.useMutation({
    onSuccess: async () => {
      toast.success("تمت أرشفة البرقية");
      await Promise.all([
        utils.telegrams.list.invalidate(),
        utils.dashboard.stats.invalidate(),
      ]);
      close();
    },
    onError: error => toast.error(error.message || "تعذر أرشفة البرقية"),
  });
  const transition = trpc.telegrams.transition.useMutation({
    onSuccess: async () => {
      toast.success("تم تسجيل انتقال البرقية وتحديث سجل التدقيق");
      await Promise.all([
        utils.telegrams.get.invalidate({ id: telegram.id }),
        utils.telegrams.list.invalidate(),
        utils.dashboard.stats.invalidate(),
      ]);
    },
    onError: error => toast.error(error.message || "تعذر تغيير حالة البرقية"),
  });
  const [routeTarget, setRouteTarget] = useState("");
  const [routeNote, setRouteNote] = useState("");
  const routeTelegram = trpc.telegrams.route.useMutation({
    onSuccess: async route => {
      toast.success(
        route.approvalStatus === "pending"
          ? "تم إرسال طلب الإحالة إلى قيادة المحافظة للموافقة"
          : "تمت إحالة البرقية إلى الوحدة الشرطية"
      );
      await Promise.all([
        utils.telegrams.get.invalidate({ id: telegram.id }),
        utils.telegrams.list.invalidate(),
      ]);
      setRouteTarget("");
      setRouteNote("");
    },
    onError: error => toast.error(error.message || "تعذر إحالة البرقية"),
  });
  const uploadAttachment = trpc.telegrams.uploadAttachment.useMutation({
    onSuccess: async () => {
      toast.success("تم رفع المرفق وتسجيل بصمته في الخادم");
      await utils.telegrams.attachments.invalidate({ telegramId: telegram.id });
    },
    onError: error => toast.error(error.message || "تعذر رفع المرفق"),
  });
  const attachments = trpc.telegrams.attachments.useQuery({
    telegramId: telegram.id,
  });
  const downloadAttachment = trpc.telegrams.downloadAttachment.useMutation({
    onSuccess: result => {
      const link = document.createElement("a");
      link.href = result.url;
      link.download = result.fileName;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
    },
    onError: error => toast.error(error.message || "تعذر تنزيل المرفق"),
  });
  const handleAttachment = (file?: File) => {
    if (!file) return;
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
      "audio/mpeg",
      "audio/wav",
      "audio/webm",
    ];
    if (!allowed.includes(file.type) || file.size > 10 * 1024 * 1024) {
      toast.error("نوع المرفق غير مسموح أو يتجاوز 10 ميغابايت");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? "");
      uploadAttachment.mutate({
        telegramId: telegram.id,
        fileName: file.name,
        contentType: file.type as
          | "image/jpeg"
          | "image/png"
          | "image/webp"
          | "application/pdf"
          | "audio/mpeg"
          | "audio/wav"
          | "audio/webm",
        base64: value.split(",")[1] ?? value,
      });
    };
    reader.readAsDataURL(file);
  };
  const requestTransition = (toStatus: Status) => {
    const needsReason = toStatus === "returned" || toStatus === "rejected";
    const reason = needsReason
      ? window.prompt("أدخل سبب الإرجاع أو الرفض:")?.trim()
      : null;
    if (needsReason && !reason) {
      toast.error("سبب القرار مطلوب");
      return;
    }
    if (
      !window.confirm(`تأكيد نقل البرقية إلى حالة: ${statusLabels[toStatus]}؟`)
    )
      return;
    transition.mutate({ id: telegram.id, toStatus, reason: reason || null });
  };
  const [exporting, setExporting] = useState<
    "pdf" | "image" | "share" | "image-share" | null
  >(null);
  const createExportPaper = () => {
    const escapeHtml = (value: unknown) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const departmentName = settings?.departmentName ?? "قسم العمليات";
    const unitName = settings?.unitName ?? "قيادة الأمن الداخلي";
    const createdAt = formatConfiguredDate(telegram.createdAt, settings);
    const location =
      telegram.gpsLatitude != null && telegram.gpsLongitude != null
        ? `${telegram.gpsLatitude}, ${telegram.gpsLongitude}`
        : "غير محدد";
    const serialDigits =
      String(telegram.serialCode).split("-").pop() ??
      String(telegram.serialCode);
    const parsedSerial = Number.parseInt(serialDigits, 10);
    const displaySerial = Number.isFinite(parsedSerial)
      ? String(parsedSerial)
      : String(telegram.serialCode);
    const logo = settings?.logoUrl
      ? `<img class="official-logo" src="${escapeHtml(settings.logoUrl)}" alt="الشعار الرسمي" crossorigin="anonymous" />`
      : `<div class="official-seal" aria-label="الشعار الرسمي"><span>★</span><strong>وزارة<br />الداخلية</strong></div>`;
    const verificationUrl = new URL(
      `/verify/${encodeURIComponent(telegram.verificationToken)}`,
      window.location.origin
    ).toString();
    const qrPayload = verificationUrl;
    const createQrCode = qrcode as unknown as (
      typeNumber: number,
      errorCorrectionLevel: string
    ) => {
      addData: (data: string) => void;
      make: () => void;
      createSvgTag: (options: {
        cellSize: number;
        margin: number;
        scalable: boolean;
        alt: string;
      }) => string;
    };
    const qrCode = createQrCode(0, "L");
    qrCode.addData(qrPayload);
    qrCode.make();
    const qrSvg = qrCode.createSvgTag({
      cellSize: 4,
      margin: 4,
      scalable: true,
      alt: "رمز QR للتحقق من أصالة البرقية",
    });

    const watermark = settings?.logoUrl
      ? `<img class="watermark-logo" src="${escapeHtml(settings.logoUrl)}" alt="" aria-hidden="true" />`
      : `<div class="watermark-seal" aria-hidden="true"><span>★</span><strong>وزارة<br />الداخلية</strong></div>`;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
      <style>
        .telegram-export-page {
          position: relative;
          isolation: isolate;
          box-sizing: border-box;
          width: 794px;
          min-height: 1123px;
          padding: 19px;
          margin: 0;
          background: #fff;
          color: #172033;
          direction: rtl;
          font-family: "Cairo", Tahoma, Arial, sans-serif;
          font-size: 19px;
          line-height: 1.85;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .telegram-export-page * { box-sizing: border-box; }
        .telegram-export-page .page-watermark {
          position: absolute;
          top: 50%;
          left: 50%;
          z-index: 0;
          width: 75%;
          height: 75%;
          max-width: none;
          max-height: none;
          transform: translate(-50%, -50%);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.12;
          pointer-events: none;
        }
        .telegram-export-page .watermark-logo {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        .telegram-export-page .watermark-seal {
          width: 100%;
          height: 100%;
          border: 7px solid #9a813c;
          border-radius: 50%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #9a813c;
          text-align: center;
          line-height: 1.25;
        }
        .telegram-export-page .watermark-seal span { font-size: 68px; }
        .telegram-export-page .watermark-seal strong { font-size: 28px; }
        .telegram-export-page .official-header, .telegram-export-page .classification,
        .telegram-export-page .telegram-content, .telegram-export-page .document-footer {
          position: relative;
          z-index: 1;
        }
        .telegram-export-page .official-header {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 160px minmax(0, 1fr);
          align-items: center;
          gap: 12px;
          padding: 0 0 22px;
          border-bottom: 3px solid #b49a55;
        }
        .telegram-export-page .header-government,
        .telegram-export-page .header-metadata { min-width: 0; }
        .telegram-export-page .header-government { text-align: right; }
        .telegram-export-page .header-metadata { text-align: left; }
        .telegram-export-page .header-government p,
        .telegram-export-page .header-metadata p { margin: 0; font-size: 12px; font-weight: 700; line-height: 2; white-space: nowrap; }
        .telegram-export-page .official-header { font-weight: 700; }
        .telegram-export-page .government-name { font-size: 12px; font-weight: 700; white-space: nowrap; }
        .telegram-export-page .government-subtitle { font-size: 12px; font-weight: 700; white-space: nowrap; }
        .telegram-export-page .header-metadata { font-size: 11px; font-weight: 700; line-height: 2.15; white-space: nowrap; }
         .telegram-export-page .header-logo-cell { display: flex; align-items: center; justify-content: center; min-width: 0; }
         .telegram-export-page .official-logo {
          display: block;
          width: 160px;
          height: 160px;
          margin: 0 auto;
          object-fit: contain;
        }
         .telegram-export-page .official-seal {
          width: 145px;
          height: 145px;
          margin: 0 auto;
          border: 2px solid #b49a55;
          border-radius: 50%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #9a813c;
          text-align: center;
          line-height: 1.2;
        }
        .telegram-export-page .official-seal span { font-size: 20px; }
        .telegram-export-page .official-seal strong { font-size: 11px; }
        .telegram-export-page .classification {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          margin: 18px 0;
          padding: 10px 14px;
          border: 1px solid #d8dee8;
          background: #f8fafc;
          font-size: 13px;
        }
        .telegram-export-page .telegram-content {
          min-height: 570px;
          padding: 22px 24px;
          border: 1.5px solid #253247;
          display: flex;
          flex-direction: column;
        }
        .telegram-export-page .routing {
          padding-bottom: 14px;
          border-bottom: 1px dotted #7b8493;
          line-height: 2;
        }
        .telegram-export-page .routing-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 113px;
          align-items: start;
          gap: 16px;
          direction: rtl;
        }
        .telegram-export-page .routing p { margin: 0; }
        .telegram-export-page .routing-qr {
          width: 113px;
          height: 113px;
          justify-self: start;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #fff;
          overflow: hidden;
        }
        .telegram-export-page .routing-qr svg {
          display: block;
          width: 100%;
          height: 100%;
          shape-rendering: crispEdges;
        }
        .telegram-export-page .body-heading {
          margin: 20px 0 14px;
          text-align: center;
          font-size: 17px;
          font-weight: 700;
        }
         .telegram-export-page .telegram-body {
          min-height: 150px;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          text-align: justify;
          line-height: 2;
          font-size: 20px;
        }
        .telegram-export-page .signature {
          margin-top: auto;
          padding-top: 26px;
          text-align: left;
          line-height: 1.9;
        }
        .telegram-export-page .signature p { margin: 0; }
        .telegram-export-page .signature-label {
          margin-top: 14px !important;
          color: #667085;
          font-size: 12px;
        }
        .telegram-export-page .document-footer {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
          align-items: start;
          gap: 12px;
          margin-top: 16px;
          color: #667085;
          font-size: 11px;
          direction: rtl;
        }
        .telegram-export-page .document-footer p { margin: 0; }
        .telegram-export-page .footer-creator { text-align: right; }
        .telegram-export-page .footer-location { text-align: center; }
        .telegram-export-page .footer-date { text-align: left; }
        @media print {
          @page { size: A4 portrait; margin: 0; }
          html, body { margin: 0; padding: 0; background: #fff; }
          .telegram-export-page { width: 210mm; min-height: 297mm; }
        }
      </style>
      <article class="telegram-export-page" dir="rtl" lang="ar">
        <div class="page-watermark">${watermark}</div>
        <header class="official-header">
          <div class="header-government">
            <p class="government-name">الجمهورية العربية السورية</p>
            <p class="government-subtitle">وزارة الداخلية</p>
            <p>${escapeHtml(unitName)}</p>
            <p>${escapeHtml(departmentName)}</p>
          </div>
          <div class="header-logo-cell">${logo}</div>
          <div class="header-metadata">
            <p><strong>رقم البرقية:</strong> ${escapeHtml(displaySerial)}</p>
            <p><strong>الوقت والتاريخ:</strong> ${escapeHtml(createdAt)}</p>
            <p><strong>درجة السرية:</strong> ${escapeHtml(classificationLabels[telegram.classification])}</p>
            <p><strong>درجة الأسبقية:</strong> ${escapeHtml(priorityLabels[telegram.priority])}</p>
          </div>
        </header>
        <section class="classification">
          <span><strong>نوع الوثيقة:</strong> برقية رسمية</span>
          <span><strong>التصنيف:</strong> ${escapeHtml(categoryLabels[telegram.category])}</span>
          <span><strong>الحالة:</strong> ${escapeHtml(statusLabels[telegram.status])}</span>
        </section>
        <main class="telegram-content">
          <section class="routing">
            <div class="routing-layout">
              <div class="routing-details">
                <p><strong>من:</strong> ${escapeHtml(departmentName)}</p>
                <p><strong>إلى:</strong> ${escapeHtml(telegram.recipient)}</p>
                <p><strong>الموضوع:</strong> ${escapeHtml(telegram.subject)}</p>
              </div>
              <div class="routing-qr" role="img" aria-label="رمز QR لبيانات البرقية">${qrSvg}</div>
            </div>
          </section>
          <h2 class="body-heading">نص البرقية</h2>
          <div class="telegram-body">${escapeHtml(telegram.body)}</div>
          <section class="signature">
            <p><strong>${escapeHtml(settings?.unitChiefRank ?? "رئيس الوحدة")} ${escapeHtml(settings?.unitChiefName ?? "")}</strong></p>
            <p>رئيس ${escapeHtml(departmentName)}</p>
          </section>
        </main>
        <footer class="document-footer">
          <p class="footer-creator">تم إنشاء هذه الوثيقة بواسطة: ${escapeHtml(telegram.creatorName)}</p>
          <p class="footer-location">الموقع: ${escapeHtml(location)}</p>
          <p class="footer-date">تاريخ إنشاء البرقية: ${escapeHtml(createdAt)}</p>
        </footer>
      </article>`;

    return wrapper;
  };

  useEffect(() => {
    const host = paperRef.current;
    if (!host) return;

    const exportWrapper = createExportPaper();
    const paper = exportWrapper.querySelector<HTMLElement>(
      ".telegram-export-page"
    );
    if (!paper) return;

    host.replaceChildren(exportWrapper);

    const fitPaperToPreview = () => {
      const availableWidth = host.clientWidth;
      if (!availableWidth) return;

      const scale = Math.min(1, availableWidth / 794);
      const scaledHeight = Math.ceil(paper.offsetHeight * scale);

      exportWrapper.style.cssText = `position:relative;width:${availableWidth}px;height:${scaledHeight}px;overflow:hidden;`;
      paper.style.position = "absolute";
      paper.style.top = "0";
      paper.style.left = "50%";
      paper.style.marginLeft = "-397px";
      paper.style.transformOrigin = "top center";
      paper.style.transform = `scale(${scale})`;
      host.style.height = `${scaledHeight}px`;
    };

    fitPaperToPreview();
    const observer = new ResizeObserver(fitPaperToPreview);
    observer.observe(host);

    return () => {
      observer.disconnect();
      host.replaceChildren();
      host.style.height = "";
    };
  }, [telegram, settings]);

  const capture = async () => {
    await document.fonts.ready;

    const exportWrapper = createExportPaper();
    const paper = exportWrapper.querySelector<HTMLElement>(
      ".telegram-export-page"
    );
    if (!paper) {
      throw new Error("تعذر تجهيز قالب البرقية للتصدير");
    }

    const mount = document.createElement("div");
    mount.setAttribute("aria-hidden", "true");
    mount.style.cssText =
      "position:fixed;left:-10000px;top:0;width:794px;z-index:-1;pointer-events:none;";
    mount.appendChild(exportWrapper);
    document.body.appendChild(mount);

    try {
      await document.fonts.load('700 18px "Cairo"');
      const images = Array.from(
        paper.querySelectorAll<HTMLImageElement>("img")
      );
      await Promise.all(
        images.map(async image => {
          try {
            const source = image.currentSrc || image.src;
            if (!source) {
              image.remove();
              return;
            }

            // Inline images before canvas capture. A successfully decoded remote
            // image can still taint the canvas when its host does not grant CORS.
            if (!source.startsWith("data:")) {
              const imageUrl = new URL(source, document.baseURI);
              const response = await fetch(imageUrl.href, {
                mode: "cors",
                credentials:
                  imageUrl.origin === window.location.origin
                    ? "same-origin"
                    : "omit",
                cache: "force-cache",
              });
              if (!response.ok) {
                throw new Error(`Image request failed: ${response.status}`);
              }

              const blob = await response.blob();
              if (!blob.type.startsWith("image/")) {
                throw new Error("Image response has an invalid content type");
              }

              const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = () =>
                  reject(new Error("Unable to read image"));
                reader.readAsDataURL(blob);
              });

              image.removeAttribute("srcset");
              image.removeAttribute("crossorigin");
              image.src = dataUrl;
            }

            await image.decode();
          } catch {
            // Keep export usable if an optional logo cannot be fetched safely.
            image.remove();
          }
        })
      );

      const measuredHeight = Math.max(
        paper.scrollHeight,
        paper.getBoundingClientRect().height,
        1123
      );
      return await html2canvas(paper, {
        scale: Math.min(3, Math.max(2, window.devicePixelRatio || 2)),
        width: 794,
        height: Math.ceil(measuredHeight),
        windowWidth: 794,
        windowHeight: Math.ceil(measuredHeight),
        backgroundColor: "#ffffff",
        useCORS: true,
        allowTaint: false,
        logging: false,
        onclone: clonedDocument => {
          // html2canvas cannot parse modern oklch() colors emitted by the app's
          // Tailwind theme. The export sheet is self-contained, so isolate the
          // cloned document from application styles and retain only its print CSS.
          // Remove application styles from the entire cloned document, not
          // only <head>. Some bundlers inject style elements into <body>, and
          // html2canvas parses those rules even when the export sheet itself
          // uses only browser-safe colors. This is the source of the
          // "unsupported color function oklch" failure on image/PDF export.
          clonedDocument
            .querySelectorAll('style, link[rel="stylesheet"]')
            .forEach(stylesheet => stylesheet.remove());

          // Export CSS is deliberately self-contained and uses hexadecimal
          // colors, so restore only those rules after removing app styles.
          const exportStyles = exportWrapper.querySelector("style");
          if (exportStyles) {
            const isolatedStyles = clonedDocument.createElement("style");
            isolatedStyles.textContent = exportStyles.textContent ?? "";
            clonedDocument.head.appendChild(isolatedStyles);
          }

          // Avoid inherited theme colors on the cloned root/body.
          clonedDocument.documentElement.style.colorScheme = "light";
          clonedDocument.documentElement.style.backgroundColor = "#ffffff";
          clonedDocument.body.style.color = "#172033";
          clonedDocument.body.style.backgroundColor = "#ffffff";
        },
      });
    } finally {
      mount.remove();
    }
  };

  const printTelegram = async () => {
    const exportWrapper = createExportPaper();
    const printRoot = document.createElement("div");
    const printStyle = document.createElement("style");

    printRoot.id = "telegram-print-root";
    printRoot.setAttribute("dir", "rtl");
    printRoot.setAttribute("aria-hidden", "true");
    printRoot.style.position = "fixed";
    printRoot.style.inset = "0";
    printRoot.style.zIndex = "-1";
    printRoot.style.width = "210mm";
    printRoot.style.minHeight = "297mm";
    printRoot.style.background = "#fff";

    printStyle.id = "telegram-print-style";
    printStyle.textContent = `
      @media print {
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          background: #fff !important;
        }

        body > *:not(#telegram-print-root) {
          display: none !important;
        }

        #telegram-print-root {
          position: static !important;
          inset: auto !important;
          z-index: auto !important;
          display: block !important;
          width: 210mm !important;
          min-height: 297mm !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #fff !important;
        }

        #telegram-print-root .telegram-export-page {
          width: 210mm !important;
          min-height: 297mm !important;
          margin: 0 !important;
        }

        @page {
          size: A4 portrait;
          margin: 0;
        }
      }
    `;

    printRoot.appendChild(exportWrapper);
    document.head.appendChild(printStyle);
    document.body.appendChild(printRoot);

    const cleanup = () => {
      printStyle.remove();
      printRoot.remove();
    };

    try {
      const images = Array.from(
        printRoot.querySelectorAll<HTMLImageElement>("img")
      );
      await Promise.all(
        images.map(async image => {
          try {
            if (!image.complete) {
              await new Promise<void>(resolve => {
                image.addEventListener("load", () => resolve(), { once: true });
                image.addEventListener("error", () => resolve(), {
                  once: true,
                });
              });
            }
            await image.decode?.();
          } catch {
            // Keep printing even when an optional image cannot be decoded.
          }
        })
      );

      await new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });

      window.addEventListener("afterprint", cleanup, { once: true });
      window.print();

      // Some mobile browsers do not reliably dispatch afterprint.
      window.setTimeout(cleanup, 30000);
    } catch (error) {
      cleanup();
      toast.error(
        error instanceof Error ? error.message : "تعذر تجهيز الطباعة"
      );
    }
  };

  const imageBlob = async (): Promise<Blob> => {
    const canvas = await capture();

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        blob => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("تعذر إنشاء الصورة"));
          }
        },
        "image/png",
        1
      );
    });
  };

  const downloadImage = async () => {
    setExporting("image");

    try {
      const blob = await imageBlob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = `${telegram.serialCode}.png`;
      anchor.click();

      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("تم تنزيل صورة البرقية بدقة عالية");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تصدير الصورة");
    } finally {
      setExporting(null);
    }
  };

  const shareImage = async () => {
    setExporting("image-share");

    try {
      const blob = await imageBlob();
      const file = new File([blob], `${telegram.serialCode}.png`, {
        type: "image/png",
      });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `برقية ${telegram.serialCode}`,
          text: telegram.subject,
          files: [file],
        });
        toast.success("تم فتح خيارات مشاركة الصورة");
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");

        anchor.href = url;
        anchor.download = file.name;
        anchor.click();

        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast.info("المتصفح لا يدعم المشاركة المباشرة؛ تم تنزيل الصورة");
      }
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") {
        toast.error(
          error instanceof Error ? error.message : "تعذر مشاركة الصورة"
        );
      }
    } finally {
      setExporting(null);
    }
  };

  const exportPdf = async (share = false) => {
    setExporting(share ? "share" : "pdf");

    try {
      const pdf = await makePdf();
      const blob = pdf.output("blob");
      const file = new File([blob], `${telegram.serialCode}.pdf`, {
        type: "application/pdf",
      });

      if (share && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `برقية ${telegram.serialCode}`,
          text: telegram.subject,
          files: [file],
        });
        toast.success("تم فتح خيارات مشاركة البرقية");
      } else {
        pdf.save(`${telegram.serialCode}.pdf`);
        toast.success(
          share
            ? "تم تنزيل ملف PDF للمشاركة"
            : "تم تنزيل البرقية بصيغة PDF عالية الدقة"
        );
      }
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") {
        toast.error(
          error instanceof Error ? error.message : "تعذر تصدير البرقية"
        );
      }
    } finally {
      setExporting(null);
    }
  };

  const makePdf = async () => {
    const sourceCanvas = await capture();
    const pdf = new jsPDF({
      orientation: "p",
      unit: "mm",
      format: "a4",
      compress: true,
    });
    // Match the same A4 page box used by browser printing: 210 × 297 mm,
    // with the paper's internal 14mm padding already included in the captured pixels.
    const margin = 0;
    const pageWidth = 210;
    const pageHeight = 297;
    const sourcePixelsPerMm = sourceCanvas.width / pageWidth;
    const pagePixelHeight = Math.floor(pageHeight * sourcePixelsPerMm);
    let sourceY = 0;
    let pageIndex = 0;

    while (sourceY < sourceCanvas.height) {
      const sliceHeight = Math.min(
        pagePixelHeight,
        sourceCanvas.height - sourceY
      );
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = sourceCanvas.width;
      pageCanvas.height = sliceHeight;

      const pageContext = pageCanvas.getContext("2d");
      if (!pageContext) {
        throw new Error("تعذر تجهيز صفحات PDF");
      }

      pageContext.fillStyle = "#ffffff";
      pageContext.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      pageContext.drawImage(
        sourceCanvas,
        0,
        sourceY,
        sourceCanvas.width,
        sliceHeight,
        0,
        0,
        pageCanvas.width,
        sliceHeight
      );

      if (pageIndex > 0) pdf.addPage();
      const sliceHeightMm = sliceHeight / sourcePixelsPerMm;
      pdf.addImage(
        pageCanvas.toDataURL("image/jpeg", 0.96),
        "JPEG",
        margin,
        margin,
        pageWidth,
        sliceHeightMm,
        undefined,
        "FAST"
      );

      sourceY += sliceHeight;
      pageIndex += 1;
    }

    return pdf;
  };
  return (
    <Modal
      title={telegram.subject}
      subtitle={telegram.serialCode}
      close={close}
    >
      <div
        ref={paperRef}
        className="telegram-preview-stage w-full overflow-hidden rounded-sm bg-white"
        dir="rtl"
        lang="ar"
        aria-label="معاينة البرقية بحجم الورقة"
      />
      {attachments.data && attachments.data.length > 0 && (
        <div className="mt-4 rounded-xl border bg-muted/20 p-3 print:hidden">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold">مرفقات البرقية</p>
            <span className="text-[11px] text-muted-foreground">
              {attachments.data.length} ملف
            </span>
          </div>
          <div className="mt-2 grid gap-2">
            {attachments.data.map(file => (
              <div
                key={file.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{file.originalName}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {file.mimeType} · {Math.ceil(file.sizeBytes / 1024)}{" "}
                    كيلوبايت · SHA-256 {file.sha256.slice(0, 12)}...
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={downloadAttachment.isPending}
                  onClick={() =>
                    downloadAttachment.mutate({ attachmentId: file.id })
                  }
                >
                  تنزيل آمن
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-5 flex flex-wrap gap-2 print:hidden">
        <label className="inline-flex h-10 flex-1 cursor-pointer items-center justify-center rounded-lg border px-3 text-xs font-semibold sm:flex-none">
          {uploadAttachment.isPending ? "جارٍ رفع المرفق..." : "إرفاق ملف"}
          <input
            type="file"
            className="hidden"
            accept="image/jpeg,image/png,image/webp,application/pdf,audio/mpeg,audio/wav,audio/webm"
            disabled={uploadAttachment.isPending}
            onChange={event => {
              handleAttachment(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </label>
        <Button
          onClick={printTelegram}
          className="h-10 flex-1 rounded-lg bg-[#10233f] text-white sm:flex-none"
        >
          <Printer className="ml-2 h-4 w-4" />
          طباعة
        </Button>
        <Button
          onClick={() => exportPdf(false)}
          disabled={!!exporting}
          variant="outline"
          className="h-10 flex-1 rounded-lg sm:flex-none"
        >
          <FileDown className="ml-2 h-4 w-4" />
          {exporting === "pdf" ? "جارٍ التجهيز..." : "PDF عالي الدقة"}
        </Button>
        <Button
          onClick={downloadImage}
          disabled={!!exporting}
          variant="outline"
          className="h-10 flex-1 rounded-lg sm:flex-none"
        >
          <FileImage className="ml-2 h-4 w-4" />
          {exporting === "image" ? "جارٍ التجهيز..." : "صورة عالية الدقة"}
        </Button>
        <Button
          onClick={() => exportPdf(true)}
          disabled={!!exporting}
          variant="outline"
          className="h-10 flex-1 rounded-lg sm:flex-none"
        >
          <Share2 className="ml-2 h-4 w-4" />
          {exporting === "share" ? "جارٍ التحضير..." : "مشاركة PDF"}
        </Button>
        <Button
          onClick={shareImage}
          disabled={!!exporting}
          variant="outline"
          className="h-10 flex-1 rounded-lg sm:flex-none"
        >
          <Share2 className="ml-2 h-4 w-4" />
          {exporting === "image-share" ? "جارٍ التحضير..." : "مشاركة صورة"}
        </Button>
        <Button
          onClick={() =>
            toast.info("سيظهر موقع البلاغ بعد تفعيل خريطة العمليات")
          }
          variant="outline"
          className="h-10 flex-1 rounded-lg sm:flex-none"
        >
          <LocateFixed className="ml-2 h-4 w-4" />
          الموقع
        </Button>
        {isAdmin && (
          <>
            <Button
              onClick={() => setEditOpen(true)}
              variant="outline"
              className="h-10 flex-1 rounded-lg sm:flex-none"
            >
              <Save className="ml-2 h-4 w-4" />
              تعديل البرقية
            </Button>
            {telegram.status === "draft" && (
              <Button
                onClick={() => requestTransition("submitted")}
                disabled={transition.isPending}
                variant="outline"
                className="h-10 flex-1 rounded-lg sm:flex-none"
              >
                إرسال للمراجعة
              </Button>
            )}
            {telegram.status === "submitted" && (
              <Button
                onClick={() => requestTransition("in_review")}
                disabled={transition.isPending}
                variant="outline"
                className="h-10 flex-1 rounded-lg sm:flex-none"
              >
                بدء المراجعة
              </Button>
            )}
            {telegram.status === "pending" && (
              <Button
                onClick={() => requestTransition("in_progress")}
                disabled={transition.isPending}
                variant="outline"
                className="h-10 flex-1 rounded-lg sm:flex-none"
              >
                بدء الإجراء
              </Button>
            )}
            {(telegram.status === "in_progress" ||
              telegram.status === "approved" ||
              telegram.status === "forwarded") && (
              <Button
                onClick={() =>
                  requestTransition(
                    telegram.status === "in_progress"
                      ? "completed"
                      : "completed"
                  )
                }
                disabled={transition.isPending}
                variant="outline"
                className="h-10 flex-1 rounded-lg sm:flex-none"
              >
                إكمال المعالجة
              </Button>
            )}
            {telegram.status === "in_review" && (
              <>
                <Button
                  onClick={() => requestTransition("approved")}
                  disabled={transition.isPending}
                  className="h-10 flex-1 rounded-lg bg-emerald-600 text-white sm:flex-none"
                >
                  اعتماد
                </Button>
                <Button
                  onClick={() => requestTransition("returned")}
                  disabled={transition.isPending}
                  variant="outline"
                  className="h-10 flex-1 rounded-lg sm:flex-none"
                >
                  إرجاع بسبب
                </Button>
                <Button
                  onClick={() => requestTransition("rejected")}
                  disabled={transition.isPending}
                  variant="destructive"
                  className="h-10 flex-1 rounded-lg sm:flex-none"
                >
                  رفض
                </Button>
              </>
            )}
            {telegram.status === "resolved" ||
            telegram.status === "completed" ? (
              <Button
                onClick={() => requestTransition("archived")}
                disabled={transition.isPending}
                variant="outline"
                className="h-10 flex-1 rounded-lg sm:flex-none"
              >
                أرشفة
              </Button>
            ) : null}
            <Button
              onClick={() => {
                if (
                  window.confirm(
                    `هل أنت متأكد من أرشفة البرقية ${telegram.serialCode}؟ سيبقى سجلها محفوظًا.`
                  )
                )
                  deleteTelegram.mutate({ id: telegram.id });
              }}
              disabled={deleteTelegram.isPending}
              variant="destructive"
              className="h-10 flex-1 rounded-lg sm:flex-none"
            >
              {deleteTelegram.isPending ? "جارٍ الأرشفة..." : "أرشفة البرقية"}
            </Button>
          </>
        )}
      </div>
      {canOperate && !isAdmin && (
        <div className="mt-4 flex flex-wrap gap-2 print:hidden">
          {telegram.status === "draft" && (
            <Button
              onClick={() => requestTransition("submitted")}
              disabled={transition.isPending}
              variant="outline"
              className="h-10 rounded-lg"
            >
              إرسال للمراجعة
            </Button>
          )}
          {telegram.status === "submitted" && (
            <Button
              onClick={() => requestTransition("in_review")}
              disabled={transition.isPending}
              variant="outline"
              className="h-10 rounded-lg"
            >
              بدء المراجعة
            </Button>
          )}
          {telegram.status === "in_review" && (
            <>
              <Button
                onClick={() => requestTransition("approved")}
                disabled={transition.isPending}
                className="h-10 rounded-lg bg-emerald-600 text-white"
              >
                اعتماد
              </Button>
              <Button
                onClick={() => requestTransition("returned")}
                disabled={transition.isPending}
                variant="outline"
                className="h-10 rounded-lg"
              >
                إرجاع بسبب
              </Button>
              <Button
                onClick={() => requestTransition("rejected")}
                disabled={transition.isPending}
                variant="destructive"
                className="h-10 rounded-lg"
              >
                رفض
              </Button>
            </>
          )}
          {(telegram.status === "approved" ||
            telegram.status === "in_progress" ||
            telegram.status === "forwarded") && (
            <Button
              onClick={() => requestTransition("completed")}
              disabled={transition.isPending}
              variant="outline"
              className="h-10 rounded-lg"
            >
              إكمال المعالجة
            </Button>
          )}
        </div>
      )}
      {routingTargets.length > 0 &&
        ["approved", "in_progress", "forwarded"].includes(telegram.status) && (
          <div className="mt-4 rounded-xl border border-[#b49a55]/40 bg-[#fffaf0] p-3 dark:bg-[#2d281b] print:hidden">
            <p className="text-xs font-bold text-[#7a5c1e]">
              إحالة مركزية بين الوحدات الشرطية
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <select
                value={routeTarget}
                onChange={event => setRouteTarget(event.target.value)}
                className="h-10 rounded-lg border bg-background px-3 text-xs"
              >
                <option value="">اختر الوحدة المستلمة</option>
                {routingTargets.map(target => (
                  <option key={target.id} value={target.id}>
                    {target.name} ({target.code})
                  </option>
                ))}
              </select>
              <Input
                value={routeNote}
                onChange={event => setRouteNote(event.target.value)}
                placeholder="ملاحظة الإحالة (اختياري)"
                className="h-10 rounded-lg text-xs"
              />
              <Button
                type="button"
                disabled={!routeTarget || routeTelegram.isPending}
                onClick={() =>
                  routeTelegram.mutate({
                    id: telegram.id,
                    toOrganizationId: routeTarget,
                    note: routeNote.trim() || null,
                  })
                }
                className="h-10 rounded-lg bg-[#10233f] text-white hover:bg-[#18375f]"
              >
                {routeTelegram.isPending ? "جارٍ الإحالة..." : "إحالة البرقية"}
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              لا تظهر إلا الوحدات المرتبطة تنظيميًا، ويُحفظ المسار كاملًا في سجل
              التدقيق.
            </p>
          </div>
        )}
      {isAdmin && editOpen && (
        <TelegramEditModal
          telegram={telegram}
          pending={updateTelegram.isPending}
          close={() => setEditOpen(false)}
          submit={values =>
            updateTelegram.mutate({ id: telegram.id, ...values })
          }
        />
      )}
      <p className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground print:hidden">
        <Shield className="h-3.5 w-3.5" />
        تُحفظ هوية المنشئ الأصلية في سجل البرقية، وتُسجل عمليات الإدارة في سجل
        التدقيق.
      </p>
    </Modal>
  );
}
function TelegramEditModal({
  telegram,
  pending,
  close,
  submit,
}: {
  telegram: {
    subject: string;
    recipient: string;
    body: string;
    classification: Classification;
    priority: Priority;
    category: Category;
    status: Status;
  };
  pending: boolean;
  close: () => void;
  submit: (values: {
    subject: string;
    recipient: string;
    body: string;
    classification: Classification;
    priority: Priority;
    category: Category;
    status: Status;
  }) => void;
}) {
  const [subject, setSubject] = useState(telegram.subject);
  const [recipient, setRecipient] = useState(telegram.recipient);
  const [body, setBody] = useState(telegram.body);
  const [classification, setClassification] = useState<Classification>(
    telegram.classification
  );
  const [priority, setPriority] = useState<Priority>(telegram.priority);
  const [category, setCategory] = useState<Category>(telegram.category);
  const [status, setStatus] = useState<Status>(telegram.status);

  return (
    <Modal title="تعديل البرقية" subtitle="تحديث بيانات السجل" close={close}>
      <form
        className="space-y-4"
        onSubmit={event => {
          event.preventDefault();
          submit({
            subject: subject.trim(),
            recipient: recipient.trim(),
            body: body.trim(),
            classification,
            priority,
            category,
            status,
          });
        }}
      >
        <label className="grid gap-1.5 text-sm font-semibold">
          موضوع البرقية
          <Input
            required
            minLength={2}
            maxLength={255}
            value={subject}
            onChange={event => setSubject(event.target.value)}
          />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">
          الجهة الموجهة إليها
          <Input
            required
            minLength={2}
            maxLength={255}
            value={recipient}
            onChange={event => setRecipient(event.target.value)}
          />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">
          نص البرقية
          <Textarea
            required
            minLength={3}
            maxLength={20000}
            rows={8}
            value={body}
            onChange={event => setBody(event.target.value)}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-semibold">
            السرية
            <select
              value={classification}
              onChange={event =>
                setClassification(event.target.value as Classification)
              }
              className="h-10 rounded-lg border bg-background px-3"
            >
              <option value="normal">عادي</option>
              <option value="secret">سري</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            الأولوية
            <select
              value={priority}
              onChange={event => setPriority(event.target.value as Priority)}
              className="h-10 rounded-lg border bg-background px-3"
            >
              <option value="slow">بطيء</option>
              <option value="normal">عادي</option>
              <option value="urgent">عاجل</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            التصنيف
            <select
              value={category}
              onChange={event => setCategory(event.target.value as Category)}
              className="h-10 rounded-lg border bg-background px-3"
            >
              {Object.entries(categoryLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            الحالة
            <select
              value={status}
              onChange={event => setStatus(event.target.value as Status)}
              className="h-10 rounded-lg border bg-background px-3"
            >
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={close}>
            إلغاء
          </Button>
          <Button
            type="submit"
            disabled={
              pending ||
              subject.trim().length < 2 ||
              recipient.trim().length < 2 ||
              body.trim().length < 3
            }
          >
            {pending ? "جارٍ الحفظ..." : "حفظ التعديلات"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block text-muted-foreground">{label}</span>
      <span className="mt-1 block font-semibold">{value}</span>
    </div>
  );
}
function Modal({
  title,
  subtitle,
  close,
  children,
}: {
  title: string;
  subtitle: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="telegram-print-modal fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        dir="rtl"
        className="max-h-[94vh] w-full overflow-y-auto rounded-t-[1.5rem] bg-background p-5 shadow-2xl sm:max-w-2xl sm:rounded-2xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs font-bold text-[#9b7c3d]">
              {subtitle}
            </p>
            <h2 className="mt-1 text-xl font-bold">{title}</h2>
          </div>
          <button
            onClick={close}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

function DepartmentSettingsModal({
  settings,
}: {
  settings?: {
    id: number;
    departmentName: string;
    unitName?: string;
    unitChiefRank?: string;
    unitChiefName?: string;
    serialPrefix: string;
    serialStart: number;
    timezone?: string;
    dateFormat?: string;
    numberSystem?: NumberSystem;
    logoUrl: string | null;
  };
}) {
  const [open, setOpen] = useState(false);
  const [departmentName, setDepartmentName] = useState(
    settings?.departmentName ?? ""
  );
  const [unitName, setUnitName] = useState(
    settings?.unitName ?? "وحدة العمليات"
  );
  const [unitChiefRank, setUnitChiefRank] = useState(
    settings?.unitChiefRank ?? "العقيد"
  );
  const [unitChiefName, setUnitChiefName] = useState(
    settings?.unitChiefName ?? "رئيس الوحدة"
  );
  const [serialPrefix, setSerialPrefix] = useState(
    settings?.serialPrefix ?? "POL"
  );
  const [serialStart, setSerialStart] = useState(settings?.serialStart ?? 1);
  const [timezone, setTimezone] = useState("Asia/Riyadh");
  const [dateFormat, setDateFormat] = useState("dd/MM/yyyy HH:mm:ss");
  const [numberSystem, setNumberSystem] = useState<
    "latin" | "arabic" | "hindi"
  >("latin");
  const [logoUrl, setLogoUrl] = useState(settings?.logoUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const update = trpc.settings.update.useMutation({
    onSuccess: result => {
      setOpen(false);
      setLogoUrl(result?.logoUrl ?? null);
      toast.success("تم تحديث هوية القسم وستظهر في البرقيات الجديدة");
    },
    onError: error => toast.error(error.message || "تعذر تحديث إعدادات القسم"),
  });
  const upload = trpc.settings.uploadLogo.useMutation();

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-department-settings", handler);
    return () =>
      window.removeEventListener("open-department-settings", handler);
  }, []);
  useEffect(() => {
    setDepartmentName(settings?.departmentName ?? "");
    setUnitName(settings?.unitName ?? "وحدة العمليات");
    setUnitChiefRank(settings?.unitChiefRank ?? "العقيد");
    setUnitChiefName(settings?.unitChiefName ?? "رئيس الوحدة");
    setSerialPrefix(settings?.serialPrefix ?? "POL");
    setSerialStart(settings?.serialStart ?? 1);
    setTimezone(settings?.timezone ?? "Asia/Riyadh");
    setDateFormat(settings?.dateFormat ?? "dd/MM/yyyy HH:mm:ss");
    setNumberSystem(settings?.numberSystem ?? "latin");
    setLogoUrl(settings?.logoUrl ?? null);
  }, [
    settings?.departmentName,
    settings?.unitName,
    settings?.unitChiefRank,
    settings?.unitChiefName,
    settings?.logoUrl,
    settings?.serialPrefix,
    settings?.serialStart,
  ]);

  const handleLogo = async (file?: File) => {
    if (!file) return;
    if (file.type !== "image/png" && file.type !== "image/jpeg")
      return toast.error("صيغة الشعار يجب أن تكون PNG أو JPG");
    if (file.size > 5 * 1024 * 1024)
      return toast.error("حجم الشعار يجب ألا يتجاوز 5 ميغابايت");
    setUploading(true);
    try {
      const base64 = await readFileAsBase64(file);
      const result = await upload.mutateAsync({
        fileName: file.name,
        contentType: file.type === "image/jpeg" ? "image/jpeg" : "image/png",
        base64,
      });
      setLogoUrl(new URL(result.url, window.location.origin).toString());
      toast.success("تم رفع الشعار، اضغط حفظ لاعتماده");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر رفع الشعار");
    } finally {
      setUploading(false);
    }
  };

  if (!open) return null;
  return (
    <Modal
      title="إعدادات القسم والموقع"
      subtitle="ADMIN / DEPARTMENT SETTINGS"
      close={() => setOpen(false)}
    >
      <div className="space-y-5">
        <div className="rounded-xl border bg-muted/20 p-4">
          <p className="text-xs font-bold text-muted-foreground">
            معاينة ترويسة البرقية
          </p>
          <div className="mt-4 border-b-2 border-[#b4945a] pb-4 text-center">
            <div className="flex items-center justify-center gap-3">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="معاينة شعار القسم"
                  className="h-14 w-14 rounded-xl object-contain"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#10233f] text-[#d8c38e]">
                  <Shield className="h-7 w-7" />
                </div>
              )}
              <div>
                <p className="text-[10px] font-semibold tracking-[0.16em] text-[#9b7c3d]">
                  برقية رسمية
                </p>
                <p className="text-xs font-semibold text-[#9b7c3d]">
                  {unitChiefRank} {unitChiefName}
                </p>
                <h3 className="mt-1 text-lg font-bold">
                  {unitName || "اسم الوحدة التابعة"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {departmentName || "اسم القسم أو المخفر"}
                </p>
              </div>
            </div>
          </div>
        </div>
        <label className="grid gap-1.5 text-xs font-bold">
          اسم الجهة الشرطية (القسم أو المخفر)
          <Input
            value={departmentName}
            onChange={event => setDepartmentName(event.target.value)}
            placeholder="مثال: مخفر شمال الرياض"
            className="h-11 rounded-lg"
          />
          <span className="text-[11px] font-normal text-muted-foreground">
            اسم الجهة الشرطية الأساسية التي تصدر البرقيات.
          </span>
        </label>
        <label className="grid gap-1.5 text-xs font-bold">
          اسم الوحدة التابعة للقسم أو المخفر
          <Input
            value={unitName}
            onChange={event => setUnitName(event.target.value)}
            placeholder="مثال: وحدة الدوريات"
            className="h-11 rounded-lg"
          />
          <span className="text-[11px] font-normal text-muted-foreground">
            اسم الوحدة التنظيمية التابعة للقسم أو المخفر، إن وجدت.
          </span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-bold">
            رتبة رئيس الوحدة التابعة
            <Input
              value={unitChiefRank}
              onChange={event => setUnitChiefRank(event.target.value)}
              placeholder="مثال: العقيد"
              className="h-11 rounded-lg"
            />
          </label>
          <label className="grid gap-1.5 text-xs font-bold">
            اسم رئيس الوحدة التابعة
            <Input
              value={unitChiefName}
              onChange={event => setUnitChiefName(event.target.value)}
              placeholder="مثال: محمد أحمد"
              className="h-11 rounded-lg"
            />
          </label>
        </div>
        <label className="grid gap-1.5 text-xs font-bold">
          بادئة رقم البرقية
          <Input
            value={serialPrefix}
            onChange={event =>
              setSerialPrefix(
                event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "")
              )
            }
            placeholder="مثال: POL أو RIYADH"
            className="h-11 rounded-lg font-mono uppercase"
          />
          <span className="text-[11px] font-normal text-muted-foreground">
            ستظهر مثل: {serialPrefix || "POL"}-2026-09-22-00001
          </span>
        </label>
        <label className="grid gap-1.5 text-xs font-bold">
          رقم البداية
          <Input
            type="number"
            min={1}
            value={serialStart}
            onChange={event =>
              setSerialStart(Math.max(1, Number(event.target.value) || 1))
            }
            className="h-11 rounded-lg"
          />
        </label>
        <div className="grid gap-3 rounded-xl border p-4">
          <p className="text-xs font-bold">التوقيت والتاريخ والأرقام</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-[11px] font-semibold">
              المنطقة الزمنية
              <select
                value={timezone}
                onChange={event => setTimezone(event.target.value)}
                className="h-10 rounded-lg border bg-background px-3 text-sm font-normal"
              >
                <option value="Asia/Riyadh">الرياض — Asia/Riyadh</option>
                <option value="Asia/Damascus">دمشق — Asia/Damascus</option>
                <option value="Asia/Amman">عمّان — Asia/Amman</option>
                <option value="Asia/Baghdad">بغداد — Asia/Baghdad</option>
                <option value="Asia/Kuwait">الكويت — Asia/Kuwait</option>
                <option value="Asia/Qatar">الدوحة — Asia/Qatar</option>
                <option value="Asia/Dubai">دبي — Asia/Dubai</option>
                <option value="Asia/Muscat">مسقط — Asia/Muscat</option>
                <option value="Africa/Cairo">القاهرة — Africa/Cairo</option>
                <option value="Africa/Tunis">تونس — Africa/Tunis</option>
                <option value="Africa/Algiers">الجزائر — Africa/Algiers</option>
                <option value="Africa/Casablanca">
                  الدار البيضاء — Africa/Casablanca
                </option>
                <option value="Europe/Istanbul">
                  إسطنبول — Europe/Istanbul
                </option>
                <option value="Europe/London">لندن — Europe/London</option>
                <option value="Europe/Paris">باريس — Europe/Paris</option>
                <option value="Europe/Berlin">برلين — Europe/Berlin</option>
                <option value="Europe/Moscow">موسكو — Europe/Moscow</option>
                <option value="America/New_York">
                  نيويورك — America/New_York
                </option>
                <option value="America/Chicago">
                  شيكاغو — America/Chicago
                </option>
                <option value="America/Denver">دنفر — America/Denver</option>
                <option value="America/Los_Angeles">
                  لوس أنجلوس — America/Los_Angeles
                </option>
                <option value="America/Toronto">
                  تورنتو — America/Toronto
                </option>
                <option value="America/Sao_Paulo">
                  ساو باولو — America/Sao_Paulo
                </option>
                <option value="Asia/Kolkata">نيودلهي — Asia/Kolkata</option>
                <option value="Asia/Bangkok">بانكوك — Asia/Bangkok</option>
                <option value="Asia/Singapore">
                  سنغافورة — Asia/Singapore
                </option>
                <option value="Asia/Shanghai">شنغهاي — Asia/Shanghai</option>
                <option value="Asia/Tokyo">طوكيو — Asia/Tokyo</option>
                <option value="Australia/Sydney">
                  سيدني — Australia/Sydney
                </option>
                <option value="Pacific/Auckland">
                  أوكلاند — Pacific/Auckland
                </option>
                <option value="UTC">UTC — التوقيت العالمي</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-[11px] font-semibold">
              تنسيق التاريخ والوقت
              <select
                value={dateFormat}
                onChange={event => setDateFormat(event.target.value)}
                className="h-10 rounded-lg border bg-background px-3 text-sm font-normal"
              >
                <option value="dd/MM/yyyy HH:mm:ss">22/09/2026 14:30:00</option>
                <option value="yyyy-MM-dd HH:mm:ss">2026-09-22 14:30:00</option>
                <option value="dd MMM yyyy HH:mm">22 سبتمبر 2026 14:30</option>
              </select>
            </label>
          </div>
          <label className="grid gap-1.5 text-[11px] font-semibold">
            نظام الأرقام
            <select
              value={numberSystem}
              onChange={event =>
                setNumberSystem(
                  event.target.value as "latin" | "arabic" | "hindi"
                )
              }
              className="h-10 rounded-lg border bg-background px-3 text-sm font-normal"
            >
              <option value="latin">لاتينية: 123456789</option>
              <option value="arabic">عربية: ١٢٣٤٥٦٧٨٩</option>
              <option value="hindi">هندية: १२३४५६७८९</option>
            </select>
            <span className="text-[10px] font-normal text-muted-foreground">
              سيتم تطبيق هذا الاختيار على أرقام البرقيات والتقارير المعروضة
              للمدير.
            </span>
          </label>
        </div>
        <div className="grid gap-2">
          <span className="text-xs font-bold">شعار القسم أو المخفر</span>
          <div className="flex items-center gap-4 rounded-xl border border-dashed p-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-muted">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="شعار القسم"
                  className="h-full w-full rounded-xl object-contain"
                />
              ) : (
                <ImagePlus className="h-7 w-7 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">ارفع شعارًا رسميًا</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                PNG أو JPG، بحد أقصى 5 ميغابايت. سيظهر في منتصف ترويسة كل برقية.
              </p>
              <label className="mt-3 inline-flex cursor-pointer items-center rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-muted">
                <Upload className="ml-2 h-3.5 w-3.5" />
                {uploading ? "جارٍ الرفع..." : "اختيار الشعار"}
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={event => handleLogo(event.target.files?.[0])}
                />
              </label>
            </div>
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
          <Shield className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            هذه الإعدادات متاحة للمالك أو المدير فقط، وتُحفظ في الخادم وتظهر في
            ترويسة البرقية عند العرض والطباعة.
          </span>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => setOpen(false)}
          className="h-10 rounded-lg"
        >
          إلغاء
        </Button>
        <Button
          disabled={
            update.isPending ||
            uploading ||
            !settings ||
            departmentName.trim().length < 2 ||
            serialPrefix.length < 1 ||
            serialStart < 1
          }
          onClick={() =>
            settings &&
            update.mutate({
              departmentName: departmentName.trim(),
              unitName: unitName.trim(),
              unitChiefRank: unitChiefRank.trim(),
              unitChiefName: unitChiefName.trim(),
              serialPrefix,
              serialStart,
              timezone,
              dateFormat,
              numberSystem,
              logoUrl: logoUrl?.trim() || null,
            })
          }
          className="h-10 rounded-lg bg-[#10233f] text-white hover:bg-[#18375f]"
        >
          <Save className="ml-2 h-4 w-4" />
          {update.isPending ? "جارٍ الحفظ..." : "حفظ إعدادات القسم"}
        </Button>
      </div>
    </Modal>
  );
}

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("تعذر قراءة الملف"));
    reader.readAsDataURL(file);
  });
}
