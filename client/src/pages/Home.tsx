import { trpc } from "@/lib/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import OwnerUserManagement from "@/components/OwnerUserManagement";
import { OrganizationTreePicker } from "@/components/OrganizationTreePicker";
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
  ArrowDown,
  ArrowUp,
  ArrowUpLeft,
  Building2,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  FileDown,
  FileImage,
  FileSpreadsheet,
  FileText,
  ImagePlus,
  Inbox,
  Filter,
  ListFilter,
  LocateFixed,
  LockKeyhole,
  Menu,
  MessageSquarePlus,
  Printer,
  Radio,
  Search,
  Save,
  Send,
  Share2,
  Shield,
  Siren,
  SlidersHorizontal,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { showLocalTelegramNotification } from "@/lib/notifications";
import { getTelegramDisplayNumber } from "@/lib/telegramDisplay";
import { getTelegramSerialCode } from "@shared/telegramSerial";
import {
  downloadTelegramWorkbook,
  parseTelegramWorkbook,
  type TelegramSpreadsheetIssue,
  type TelegramSpreadsheetRow,
} from "@/lib/telegramSpreadsheet";
import {
  categoryLabels,
  classificationLabels,
  priorityLabels,
  statusLabels,
} from "@/lib/uiLabels";
import qrcode from "@/lib/qrcode-generator";
import { stringToBytes as utf8StringToBytes } from "@/lib/qrcode-utf8";
import {
  localizeDigits,
  normalizeNumberSystem,
  type NumberSystem as SupportedNumberSystem,
} from "@shared/numberSystem";

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

function downloadImportErrorReport(
  errors: Array<{ row: number; message: string }>
) {
  const content = [
    ["رقم الصف", "سبب عدم الاستيراد"],
    ...errors.map(error => [String(error.row), error.message]),
  ]
    .map(row => row.map(value => `"${value.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + content], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `تقرير-أخطاء-الاستيراد-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

const numberFormatter = new Intl.NumberFormat("en-US");
const PRINT_PAGE_WIDTH_PX = 794;
const PRINT_PAGE_HEIGHT_PX = 1123;
const PRINT_PAGE_WIDTH_MM = 210;
const PRINT_PAGE_HEIGHT_MM = 297;
// Microsoft Word "Narrow" margins: 0.5in on every side.
const PRINT_MARGIN_MM = 12.7;
const LIVE_REFRESH_INTERVAL_MS = 15_000;
const TELEGRAMS_PER_PAGE = 10;
const EXPORT_CAIRO_FONT_FACES = `
  @font-face {
    font-family: "Cairo";
    font-style: normal;
    font-weight: 400;
    font-display: block;
    src: url("/fonts/cairo-400.ttf") format("truetype");
  }
  @font-face {
    font-family: "Cairo";
    font-style: normal;
    font-weight: 500;
    font-display: block;
    src: url("/fonts/cairo-500.ttf") format("truetype");
  }
  @font-face {
    font-family: "Cairo";
    font-style: normal;
    font-weight: 600;
    font-display: block;
    src: url("/fonts/cairo-600.ttf") format("truetype");
  }
  @font-face {
    font-family: "Cairo";
    font-style: normal;
    font-weight: 700;
    font-display: block;
    src: url("/fonts/cairo-700.ttf") format("truetype");
  }
`;
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
type NumberSystem = SupportedNumberSystem | "hindi";
type DisplayColumn = "category" | "priority" | "creator";
const DEFAULT_DISPLAY_COLUMNS: Record<DisplayColumn, boolean> = {
  category: true,
  priority: true,
  creator: true,
};

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

function formatConfiguredHeaderDateTime(
  value: Date | string | number,
  settings?: {
    timezone?: string;
    dateFormat?: string;
    numberSystem?: NumberSystem;
  }
) {
  const date = new Date(value);
  const timezone = settings?.timezone ?? "Asia/Riyadh";
  const numberSystem = settings?.numberSystem ?? "latin";
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
  const formattedDate = `${parts.year}/${Number(parts.month)}/${Number(parts.day)}`;
  return localizeDigits(
    `${formattedDate} - ${parts.hour}:${parts.minute}:${parts.second}`,
    numberSystem
  );
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
  const StatusIcon =
    value === "forwarded"
      ? Share2
      : value === "resolved" || value === "approved" || value === "completed"
        ? CheckCircle2
        : value === "in_progress" || value === "in_review"
          ? Activity
          : value === "draft"
            ? FileText
            : Clock3;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold ${statusStyles[value]}`}
    >
      <StatusIcon className="h-3.5 w-3.5" />
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
  const PriorityIcon = value === "urgent" ? Siren : Shield;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold ${tone}`}
    >
      <PriorityIcon className="h-3.5 w-3.5" />
      {priorityLabels[value]}
    </span>
  );
}

function CategoryBadge({ value }: { value: Category }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-500/10 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
      <FileText className="h-3.5 w-3.5" />
      {categoryLabels[value]}
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
  active = false,
  onClick,
}: {
  label: string;
  value: number;
  detail: string;
  icon: typeof FileText;
  tone: string;
  numberSystem: NumberSystem;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <Card
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-pressed={onClick ? active : undefined}
      onClick={onClick}
      onKeyDown={event => {
        if (onClick && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onClick();
        }
      }}
      className={`border-border/60 bg-card shadow-sm transition-all ${
        onClick
          ? "cursor-pointer hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          : ""
      } ${active ? "border-primary bg-primary/[0.04] shadow-md ring-1 ring-primary/30" : ""}`}
    >
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
  const [liveNow, setLiveNow] = useState(() => new Date());
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState<"all" | Classification>("all");
  const [priority, setPriority] = useState<"all" | Priority>("all");
  const [status, setStatus] = useState<"all" | Status>("all");
  const [category, setCategory] = useState<"all" | Category>("all");
  const [organizationScope, setOrganizationScope] = useState("current");
  const [telegramView, setTelegramView] = useState<
    "all" | "outgoing" | "incoming"
  >("all");
  const [activeKpi, setActiveKpi] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<string | undefined>();
  const [dateTo, setDateTo] = useState<string | undefined>();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [composerOpen, setComposerOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [displayCustomizeOpen, setDisplayCustomizeOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [excelToolsOpen, setExcelToolsOpen] = useState(false);
  const [excelImportOpen, setExcelImportOpen] = useState(false);
  const [excelRows, setExcelRows] = useState<TelegramSpreadsheetRow[]>([]);
  const [excelSkippedRows, setExcelSkippedRows] = useState(0);
  const [excelDuplicateRows, setExcelDuplicateRows] = useState(0);
  const [excelIssues, setExcelIssues] = useState<TelegramSpreadsheetIssue[]>(
    []
  );
  const [excelFileName, setExcelFileName] = useState("");
  const [exportingExcel, setExportingExcel] = useState(false);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [displayColumns, setDisplayColumns] = useState<
    Record<DisplayColumn, boolean>
  >(DEFAULT_DISPLAY_COLUMNS);

  useEffect(() => {
    const clock = window.setInterval(() => setLiveNow(new Date()), 1000);
    return () => window.clearInterval(clock);
  }, []);

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

    const openComposer = () => setComposerOpen(true);
    const openExcelTools = () => setExcelToolsOpen(true);
    window.addEventListener("open-telegram-composer", openComposer);
    window.addEventListener("open-telegram-excel-tools", openExcelTools);
    return () => {
      window.removeEventListener("open-telegram-composer", openComposer);
      window.removeEventListener("open-telegram-excel-tools", openExcelTools);
    };
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

  const input = useMemo(
    () => ({
      search: search.trim() || undefined,
      classification: severity === "all" ? undefined : severity,
      priority: priority === "all" ? undefined : priority,
      status: status === "all" ? undefined : status,
      category: category === "all" ? undefined : category,
      organizationScope:
        organizationScope === "current" ? undefined : organizationScope,
      from: dateFrom,
      to: dateTo,
      page,
      pageSize: TELEGRAMS_PER_PAGE,
    }),
    [
      search,
      severity,
      priority,
      status,
      category,
      organizationScope,
      dateFrom,
      dateTo,
      page,
    ]
  );
  useEffect(() => {
    setPage(1);
  }, [search, severity, priority, status, category, dateFrom, dateTo]);
  const settings = trpc.settings.get.useQuery();
  const me = trpc.auth.me.useQuery();
  const organizationContext = trpc.organizations.context.useQuery();
  useEffect(() => {
    if (organizationContext.data?.isOwner) setOrganizationScope("current");
  }, [
    organizationContext.data?.isOwner,
    organizationContext.data?.organizationId,
  ]);
  const workplaceOrganizations = trpc.organizations.all.useQuery(undefined, {
    enabled: organizationContext.data?.isOwner === true,
  });
  const organizationDescendants = trpc.organizations.descendants.useQuery();
  const stats = trpc.dashboard.stats.useQuery(undefined, {
    refetchInterval: LIVE_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });
  const routingDirectory = trpc.organizations.routingDirectory.useQuery();
  const list = trpc.telegrams.list.useQuery(input, {
    refetchInterval: LIVE_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });
  const detail = trpc.telegrams.get.useQuery(
    { id: selectedId ?? 0 },
    { enabled: selectedId !== null }
  );
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const clearWorkplaceSensitiveState = () => {
    setSelectedId(null);
    setComposerOpen(false);
    setReportOpen(false);
    setExcelToolsOpen(false);
    setExcelImportOpen(false);
    for (const queryKey of [
      getQueryKey(trpc.telegrams.list),
      getQueryKey(trpc.telegrams.get),
      getQueryKey(trpc.telegrams.attachments),
      getQueryKey(trpc.telegrams.incomingRoutes),
      getQueryKey(trpc.reports.telegrams),
      getQueryKey(trpc.dashboard.stats),
      getQueryKey(trpc.organizations.pendingApprovals),
      getQueryKey(trpc.notifications.inbox),
      getQueryKey(trpc.settings.get),
    ]) {
      void queryClient.cancelQueries({ queryKey });
      queryClient.removeQueries({ queryKey });
    }
  };
  const importExcel = trpc.telegrams.importRows.useMutation({
    onSuccess: result => {
      toast.success(
        `تم استيراد ${result.created} برقية${result.skipped ? `، وتخطي ${result.skipped} مكررة` : ""}`
      );
      if (result.errors.length > 0) {
        toast.warning(`تعذر استيراد ${result.errors.length} صفًا`);
        downloadImportErrorReport(result.errors);
      }
      setExcelImportOpen(false);
      setExcelRows([]);
      setExcelFileName("");
      setExcelSkippedRows(0);
      setExcelDuplicateRows(0);
      setExcelIssues([]);
      utils.telegrams.list.invalidate();
      utils.dashboard.stats.invalidate();
    },
    onError: error => toast.error(error.message || "تعذر استيراد ملف Excel"),
  });
  const create = trpc.telegrams.create.useMutation({
    onSuccess: telegram => {
      toast.success("تم تسجيل البرقية وربطها بهويتك الرقمية");
      void showLocalTelegramNotification({
        serialCode: getTelegramDisplayNumber(getTelegramSerialCode(telegram)),
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
    urgentAwaitingReceipt: 0,
    secret: 0,
    pending: 0,
    inProgress: 0,
    resolved: 0,
    incoming: 0,
    outgoing: 0,
  };
  const numberSystem = ((
    settings.data as { numberSystem?: NumberSystem } | undefined
  )?.numberSystem ?? "latin") as NumberSystem;
  const allRows = list.data ?? [];
  const outgoingOrganizationIds =
    organizationContext.data?.organizationId && organizationScope === "children"
      ? [
          organizationContext.data.organizationId,
          ...(organizationDescendants.data ?? []).map(item => item.id),
        ]
      : organizationContext.data?.organizationId &&
          organizationScope !== "current" &&
          organizationDescendants.data?.some(
            item => item.id === organizationScope
          )
        ? [organizationScope]
        : organizationContext.data?.organizationId
          ? [organizationContext.data.organizationId]
          : [];
  const isOutgoingTelegram = (row: (typeof allRows)[number]) =>
    outgoingOrganizationIds.length > 0
      ? outgoingOrganizationIds.includes(row.organizationId)
      : row.organizationId === row.currentOrganizationId;
  const rows = allRows.filter(row => {
    if (telegramView === "all") return true;
    const isOutgoing = isOutgoingTelegram(row);
    return telegramView === "outgoing" ? isOutgoing : !isOutgoing;
  });
  const canManageExcel =
    me.data?.role === "admin" ||
    ["system_admin", "organization_admin"].includes(
      organizationContext.data?.role ?? ""
    );
  const canManageOrganizationSettings = canManageExcel;

  const exportCurrentTable = async () => {
    setExportingExcel(true);
    try {
      const exportRows = await utils.telegrams.exportRows.fetch({
        search: input.search,
        classification: input.classification,
        priority: input.priority,
        status: input.status,
        category: input.category,
        from: input.from,
        to: input.to,
      });
      if (exportRows.length === 0) {
        toast.info("لا توجد صفوف قابلة للتصدير ضمن الفلاتر الحالية");
        return;
      }
      downloadTelegramWorkbook(
        exportRows.map(row => ({
          serial: localizeDigits(
            getTelegramDisplayNumber(getTelegramSerialCode(row)),
            numberSystem
          ),
          time: formatConfiguredDate(row.createdAt, settings.data),
          sender: row.creatorName,
          date:
            formatConfiguredDate(row.createdAt, settings.data).split(" ")[0] ??
            "",
          body: row.body,
          recipient: row.recipient,
          signature: row.creatorName,
          notes: row.workflowReason ?? "",
          direction: isOutgoingTelegram(row) ? "صادر" : "وارد",
        })),
        `سجل-البرقيات-${new Date().toISOString().slice(0, 10)}.xlsx`
      );
      toast.success(`تم تصدير ${exportRows.length} برقية بصيغة Excel`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تصدير Excel");
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExcelFile = async (file: File) => {
    try {
      const parsed = await parseTelegramWorkbook(file);
      setExcelRows(parsed.rows);
      setExcelSkippedRows(parsed.skippedRows);
      setExcelDuplicateRows(parsed.duplicateRows);
      setExcelIssues(parsed.issues);
      setExcelFileName(file.name);
      setExcelImportOpen(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "تعذر قراءة ملف Excel"
      );
    }
  };

  const openExcelPicker = () => excelInputRef.current?.click();

  const clearKpiFilters = () => {
    setSearch("");
    setSeverity("all");
    setPriority("all");
    setStatus("all");
    setCategory("all");
    setTelegramView("all");
    setDateFrom(undefined);
    setDateTo(undefined);
    setPage(1);
  };

  const selectKpi = (key: string) => {
    if (activeKpi === key) {
      clearKpiFilters();
      setActiveKpi(null);
      return;
    }

    clearKpiFilters();
    setActiveKpi(key);

    if (key === "today") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      setDateFrom(start.toISOString());
      setDateTo(end.toISOString());
    } else if (key === "urgent") {
      setPriority("urgent");
    } else if (key === "incoming") {
      setTelegramView("incoming");
    } else if (key === "in-progress") {
      setStatus("in_progress");
    } else if (key === "resolved") {
      setStatus("resolved");
    }
  };

  const clearSelectedKpi = () => {
    clearKpiFilters();
    setActiveKpi(null);
  };

  return (
    <div
      dir="rtl"
      className="mx-auto min-h-[calc(100vh-3rem)] w-full max-w-[1800px] space-y-4 pb-10"
    >
      <div className="flex flex-col gap-3 border-b border-border/70 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
          <div className="hidden items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground md:flex">
            <Clock3 className="h-3.5 w-3.5" />
            <time dateTime={liveNow.toISOString()} aria-live="polite">
              {formatConfiguredDate(liveNow, settings.data)}
            </time>
          </div>
          <div
            className="hidden items-center gap-1.5 rounded-lg border border-emerald-200/70 bg-emerald-50/70 px-3 py-2 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300 sm:flex"
            title="تتحدث الإحصاءات والسجل تلقائيًا كل 15 ثانية"
            aria-label="التحديث المباشر مفعّل"
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            مباشر
            {stats.isFetching && (
              <span className="mr-1 text-[10px] font-normal opacity-75">
                جارٍ التحديث
              </span>
            )}
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
              className="h-9 shrink-0 whitespace-nowrap rounded-lg px-3 text-xs"
              onClick={() => setReportOpen(true)}
              aria-haspopup="dialog"
            >
              تقرير البرقيات
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="h-9 shrink-0 whitespace-nowrap rounded-lg px-3 text-xs"
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
            className="h-9 shrink-0 whitespace-nowrap rounded-lg px-3 text-xs"
            onClick={() => setFiltersOpen(value => !value)}
            aria-expanded={filtersOpen}
          >
            <Filter className="ml-2 h-4 w-4" />
            الفلاتر
            {(severity !== "all" ||
              priority !== "all" ||
              status !== "all" ||
              category !== "all" ||
              organizationScope !== "current") && (
              <span className="mr-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#10233f] px-1.5 text-[10px] text-white">
                {
                  [
                    severity !== "all",
                    priority !== "all",
                    status !== "all",
                    category !== "all",
                    organizationScope !== "current",
                  ].filter(Boolean).length
                }
              </span>
            )}
          </Button>
        </div>
      </div>

      {data.urgentAwaitingReceipt > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500 text-white">
              <Siren className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-bold">تنبيه أمني يحتاج إلى متابعة</p>
              <p className="text-xs opacity-80">
                يوجد {formatCount(data.urgentAwaitingReceipt, numberSystem)}{" "}
                برقية ذات أولوية عاجلة ضمن نطاق صلاحيتك.
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
          active={activeKpi === "total"}
          onClick={() => selectKpi("total")}
        />
        <Kpi
          numberSystem={numberSystem}
          label="الصادرة اليوم"
          value={data.today}
          detail="آخر 24 ساعة"
          icon={Activity}
          tone="bg-blue-500/10 text-blue-600"
          active={activeKpi === "today"}
          onClick={() => selectKpi("today")}
        />
        <Kpi
          numberSystem={numberSystem}
          label="أولوية عاجل"
          value={data.urgent}
          detail="تحتاج انتباهاً"
          icon={Siren}
          tone="bg-red-500/10 text-red-600"
          active={activeKpi === "urgent"}
          onClick={() => selectKpi("urgent")}
        />
        <Kpi
          numberSystem={numberSystem}
          label="البرقيات الواردة"
          value={data.incoming}
          detail="إلى جهتك الحالية"
          icon={Inbox}
          tone="bg-emerald-500/10 text-emerald-600"
          active={activeKpi === "incoming"}
          onClick={() => selectKpi("incoming")}
        />
        <Kpi
          numberSystem={numberSystem}
          label="قيد الإجراء"
          value={data.inProgress}
          detail="قيد المعالجة"
          icon={Radio}
          tone="bg-cyan-500/10 text-cyan-600"
          active={activeKpi === "in-progress"}
          onClick={() => selectKpi("in-progress")}
        />
        <Kpi
          numberSystem={numberSystem}
          label="مكتملة نهائيًا"
          value={data.resolved}
          detail="تم إغلاقها"
          icon={CheckCircle2}
          tone="bg-emerald-500/10 text-emerald-600"
          active={activeKpi === "resolved"}
          onClick={() => selectKpi("resolved")}
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0 rounded-2xl border border-border/70 bg-card shadow-sm">
          <div className="flex flex-col gap-4 border-b p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">سجل البرقيات الكامل</h2>
                <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                  {formatCount(rows.length, numberSystem)} نتيجة
                </span>
                {activeKpi ? (
                  <button
                    type="button"
                    onClick={clearSelectedKpi}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/15"
                    aria-label="إزالة مرشح بطاقة الإحصاء"
                  >
                    {activeKpi === "today"
                      ? "الصادرة اليوم"
                      : activeKpi === "urgent"
                        ? "أولوية عاجل"
                        : activeKpi === "incoming"
                          ? "البرقيات الواردة"
                          : activeKpi === "in-progress"
                            ? "قيد الإجراء"
                            : activeKpi === "resolved"
                              ? "مكتملة نهائيًا"
                              : "إجمالي البرقيات"}
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                جميع السجلات مرتبة تنازليًا حسب الرقم التسلسلي مع ختم الهوية
                الرقمية وسجل تدقيق كامل. البحث والتصفية يشملان كامل السجل المتاح
                لك قبل تقسيم النتائج إلى صفحات.
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
          <div className="flex flex-nowrap gap-2 overflow-x-auto border-b bg-muted/10 px-4 py-3 sm:px-5">
            <TelegramViewButton
              active={telegramView === "all"}
              icon={ListFilter}
              label="كل البرقيات"
              count={data.total}
              onClick={() => setTelegramView("all")}
            />
            <TelegramViewButton
              active={telegramView === "outgoing"}
              icon={Send}
              label="البرقيات الصادرة"
              count={data.outgoing}
              onClick={() => setTelegramView("outgoing")}
            />
            <TelegramViewButton
              active={telegramView === "incoming"}
              icon={Inbox}
              label="البرقيات الواردة"
              count={data.incoming}
              onClick={() => setTelegramView("incoming")}
            />
          </div>
          {filtersOpen && (
            <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-4 py-3">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              {organizationContext.data?.isOwner ? (
                <span className="rounded-md border bg-background px-2.5 py-1.5 text-xs">
                  برقيات جهة العمل المحددة فقط
                </span>
              ) : (
                <select
                  value={organizationScope}
                  onChange={event => setOrganizationScope(event.target.value)}
                  className="rounded-md border bg-background px-2.5 py-1.5 text-xs"
                >
                  <option value="current">جهتي الحالية فقط</option>
                  {organizationDescendants.data?.length ? (
                    <>
                      <option value="children">جهتي والجهات التابعة</option>
                      {organizationDescendants.data.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </>
                  ) : null}
                </select>
              )}
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
                  setOrganizationScope("current");
                }}
                className="mr-auto text-xs text-muted-foreground hover:text-foreground"
              >
                مسح الفلاتر
              </button>
            </div>
          )}
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
                className="group relative flex w-full flex-col items-stretch gap-3 px-4 py-4 text-right transition-colors hover:bg-muted/40 sm:px-5"
              >
                <div className="relative flex flex-wrap items-center gap-2 pl-16">
                  {isOutgoingTelegram(row) ? (
                    <span
                      aria-label="برقية صادرة"
                      className="absolute left-0 top-1/2 inline-flex w-fit -translate-y-1/2 items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-bold leading-4 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300"
                    >
                      <ArrowUp aria-hidden="true" className="h-3.5 w-3.5" />
                      صادرة
                    </span>
                  ) : (
                    <span
                      aria-label="برقية واردة"
                      className="absolute left-0 top-1/2 inline-flex w-fit -translate-y-1/2 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold leading-4 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                    >
                      <ArrowDown aria-hidden="true" className="h-3.5 w-3.5" />
                      واردة
                    </span>
                  )}
                  <span className="text-base font-bold text-foreground sm:text-lg">
                    برقية رقم:{" "}
                    {localizeDigits(
                      getTelegramDisplayNumber(getTelegramSerialCode(row)),
                      numberSystem
                    )}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-1 text-sm leading-6 text-muted-foreground">
                  <p className="break-words">
                    <span className="font-semibold text-foreground">من:</span>{" "}
                    {row.senderOrganizationName || "الجهة المرسلة"}
                  </p>
                  <p className="break-words">
                    <span className="font-semibold text-foreground">إلى:</span>{" "}
                    {row.recipient}
                  </p>
                </div>
                <p className="min-w-0 break-words text-sm font-normal leading-7 sm:text-base">
                  <span className="font-semibold text-muted-foreground">
                    الموضوع:
                  </span>{" "}
                  {row.subject}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {displayColumns.priority && (
                    <PriorityBadge value={row.priority} />
                  )}
                  {displayColumns.category && (
                    <CategoryBadge value={row.category} />
                  )}
                  {displayColumns.priority && (
                    <SeverityBadge value={row.classification} />
                  )}
                  <StatusBadge value={row.status} />
                </div>
                {displayColumns.creator && (
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <UserRound className="h-3.5 w-3.5" />
                    <span className="truncate">{row.creatorName}</span>
                    <span className="hidden sm:inline">·</span>
                    <span className="hidden sm:inline">
                      {formatConfiguredDate(row.createdAt, settings.data)}
                    </span>
                  </div>
                )}
                <ChevronLeft className="absolute left-4 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-muted-foreground transition-transform group-hover:-translate-x-1 md:block sm:left-5" />
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
                disabled={
                  allRows.length < TELEGRAMS_PER_PAGE || list.isFetching
                }
                onClick={() => setPage(current => current + 1)}
              >
                التالي
              </Button>
            </div>
          </div>
        </section>
      </div>

      <Button
        type="button"
        onClick={() => setComposerOpen(true)}
        aria-label="إنشاء برقية جديدة"
        title="إنشاء برقية جديدة"
        className="group fixed bottom-5 left-5 z-40 h-14 w-14 rounded-full bg-[#10233f] p-0 text-white shadow-[0_14px_30px_rgba(16,35,63,0.28)] transition-all hover:-translate-y-1 hover:bg-[#18375f] hover:shadow-[0_18px_36px_rgba(16,35,63,0.36)] focus-visible:ring-2 focus-visible:ring-[#b4945a] focus-visible:ring-offset-2 sm:bottom-7 sm:left-7"
      >
        <MessageSquarePlus className="h-6 w-6 transition-transform group-hover:scale-110" />
        <span className="sr-only">برقية جديدة</span>
      </Button>

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
      {excelToolsOpen && (
        <ExcelToolsModal
          canImport={canManageExcel}
          exporting={exportingExcel}
          close={() => setExcelToolsOpen(false)}
          exportRows={() => void exportCurrentTable()}
          openImport={openExcelPicker}
          inputRef={excelInputRef}
          onFile={file => void handleExcelFile(file)}
        />
      )}
      {composerOpen && (
        <TelegramComposer
          pending={create.isPending}
          routingDirectory={routingDirectory.data ?? []}
          descendants={organizationDescendants.data ?? []}
          numberSystem={numberSystem}
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
          routingDirectory={routingDirectory.data ?? []}
          close={() => setSelectedId(null)}
        />
      )}
      {canManageOrganizationSettings && (
        <DepartmentSettingsModal
          settings={settings.data}
          organizationName={organizationContext.data?.organizationName}
          isOwner={organizationContext.data?.isOwner === true}
          activeOrganizationId={organizationContext.data?.organizationId}
          organizations={workplaceOrganizations.data ?? []}
          onWorkplaceChanged={clearWorkplaceSensitiveState}
        />
      )}
      {me.data?.role === "admin" && <OwnerUserManagement />}
      {excelImportOpen && (
        <ExcelImportPreviewModal
          fileName={excelFileName}
          rows={excelRows}
          skippedRows={excelSkippedRows}
          duplicateRows={excelDuplicateRows}
          issues={excelIssues}
          pending={importExcel.isPending}
          close={() => setExcelImportOpen(false)}
          confirm={() => importExcel.mutate({ rows: excelRows })}
        />
      )}
    </div>
  );
}

function ExcelToolsModal({
  canImport,
  exporting,
  close,
  exportRows,
  openImport,
  inputRef,
  onFile,
}: {
  canImport: boolean;
  exporting: boolean;
  close: () => void;
  exportRows: () => void;
  openImport: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (file: File) => void;
}) {
  return (
    <Modal
      title="استيراد وتصدير سجل البرقيات"
      subtitle="أدوات السجل بصيغة Excel"
      close={close}
    >
      <div className="space-y-4">
        <p className="text-sm leading-7 text-muted-foreground">
          استخدم هذه النافذة لتصدير النتائج المفلترة أو استيراد سجل مطابق لنموذج
          البرقيات المعتمد.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={exportRows}
            disabled={exporting}
            className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-2xl border border-primary/20 bg-primary/[0.04] p-5 text-center transition-colors hover:border-primary/50 hover:bg-primary/[0.08] disabled:cursor-wait disabled:opacity-60"
          >
            <FileSpreadsheet className="h-8 w-8 text-primary" />
            <span className="font-bold">
              {exporting ? "جارٍ تجهيز الملف..." : "تصدير سجل البرقيات"}
            </span>
            <span className="text-xs text-muted-foreground">
              ملف Excel بورقتي صادر ووارد
            </span>
          </button>
          {canImport ? (
            <>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={event => {
                  const file = event.target.files?.[0];
                  event.currentTarget.value = "";
                  if (file) onFile(file);
                }}
              />
              <button
                type="button"
                onClick={openImport}
                className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-2xl border border-[#b4945a]/30 bg-[#b4945a]/[0.06] p-5 text-center transition-colors hover:border-[#b4945a] hover:bg-[#b4945a]/[0.12]"
              >
                <Upload className="h-8 w-8 text-[#9b7c3d]" />
                <span className="font-bold">استيراد سجل البرقيات</span>
                <span className="text-xs text-muted-foreground">
                  معاينة وفحص قبل الاعتماد
                </span>
              </button>
            </>
          ) : (
            <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-muted/20 p-5 text-center text-muted-foreground">
              <LockKeyhole className="h-7 w-7" />
              <span className="text-sm font-semibold">
                الاستيراد متاح لمسؤول الجهة فقط
              </span>
            </div>
          )}
        </div>
        <div className="rounded-xl border bg-muted/20 p-3 text-xs leading-6 text-muted-foreground">
          يحافظ التصدير والاستيراد على ترتيب أعمدة السجل، بما في ذلك عمود تاريخ
          البرقية، ولا يؤدي الاستيراد إلى حذف أو استبدال السجلات الموجودة.
        </div>
      </div>
    </Modal>
  );
}

function ExcelImportPreviewModal({
  fileName,
  rows,
  skippedRows,
  duplicateRows,
  issues,
  pending,
  close,
  confirm,
}: {
  fileName: string;
  rows: TelegramSpreadsheetRow[];
  skippedRows: number;
  duplicateRows: number;
  issues: TelegramSpreadsheetIssue[];
  pending: boolean;
  close: () => void;
  confirm: () => void;
}) {
  return (
    <Modal
      title="مراجعة استيراد سجل البرقيات"
      subtitle="استيراد ذكي وآمن من Excel"
      close={close}
      wide
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border bg-muted/20 p-3">
            <p className="text-[11px] text-muted-foreground">الملف</p>
            <p className="mt-1 truncate text-sm font-semibold">{fileName}</p>
          </div>
          <div className="rounded-xl border bg-muted/20 p-3">
            <p className="text-[11px] text-muted-foreground">صفوف صالحة</p>
            <p className="mt-1 text-xl font-bold">{rows.length}</p>
          </div>
          <div className="rounded-xl border bg-muted/20 p-3">
            <p className="text-[11px] text-muted-foreground">
              صفوف فارغة أو ناقصة
            </p>
            <p className="mt-1 text-xl font-bold">{skippedRows}</p>
          </div>
          <div className="rounded-xl border bg-muted/20 p-3">
            <p className="text-[11px] text-muted-foreground">مكررات مستبعدة</p>
            <p className="mt-1 text-xl font-bold">{duplicateRows}</p>
          </div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-900">
          سيُنشئ النظام رقمًا جديدًا لكل سجل داخل المنصة، ويحفظ رقم الصف والورقة
          والوقت الأصلي في سجل التدقيق. لن تُحذف البرقيات الموجودة، وإعادة رفع
          الملف نفسه ستتخطى الصفوف المستوردة سابقًا.
        </div>
        {issues.length > 0 && (
          <details className="rounded-xl border bg-muted/10 p-3">
            <summary className="cursor-pointer text-sm font-semibold">
              عرض تقرير التحقق ({issues.length} ملاحظة)
            </summary>
            <div className="mt-3 max-h-32 space-y-2 overflow-auto text-xs text-muted-foreground">
              {issues.slice(0, 20).map((issue, index) => (
                <div
                  key={`${issue.sheetName}-${issue.rowNumber}-${index}`}
                  className="flex flex-wrap gap-x-2 gap-y-1 rounded-lg border bg-background p-2"
                >
                  <span className="font-semibold text-foreground">
                    {issue.sheetName} — صف {issue.rowNumber}
                  </span>
                  <span>{issue.reason}</span>
                  {issue.value ? <span>({issue.value})</span> : null}
                </div>
              ))}
            </div>
          </details>
        )}
        <div className="max-h-[42vh] overflow-auto rounded-xl border">
          <table className="w-full min-w-[760px] text-right text-xs">
            <thead className="sticky top-0 bg-muted">
              <tr>
                <th className="p-3">الورقة</th>
                <th className="p-3">الرقم الأصلي</th>
                <th className="p-3">الوقت</th>
                <th className="p-3">المرسل</th>
                <th className="p-3">تاريخ البرقية</th>
                <th className="p-3">نص البرقية</th>
                <th className="p-3">المستلم</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((row, index) => (
                <tr
                  key={`${row.sheetName}-${row.originalSerial}-${index}`}
                  className="border-t align-top"
                >
                  <td className="p-3 font-semibold">{row.sheetName}</td>
                  <td className="p-3">{row.originalSerial || "—"}</td>
                  <td className="p-3">{row.time || "—"}</td>
                  <td className="max-w-48 p-3">{row.sender || "—"}</td>
                  <td className="p-3">{row.date || "—"}</td>
                  <td className="max-w-[28rem] p-3">{row.body}</td>
                  <td className="max-w-48 p-3">{row.recipient || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 100 && (
            <p className="border-t p-3 text-center text-xs text-muted-foreground">
              تظهر أول 100 صف للمعاينة فقط، وسيتم استيراد جميع الصفوف الصالحة.
            </p>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={close}
            disabled={pending}
          >
            إلغاء
          </Button>
          <Button
            type="button"
            onClick={confirm}
            disabled={pending || rows.length === 0}
            className="bg-[#10233f] text-white hover:bg-[#18375f]"
          >
            {pending
              ? "جارٍ استيراد السجلات..."
              : `اعتماد استيراد ${rows.length} برقية`}
          </Button>
        </div>
      </div>
    </Modal>
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
      subtitle="إعدادات عرض السجل"
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
        localizeDigits(
          getTelegramDisplayNumber(getTelegramSerialCode(row)),
          settings?.numberSystem ?? "latin"
        ),
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
                  <td className="p-3 font-mono">
                    {localizeDigits(
                      getTelegramDisplayNumber(getTelegramSerialCode(row)),
                      settings?.numberSystem ?? "latin"
                    )}
                  </td>
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

function TelegramViewButton({
  active,
  icon: Icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: typeof ListFilter;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${active ? "border-[#10233f] bg-[#10233f] text-white shadow-sm" : "bg-background text-muted-foreground hover:border-[#b4945a] hover:text-foreground"}`}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
      <span
        className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? "bg-white/15" : "bg-muted"}`}
      >
        {count}
      </span>
    </button>
  );
}

function TelegramComposer({
  pending,
  routingDirectory,
  descendants,
  numberSystem,
  close,
  submit,
}: {
  pending: boolean;
  routingDirectory: Array<{
    id: string;
    code: string;
    name: string;
    type: string;
    parentOrganizationId: string | null;
    isSelectable: boolean;
    isConfiguredDestination?: boolean;
  }>;
  descendants: Array<{
    id: string;
    name: string;
    parentOrganizationId: string | null;
  }>;
  numberSystem: NumberSystem;
  close: () => void;
  submit: (values: {
    subject: string;
    recipient: string;
    recipientOrganizationId?: string;
    broadcastToDescendants?: boolean;
    body: string;
    classification: Classification;
    priority: Priority;
    category: Category;
    requestedOrganizationSerialNumber: number;
  }) => void;
}) {
  const [subject, setSubject] = useState("");
  const [recipient, setRecipient] = useState("");
  const [recipientOrganizationId, setRecipientOrganizationId] = useState("");
  const [broadcastToDescendants, setBroadcastToDescendants] = useState(false);
  const [body, setBody] = useState("");
  const [classification, setClassification] =
    useState<Classification>("normal");
  const [priority, setPriority] = useState<Priority>("normal");
  const [category, setCategory] = useState<Category>("administrative");
  const [serialNumber, setSerialNumber] = useState("");
  const [serialNumberEdited, setSerialNumberEdited] = useState(false);
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine
  );

  const suggestedSerial = trpc.telegrams.nextOutgoingSerial.useQuery();

  useEffect(() => {
    if (serialNumberEdited || !suggestedSerial.data?.number) return;
    setSerialNumber(String(suggestedSerial.data.number));
  }, [serialNumberEdited, suggestedSerial.data?.number]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    const configuredTarget = routingDirectory.find(
      target => target.isConfiguredDestination
    );
    if (configuredTarget && !recipientOrganizationId) {
      setRecipient(configuredTarget.name);
    }
  }, [recipientOrganizationId, routingDirectory]);

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

    if (!/^[1-9]\d{0,8}$/.test(serialNumber)) {
      toast.error("أدخل رقم برقية صحيحًا");
      return;
    }

    submit({
      subject: subject.trim(),
      recipient: recipient.trim(),
      ...(recipientOrganizationId ? { recipientOrganizationId } : {}),
      ...(broadcastToDescendants ? { broadcastToDescendants: true } : {}),
      body: body.trim(),
      classification,
      priority,
      category,
      requestedOrganizationSerialNumber: Number(serialNumber),
    });
  };

  return (
    <Modal title="إنشاء برقية جديدة" close={close} fullScreenOnMobile compact>
      <div className="grid min-w-0 max-w-full gap-4">
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
          رقم البرقية
          <Input
            value={localizeDigits(serialNumber, numberSystem)}
            onChange={event => {
              const normalized = localizeDigits(event.target.value, "latin")
                .replace(/\D/g, "")
                .slice(0, 9);
              setSerialNumber(normalized);
              setSerialNumberEdited(true);
            }}
            inputMode="numeric"
            dir="rtl"
            placeholder={
              suggestedSerial.isLoading ? "جارٍ اقتراح الرقم..." : "رقم البرقية"
            }
            aria-describedby="telegram-serial-help"
            className="h-11 w-full min-w-0 max-w-full rounded-lg text-right font-mono tracking-wide"
          />
          <span
            id="telegram-serial-help"
            className="text-[11px] font-normal leading-5 text-muted-foreground"
          >
            {suggestedSerial.isError
              ? "تعذر اقتراح الرقم تلقائيًا؛ أدخل رقمًا غير مستخدم يدويًا."
              : "يوضع الرقم التالي تلقائيًا، ويمكن تعديله قبل الحفظ. يمنع النظام تكرار الرقم داخل الجهة."}
          </span>
        </label>
        <div className="grid gap-1.5 text-xs font-bold">
          <span>الجهة الموجهة إليها</span>
          <OrganizationTreePicker
            options={routingDirectory}
            value={recipientOrganizationId}
            onValueChange={targetId => {
              const target = routingDirectory.find(
                item => item.id === targetId
              );
              setRecipientOrganizationId(targetId);
              setBroadcastToDescendants(false);
              setRecipient(
                target?.name ??
                  routingDirectory.find(item => item.isConfiguredDestination)
                    ?.name ??
                  ""
              );
            }}
            placeholder={
              routingDirectory.some(target => target.isConfiguredDestination)
                ? "التوجيه الافتراضي حسب إعداد الجهة"
                : "اختر القيادة أو المديرية أو الجهة المستقبلة"
            }
            ariaLabel="اختيار الجهة الموجهة إليها"
            allowClear={Boolean(recipientOrganizationId)}
            clearLabel={
              routingDirectory.some(target => target.isConfiguredDestination)
                ? "استخدام التوجيه الافتراضي"
                : "إلغاء اختيار الوجهة"
            }
            emptyMessage="لا توجد جهات مسموحة للإرسال من جهة العمل الحالية."
          />
          {descendants.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setBroadcastToDescendants(true);
                setRecipientOrganizationId("");
                setRecipient("كافة الوحدات");
              }}
              className={`rounded-lg border px-3 py-2 text-right text-xs transition-colors ${
                broadcastToDescendants
                  ? "border-primary bg-primary/10 text-primary"
                  : "bg-muted/30 text-muted-foreground hover:bg-muted"
              }`}
            >
              <span className="font-bold">كافة الوحدات</span>
              <span className="mr-2">
                إرسال نسخة إلى الجهات التابعة مباشرة ({descendants.length})
              </span>
            </button>
          )}
        </div>

        <div className="grid gap-1.5 text-xs font-bold">
          <span>درجة السرية</span>
          <div className="grid min-w-0 grid-cols-2 gap-2">
            {(Object.keys(classificationLabels) as Classification[]).map(
              item => (
                <button
                  type="button"
                  key={item}
                  onClick={() => setClassification(item)}
                  className={`min-w-0 rounded-lg border p-2.5 text-xs ${
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
          <div className="grid min-w-0 grid-cols-3 gap-2">
            {(Object.keys(priorityLabels) as Priority[]).map(item => (
              <button
                type="button"
                key={item}
                onClick={() => setPriority(item)}
                className={`min-w-0 rounded-lg border p-2.5 text-xs ${
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
            className="h-11 w-full min-w-0 max-w-full rounded-lg border bg-background px-3 text-sm font-normal"
          >
            {(Object.keys(categoryLabels) as Category[]).map(item => (
              <option key={item} value={item}>
                {categoryLabels[item]}
              </option>
            ))}
          </select>
        </div>

        <label className="grid gap-1.5 text-xs font-bold">
          الموضوع
          <Input
            value={subject}
            onChange={event => setSubject(event.target.value)}
            placeholder="عنوان مختصر ودقيق للبلاغ"
            className="h-11 w-full min-w-0 max-w-full rounded-lg"
          />
        </label>

        <label className="grid gap-1.5 text-xs font-bold">
          نص البرقية
          <Textarea
            value={body}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            onChange={event => setBody(event.target.value)}
            placeholder="اكتب تفاصيل البلاغ..."
            className="w-full min-w-0 max-w-full min-h-[30vh] rounded-lg leading-7 sm:min-h-36"
          />
        </label>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
        <Button variant="outline" onClick={close} className="h-11 rounded-lg">
          إلغاء
        </Button>
        <Button
          onClick={save}
          disabled={pending || !online}
          className="h-11 rounded-lg bg-[#10233f] text-white hover:bg-[#18375f]"
        >
          {pending ? "جارٍ الإرسال..." : "إرسال البرقية"}
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
  routingDirectory,
  close,
}: {
  telegram: {
    id: number;
    serialCode: string;
    organizationSerialCode?: string | null;
    senderOrganizationName?: string | null;
    organizationId?: string | null;
    currentOrganizationId?: string | null;
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
  routingDirectory: Array<{
    id: string;
    code: string;
    name: string;
    type: string;
    parentOrganizationId: string | null;
    isSelectable: boolean;
  }>;
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
    onSuccess: async result => {
      toast.success(
        result.deletedAttachmentCount > 0
          ? `تم حذف البرقية ${getTelegramDisplayNumber(result.serialCode)} نهائيًا مع ${result.deletedAttachmentCount} مرفق`
          : `تم حذف البرقية ${getTelegramDisplayNumber(result.serialCode)} نهائيًا`
      );
      if (result.pendingStorageCleanup > 0) {
        toast.warning(
          "تم حذف البرقية، لكن تعذر تنظيف بعض ملفات المرفقات من مساحة التخزين"
        );
      }
      await Promise.all([
        utils.telegrams.list.invalidate(),
        utils.telegrams.get.invalidate({ id: telegram.id }),
        utils.dashboard.stats.invalidate(),
        utils.reports.telegrams.invalidate(),
      ]);
      close();
    },
    onError: error => toast.error(error.message || "تعذر حذف البرقية"),
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
  const routeableTargets = routingDirectory.filter(
    target => target.isSelectable
  );
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
  const incomingRoutes = trpc.telegrams.incomingRoutes.useQuery({
    telegramId: telegram.id,
  });
  const receiveRoute = trpc.telegrams.receiveRoute.useMutation({
    onSuccess: async () => {
      toast.success("تم تسجيل استلام الإحالة في السجل المعتمد");
      await Promise.all([
        utils.telegrams.incomingRoutes.invalidate({ telegramId: telegram.id }),
        utils.telegrams.get.invalidate({ id: telegram.id }),
        utils.telegrams.list.invalidate(),
        utils.dashboard.stats.invalidate(),
      ]);
    },
    onError: error => toast.error(error.message || "تعذر تسجيل استلام الإحالة"),
  });
  const decideRouteAsReceiver =
    trpc.telegrams.decideRouteAsReceiver.useMutation({
      onSuccess: async route => {
        toast.success(
          route.receiverDecisionStatus === "accepted"
            ? "تم تأكيد استلام البرقية"
            : "تم رفض استلام البرقية وتسجيل السبب"
        );
        await Promise.all([
          utils.telegrams.incomingRoutes.invalidate({
            telegramId: telegram.id,
          }),
          utils.telegrams.get.invalidate({ id: telegram.id }),
          utils.telegrams.list.invalidate(),
          utils.dashboard.stats.invalidate(),
        ]);
      },
      onError: error =>
        toast.error(error.message || "تعذر تسجيل قرار الاستلام"),
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

    const numberSystem = normalizeNumberSystem(settings?.numberSystem);
    const departmentName = localizeDigits(
      settings?.departmentName ?? "قسم العمليات",
      numberSystem
    );
    const senderOrganizationName = localizeDigits(
      telegram.senderOrganizationName?.trim() || "الجهة المرسلة",
      numberSystem
    );
    const unitName = localizeDigits(
      settings?.unitName ?? "قيادة الأمن الداخلي",
      numberSystem
    );
    const organizationById = new Map(
      routingDirectory.map(organization => [organization.id, organization])
    );
    const hierarchyNames: string[] = [];
    let hierarchyId = telegram.currentOrganizationId ?? telegram.organizationId;
    const visited = new Set<string>();
    while (hierarchyId && !visited.has(hierarchyId)) {
      const organization = organizationById.get(hierarchyId);
      if (!organization) break;
      hierarchyNames.unshift(organization.name);
      visited.add(hierarchyId);
      hierarchyId = organization.parentOrganizationId;
    }
    // The first two header lines are fixed institutional headings. Some
    // organization trees include "وزارة الداخلية" as a parent node, so omit
    // fixed headings from the dynamic hierarchy to avoid displaying them twice.
    const hierarchyCandidates = hierarchyNames.length
      ? [...hierarchyNames]
      : [unitName, departmentName];
    const senderOrganizationNameRaw = telegram.senderOrganizationName?.trim();
    if (
      senderOrganizationNameRaw &&
      !hierarchyCandidates.some(
        name =>
          localizeDigits(name, numberSystem).trim() ===
          senderOrganizationName.trim()
      )
    ) {
      // The hierarchy above ends at the current command in some telegram
      // records. Include the actual sending unit as the final header line.
      hierarchyCandidates.push(senderOrganizationNameRaw);
    }
    const fixedHeaderNames = new Set([
      "الجمهورية العربية السورية",
      "وزارة الداخلية",
    ]);
    const organizationHierarchy = hierarchyCandidates.filter(
      name => !fixedHeaderNames.has(name.trim())
    );
    const createdAt = formatConfiguredDate(telegram.createdAt, settings);
    const headerCreatedAt = formatConfiguredHeaderDateTime(
      telegram.createdAt,
      settings
    );
    const location = localizeDigits(
      telegram.gpsLatitude != null && telegram.gpsLongitude != null
        ? `${telegram.gpsLatitude}, ${telegram.gpsLongitude}`
        : "غير محدد",
      numberSystem
    );
    const displaySerial = localizeDigits(
      getTelegramDisplayNumber(getTelegramSerialCode(telegram)),
      numberSystem
    );
    const logo = settings?.logoUrl
      ? `<img class="official-logo" src="${escapeHtml(settings.logoUrl)}" alt="الشعار الرسمي" />`
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
        ${EXPORT_CAIRO_FONT_FACES}
        .telegram-export-page {
          position: relative;
          isolation: isolate;
          box-sizing: border-box;
          width: ${PRINT_PAGE_WIDTH_PX}px;
          min-height: ${PRINT_PAGE_HEIGHT_PX}px;
          padding: ${PRINT_MARGIN_MM}mm;
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
          width: 93.75%;
          height: 93.75%;
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
          grid-template-columns: minmax(0, 1fr) 120px minmax(0, 1fr);
          align-items: start;
          gap: 2px;
          padding: 0 0 22px;
          border-bottom: 3px solid #b49a55;
        }
        .telegram-export-page .header-government,
        .telegram-export-page .header-metadata { min-width: 0; }
        /* Mirror the two blocks from the page edges, not from the logo. */
        .telegram-export-page .header-government { text-align: right; }
        .telegram-export-page .header-metadata { text-align: left; }
        .telegram-export-page .header-government p,
        .telegram-export-page .header-metadata p { margin: 0; font-size: 15pt; font-weight: 700; line-height: 1.25; white-space: nowrap; letter-spacing: -0.12px; transform: scaleX(0.86); transform-origin: left center; }
        .telegram-export-page .header-government p { transform-origin: right center; }
        .telegram-export-page .header-date-value { display: inline-block; direction: ltr; unicode-bidi: isolate; font-size: 13pt; letter-spacing: 0; white-space: nowrap; }
        .telegram-export-page .official-header { font-weight: 700; }
        .telegram-export-page .government-name { font-size: 15pt; font-weight: 700; white-space: nowrap; }
        .telegram-export-page .government-subtitle { font-size: 15pt; font-weight: 700; white-space: nowrap; }
        .telegram-export-page .header-metadata { font-size: 15pt; font-weight: 700; line-height: 1.25; white-space: nowrap; }
         .telegram-export-page .header-logo-cell { display: flex; align-items: center; justify-content: center; min-width: 0; }
         .telegram-export-page .official-logo {
          display: block;
          width: 120px;
          height: 120px;
          margin: 0 auto;
          object-fit: contain;
        }
         .telegram-export-page .official-seal {
          width: 110px;
          height: 110px;
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
          .telegram-export-page { width: ${PRINT_PAGE_WIDTH_MM}mm; min-height: ${PRINT_PAGE_HEIGHT_MM}mm; }
        }
      </style>
      <article class="telegram-export-page" dir="rtl" lang="ar">
        <div class="page-watermark">${watermark}</div>
        <header class="official-header">
          <div class="header-government">
            <p class="government-name">الجمهورية العربية السورية</p>
            <p class="government-subtitle">وزارة الداخلية</p>
            ${organizationHierarchy.map(name => `<p>${escapeHtml(localizeDigits(name, numberSystem))}</p>`).join("")}
          </div>
          <div class="header-logo-cell">${logo}</div>
          <div class="header-metadata">
            <p><strong>رقم البرقية:</strong> ${escapeHtml(displaySerial)}</p>
            <p><strong>الوقت والتاريخ:</strong> <span class="header-date-value" dir="ltr">${escapeHtml(headerCreatedAt)}</span></p>
            <p><strong>درجة السرية:</strong> ${escapeHtml(classificationLabels[telegram.classification])}</p>
            <p><strong>درجة الأولوية:</strong> ${escapeHtml(priorityLabels[telegram.priority])}</p>
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
                <p><strong>من:</strong> ${escapeHtml(senderOrganizationName)}</p>
                <p><strong>إلى:</strong> ${escapeHtml(localizeDigits(telegram.recipient, numberSystem))}</p>
                <p><strong>الموضوع:</strong> ${escapeHtml(localizeDigits(telegram.subject, numberSystem))}</p>
              </div>
              <div class="routing-qr" role="img" aria-label="رمز QR لبيانات البرقية">${qrSvg}</div>
            </div>
          </section>
          <h2 class="body-heading">نص البرقية</h2>
          <div class="telegram-body">${escapeHtml(localizeDigits(telegram.body, numberSystem))}</div>
          <section class="signature">
            <p><strong>${escapeHtml(localizeDigits(settings?.unitChiefRank ?? "رئيس الوحدة", numberSystem))} ${escapeHtml(localizeDigits(settings?.unitChiefName ?? "", numberSystem))}</strong></p>
            <p>رئيس ${escapeHtml(departmentName)}</p>
          </section>
        </main>
        <footer class="document-footer">
          <p class="footer-creator">تم إنشاء هذه الوثيقة بواسطة: ${escapeHtml(localizeDigits(telegram.creatorName, numberSystem))}</p>
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

      const scale = Math.min(1, availableWidth / PRINT_PAGE_WIDTH_PX);
      const scaledHeight = Math.ceil(paper.offsetHeight * scale);

      exportWrapper.style.cssText = `position:relative;width:${availableWidth}px;height:${scaledHeight}px;overflow:hidden;`;
      paper.style.position = "absolute";
      paper.style.top = "0";
      paper.style.left = "50%";
      paper.style.marginLeft = `${-(PRINT_PAGE_WIDTH_PX / 2)}px`;
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

  const renderOfficialDocument = async (format: "pdf" | "png") => {
    await document.fonts.ready;
    const wrapper = createExportPaper();
    const paper = wrapper.querySelector<HTMLElement>(".telegram-export-page");
    if (!paper) throw new Error("تعذر تجهيز قالب البرقية للتصدير");

    // The saved logo URL is protected by the app's authenticated storage
    // route. Chromium runs without the browser session, so inline each image
    // while the authenticated page can still fetch it.
    const imageCache = new Map<string, string>();
    await Promise.all(
      Array.from(wrapper.querySelectorAll<HTMLImageElement>("img")).map(
        async image => {
          const source = image.currentSrc || image.src;
          if (!source || source.startsWith("data:")) return;
          try {
            let dataUrl = imageCache.get(source);
            if (!dataUrl) {
              const response = await fetch(source, {
                credentials: "same-origin",
              });
              if (!response.ok) throw new Error("تعذر تحميل صورة الوثيقة");
              const blob = await response.blob();
              if (!blob.type.startsWith("image/")) {
                throw new Error("مصدر الشعار ليس صورة صالحة");
              }
              const imageUrl = URL.createObjectURL(blob);
              try {
                const preview = new Image();
                preview.decoding = "async";
                preview.src = imageUrl;
                await preview.decode();
                const maxDimension = 800;
                const scale = Math.min(
                  1,
                  maxDimension /
                    Math.max(preview.naturalWidth, preview.naturalHeight)
                );
                const canvas = document.createElement("canvas");
                canvas.width = Math.max(
                  1,
                  Math.round(preview.naturalWidth * scale)
                );
                canvas.height = Math.max(
                  1,
                  Math.round(preview.naturalHeight * scale)
                );
                const context = canvas.getContext("2d");
                if (!context) throw new Error("تعذر تجهيز صورة الشعار");
                context.drawImage(preview, 0, 0, canvas.width, canvas.height);
                dataUrl = canvas.toDataURL("image/webp", 0.86);
                if (!dataUrl.startsWith("data:image/webp")) {
                  dataUrl = canvas.toDataURL("image/png");
                }
              } finally {
                URL.revokeObjectURL(imageUrl);
              }
              imageCache.set(source, dataUrl);
            }
            image.removeAttribute("crossorigin");
            image.removeAttribute("srcset");
            image.src = dataUrl;
            await image.decode();
          } catch {
            // Never send a broken image to Chromium. Replace it with the same
            // vector fallback used when no logo is configured.
            image.outerHTML = image.classList.contains("watermark-logo")
              ? `<div class="watermark-seal" aria-hidden="true"><span>★</span><strong>وزارة<br />الداخلية</strong></div>`
              : `<div class="official-seal" aria-label="الشعار الرسمي"><span>★</span><strong>وزارة<br />الداخلية</strong></div>`;
          }
        }
      )
    );

    // Chromium renders this document from about:blank with all network
    // requests disabled. Inline the same bundled Cairo fonts used by the
    // preview so Arabic glyphs never depend on a relative URL resolving.
    const fontWeights = ["400", "500", "600", "700"] as const;
    const fontDataUrls = new Map<string, string>(
      await Promise.all(
        fontWeights.map(async weight => {
          const response = await fetch(`/fonts/cairo-${weight}.ttf`, {
            credentials: "same-origin",
          });
          if (!response.ok) {
            throw new Error(`تعذر تحميل خط الوثيقة Cairo (${weight})`);
          }

          const fontBlob = await response.blob();
          if (fontBlob.size === 0) {
            throw new Error(`ملف خط الوثيقة Cairo (${weight}) فارغ`);
          }

          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result === "string") {
                resolve(reader.result);
              } else {
                reject(new Error("تعذر تجهيز خط الوثيقة للتصدير"));
              }
            };
            reader.onerror = () =>
              reject(reader.error ?? new Error("تعذر قراءة خط الوثيقة"));
            reader.readAsDataURL(fontBlob);
          });

          return [`cairo-${weight}.ttf`, dataUrl] as const;
        })
      )
    );

    const exportStyles = Array.from(wrapper.querySelectorAll("style"));
    for (const style of exportStyles) {
      let css = style.textContent ?? "";
      for (const weight of fontWeights) {
        const fontName = `cairo-${weight}.ttf`;
        const dataUrl = fontDataUrls.get(fontName);
        if (!dataUrl) {
          throw new Error(`خط الوثيقة Cairo (${weight}) غير جاهز`);
        }
        css = css.replaceAll(`url("/fonts/${fontName}")`, `url("${dataUrl}")`);
      }
      style.textContent = css;
    }

    if (exportStyles.some(style => /url\(["']?\/fonts\/cairo-\d+\.ttf/.test(style.textContent ?? ""))) {
      throw new Error("تعذر تضمين خطوط العربية في الوثيقة");
    }

    const html = `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <base href="${window.location.origin}/" />
  </head>
  <body>${wrapper.innerHTML}</body>
</html>`;
    const response = await fetch("/api/telegram-render", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format, html }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(payload?.error || "تعذر إنشاء الوثيقة الرسمية");
    }
    return response.blob();
  };

  const getPrintStyles = () => `
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
          width: 100vw !important;
          height: ${PRINT_PAGE_HEIGHT_MM}mm !important;
          min-height: 0 !important;
          max-height: ${PRINT_PAGE_HEIGHT_MM}mm !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #fff !important;
          overflow: hidden !important;
        }

        #telegram-print-root .telegram-export-page {
          width: ${PRINT_PAGE_WIDTH_MM}mm !important;
          height: ${PRINT_PAGE_HEIGHT_MM}mm !important;
          min-height: ${PRINT_PAGE_HEIGHT_MM}mm !important;
          max-height: ${PRINT_PAGE_HEIGHT_MM}mm !important;
          margin: 0 auto !important;
          overflow: hidden !important;
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }

        @page {
          size: A4 portrait;
          margin: 0;
        }
      }
`;

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
    printRoot.style.width = `${PRINT_PAGE_WIDTH_MM}mm`;
    printRoot.style.minHeight = `${PRINT_PAGE_HEIGHT_MM}mm`;
    printRoot.style.background = "#fff";

    printStyle.id = "telegram-print-style";
    printStyle.textContent = getPrintStyles();

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

  const imageBlob = async (): Promise<Blob> => renderOfficialDocument("png");

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
          title: `برقية ${getTelegramDisplayNumber(telegram.serialCode)}`,
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
      const blob = await renderOfficialDocument("pdf");
      const file = new File([blob], `${telegram.serialCode}.pdf`, {
        type: "application/pdf",
      });

      if (share && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `برقية ${getTelegramDisplayNumber(telegram.serialCode)}`,
          text: telegram.subject,
          files: [file],
        });
        toast.success("تم فتح خيارات مشاركة البرقية");
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = file.name;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast.success(
          share
            ? "المتصفح لا يدعم المشاركة المباشرة؛ تم تنزيل ملف PDF"
            : "تم تنزيل البرقية بصيغة PDF مطابقة للطباعة"
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

  return (
    <Modal
      title={telegram.subject}
      subtitle={localizeDigits(
        getTelegramDisplayNumber(getTelegramSerialCode(telegram)),
        settings?.numberSystem ?? "latin"
      )}
      close={close}
    >
      <div
        ref={paperRef}
        className="telegram-preview-stage w-full overflow-hidden rounded-sm bg-white"
        dir="rtl"
        lang="ar"
        aria-label="معاينة البرقية بحجم الورقة"
      />
      {incomingRoutes.data && incomingRoutes.data.length > 0 && (
        <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3 print:hidden">
          <p className="text-xs font-bold">سجل استلام الإحالات</p>
          <div className="mt-2 grid gap-2">
            {incomingRoutes.data.map(route => (
              <div
                key={route.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-xs"
              >
                <div>
                  <p className="font-semibold">
                    {route.status === "received"
                      ? "تم تأكيد استلام الإحالة"
                      : route.status === "rejected"
                        ? "تم رفض استلام الإحالة"
                        : "إحالة بانتظار تأكيد الجهة المستقبلة"}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {route.status === "received" && route.receivedAt
                      ? `وقت الاستلام: ${new Date(route.receivedAt).toLocaleString("ar-SY")}`
                      : route.status === "rejected"
                        ? `سبب الرفض: ${route.receiverDecisionReason ?? "غير محدد"}`
                        : "يجب على الجهة المستقبلة تأكيد الاستلام أو رفضه بسبب موثق"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                    {route.routeSerialCode ? (
                      <span className="rounded-md bg-primary/10 px-2 py-1 font-semibold text-primary">
                        صادر الجهة المحيلة: {route.routeSerialCode}
                      </span>
                    ) : null}
                    {route.incomingSerialCode ? (
                      <span className="rounded-md bg-emerald-500/10 px-2 py-1 font-semibold text-emerald-700 dark:text-emerald-300">
                        وارد الجهة المستقبلة: {route.incomingSerialCode}
                      </span>
                    ) : null}
                  </div>
                </div>
                {route.status === "sent" && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        decideRouteAsReceiver.isPending ||
                        receiveRoute.isPending
                      }
                      onClick={() => {
                        if (window.confirm("تأكيد استلام هذه الإحالة؟")) {
                          decideRouteAsReceiver.mutate({
                            routeId: route.id,
                            accepted: true,
                            reason: null,
                          });
                        }
                      }}
                    >
                      تأكيد الاستلام
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={
                        decideRouteAsReceiver.isPending ||
                        receiveRoute.isPending
                      }
                      onClick={() => {
                        const reason = window
                          .prompt("أدخل سبب رفض الاستلام (إلزامي):")
                          ?.trim();
                        if (!reason) {
                          toast.error("سبب رفض الاستلام مطلوب");
                          return;
                        }
                        decideRouteAsReceiver.mutate({
                          routeId: route.id,
                          accepted: false,
                          reason,
                        });
                      }}
                    >
                      رفض الاستلام
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
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
      <div className="mt-5 rounded-xl border bg-muted/20 p-2 print:hidden">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
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
            {exporting === "pdf" ? "جارٍ فتح الطباعة..." : "PDF مطابق للطباعة"}
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
                      `سيتم حذف البرقية ${getTelegramDisplayNumber(telegram.serialCode)} حذفًا نهائيًا مع مرفقاتها وسجل مسارها، ولن تبقى في قاعدة البيانات. لا يمكن التراجع عن هذا الإجراء. هل تريد المتابعة؟`
                    )
                  )
                    deleteTelegram.mutate({ id: telegram.id });
                }}
                disabled={deleteTelegram.isPending}
                variant="destructive"
                className="h-10 flex-1 rounded-lg sm:flex-none"
              >
                <Trash2 className="ml-2 h-4 w-4" />
                {deleteTelegram.isPending
                  ? "جارٍ الحذف النهائي..."
                  : "حذف نهائي"}
              </Button>
            </>
          )}
        </div>
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
      {routeableTargets.length > 0 &&
        ["approved", "in_progress", "forwarded"].includes(telegram.status) && (
          <div className="mt-4 rounded-xl border border-[#b49a55]/40 bg-[#fffaf0] p-3 dark:bg-[#2d281b] print:hidden">
            <p className="text-xs font-bold text-[#7a5c1e]">
              طلب إحالة عبر السلطة الأعلى
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <OrganizationTreePicker
                options={routingDirectory}
                value={routeTarget}
                onValueChange={setRouteTarget}
                placeholder="اختر الجهة المستلمة"
                ariaLabel="اختيار الجهة المستلمة للإحالة"
                className="h-10 text-xs"
              />
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
                {routeTelegram.isPending
                  ? "جارٍ إرسال طلب الموافقة..."
                  : "إرسال طلب الموافقة"}
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              تُعرض الجهات ضمن تسلسلها التنظيمي، ولا يمكن اختيار إلا الجهات
              المرتبطة والمسموح بالإحالة إليها. يُحفظ المسار كاملًا في سجل
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
  fullScreenOnMobile = false,
  wide = false,
  compact = false,
}: {
  title: string;
  subtitle?: string;
  close: () => void;
  children: React.ReactNode;
  fullScreenOnMobile?: boolean;
  wide?: boolean;
  compact?: boolean;
}) {
  return (
    <div className="telegram-print-modal app-modal-overlay overflow-x-hidden overflow-y-auto sm:overflow-hidden sm:p-6">
      <div dir="rtl" className="app-modal-shell p-3 sm:p-7">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {subtitle && (
              <p className="font-mono text-xs font-semibold text-muted-foreground">
                {subtitle}
              </p>
            )}
            <h2
              className={`${subtitle ? "mt-1" : ""} break-words text-xl font-bold`}
            >
              {title}
            </h2>
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
  organizationName,
  isOwner,
  activeOrganizationId,
  organizations,
  onWorkplaceChanged,
}: {
  settings?: {
    id: number;
    organizationId: string | null;
    departmentName: string;
    unitName?: string;
    unitChiefRank?: string;
    unitChiefName?: string;
    serialPrefix: string;
    incomingSerialPrefix: string;
    serialStart: number;
    incomingSerialStart: number;
    timezone?: string;
    dateFormat?: string;
    numberSystem?: NumberSystem;
    logoUrl: string | null;
  };
  organizationName?: string;
  isOwner: boolean;
  activeOrganizationId?: string;
  organizations: Array<{
    id: string;
    name: string;
    type: string;
    code: string;
    parentOrganizationId: string | null;
    isActive: boolean;
  }>;
  onWorkplaceChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedWorkplaceId, setSelectedWorkplaceId] = useState(
    activeOrganizationId ?? ""
  );
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
  const [incomingSerialPrefix, setIncomingSerialPrefix] = useState(
    settings?.incomingSerialPrefix ?? settings?.serialPrefix ?? "POL"
  );
  const [timezone, setTimezone] = useState("Asia/Riyadh");
  const [dateFormat, setDateFormat] = useState("dd/MM/yyyy HH:mm:ss");
  const [numberSystem, setNumberSystem] =
    useState<SupportedNumberSystem>("latin");
  const [logoUrl, setLogoUrl] = useState(settings?.logoUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const utils = trpc.useUtils();
  const selectWorkplace = trpc.organizations.selectWorkplace.useMutation({
    onSuccess: async result => {
      setSelectedWorkplaceId(result.organizationId);
      onWorkplaceChanged();
      await utils.invalidate();
      toast.success(`تم تغيير جهة العمل إلى ${result.organizationName}`);
    },
    onError: error => {
      setSelectedWorkplaceId(activeOrganizationId ?? "");
      toast.error(error.message || "تعذر تغيير جهة العمل");
    },
  });
  const update = trpc.settings.update.useMutation({
    onSuccess: async result => {
      setOpen(false);
      setDepartmentName(result.departmentName);
      setUnitName(result.unitName);
      setUnitChiefRank(result.unitChiefRank);
      setUnitChiefName(result.unitChiefName);
      setNumberSystem(normalizeNumberSystem(result.numberSystem));
      setLogoUrl(result?.logoUrl ?? null);
      await utils.settings.get.invalidate();
      toast.success("تم تحديث هوية القسم وستظهر في البرقيات الجديدة");
    },
    onError: error => toast.error(error.message || "تعذر تحديث إعدادات الجهة"),
  });
  const upload = trpc.settings.uploadLogo.useMutation();
  const isOrganizationSettingsReady =
    settings?.organizationId === (activeOrganizationId ?? null) &&
    selectedWorkplaceId === (activeOrganizationId ?? "");
  const isWorkplaceTransitioning =
    selectWorkplace.isPending || !isOrganizationSettingsReady;

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
    setIncomingSerialPrefix(
      settings?.incomingSerialPrefix ?? settings?.serialPrefix ?? "POL"
    );
    setTimezone(settings?.timezone ?? "Asia/Riyadh");
    setDateFormat(settings?.dateFormat ?? "dd/MM/yyyy HH:mm:ss");
    setNumberSystem(normalizeNumberSystem(settings?.numberSystem));
    setLogoUrl(settings?.logoUrl ?? null);
  }, [
    settings?.id,
    settings?.departmentName,
    settings?.unitName,
    settings?.unitChiefRank,
    settings?.unitChiefName,
    settings?.logoUrl,
    settings?.serialPrefix,
    settings?.incomingSerialPrefix,
    settings?.timezone,
    settings?.dateFormat,
    settings?.numberSystem,
  ]);
  useEffect(() => {
    setSelectedWorkplaceId(activeOrganizationId ?? "");
  }, [activeOrganizationId]);

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
      title="إعدادات الجهة"
      subtitle={`إعدادات الجهة: ${organizationName ?? "الجهة الحالية"}`}
      close={() => setOpen(false)}
    >
      <div className="space-y-5">
        {isOwner && (
          <div className="rounded-xl border border-[#b49a55]/40 bg-[#fffaf0] p-3 dark:bg-[#2d281b]">
            <div className="grid gap-1.5 text-xs font-bold">
              <span>جهة العمل الحالية للمالك</span>
              <OrganizationTreePicker
                options={organizations
                  .filter(organization => organization.isActive)
                  .map(organization => ({
                    ...organization,
                    isSelectable: true,
                  }))}
                value={selectedWorkplaceId || activeOrganizationId || ""}
                disabled={selectWorkplace.isPending}
                onValueChange={organizationId => {
                  setSelectedWorkplaceId(organizationId);
                  if (
                    organizationId &&
                    organizationId !== activeOrganizationId
                  ) {
                    selectWorkplace.mutate({ organizationId });
                  }
                }}
                placeholder="اختر جهة العمل"
                ariaLabel="جهة العمل الحالية للمالك"
                emptyMessage="لا توجد جهات عمل مفعّلة حاليًا."
              />
            </div>
            <p className="mt-2 text-[11px] font-normal text-muted-foreground">
              يحدد هذا الاختيار الجهة المستخدمة في إعدادات العمل والترقيم
              والبرقيات الجديدة، مع بقاء صلاحية المالك لإدارة جميع الجهات.
            </p>
          </div>
        )}
        <div className="rounded-xl border border-[#b49a55]/40 bg-[#fffaf0] p-3 text-xs dark:bg-[#2d281b]">
          <p className="font-bold text-[#7a5c1e]">نطاق هذه الإعدادات</p>
          <p className="mt-1 text-muted-foreground">
            سيتم تطبيق الشعار واسم الجهة ورئيسها والترقيم والتوقيت على حسابات
            <strong className="mx-1 text-foreground">
              {organizationName ?? "الجهة الحالية"}
            </strong>
            فقط، ولن تظهر هوية جهة أخرى في برقيات هذه الجهة.
          </p>
        </div>
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
                <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                  برقية رسمية
                </p>
                <p className="text-xs font-semibold text-muted-foreground">
                  {localizeDigits(unitChiefRank, numberSystem)}{" "}
                  {localizeDigits(unitChiefName, numberSystem)}
                </p>
                <h3 className="mt-1 text-lg font-bold">
                  {localizeDigits(
                    unitName || "اسم الوحدة التابعة",
                    numberSystem
                  )}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {localizeDigits(
                    departmentName || "اسم القسم أو المخفر",
                    numberSystem
                  )}
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
          رقم بادئة برقية صادرة
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
            إذا كانت البادئة أرقامًا فقط مثل 718، يبدأ تسلسل الصادر من الرقم
            نفسه؛ أما البادئة النصية فتُضاف دون تغيير العداد.
          </span>
        </label>
        <label className="grid gap-1.5 text-xs font-bold">
          رقم بادئة برقية واردة
          <Input
            value={incomingSerialPrefix}
            onChange={event =>
              setIncomingSerialPrefix(
                event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "")
              )
            }
            placeholder="مثال: IN أو RECEIVED"
            className="h-11 rounded-lg font-mono uppercase"
          />
          <span className="text-[11px] font-normal text-muted-foreground">
            تُضاف إلى رقم الوارد، وإذا كانت أرقامًا فقط تضبط بداية الوارد وحده
            دون تغيير تسلسل الصادر.
          </span>
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
                setNumberSystem(event.target.value as SupportedNumberSystem)
              }
              className="h-10 rounded-lg border bg-background px-3 text-sm font-normal"
            >
              <option value="latin">لاتينية: 0123456789</option>
              <option value="arabic">عربية: ٠١٢٣٤٥٦٧٨٩</option>
            </select>
            <span className="text-[10px] font-normal text-muted-foreground">
              تُحوّل الأرقام المكتوبة في نص البرقية ورأسها عند الحفظ إلى النمط
              المحدد.
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
            هذه الإعدادات خاصة بالجهة الحالية، ومتاحة للمالك أو مدير الجهة
            المخول، وتُحفظ في الخادم وتظهر في ترويسة برقيات هذه الجهة فقط عند
            العرض والطباعة.
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
            isWorkplaceTransitioning ||
            !settings ||
            departmentName.trim().length < 2 ||
            serialPrefix.length < 1 ||
            incomingSerialPrefix.length < 1
          }
          onClick={() =>
            settings &&
            update.mutate({
              organizationId: settings.organizationId,
              departmentName: localizeDigits(
                departmentName.trim(),
                numberSystem
              ),
              unitName: localizeDigits(unitName.trim(), numberSystem),
              unitChiefRank: localizeDigits(unitChiefRank.trim(), numberSystem),
              unitChiefName: localizeDigits(unitChiefName.trim(), numberSystem),
              serialPrefix,
              incomingSerialPrefix,
              serialStart: settings.serialStart,
              incomingSerialStart: settings.incomingSerialStart,
              timezone,
              dateFormat,
              numberSystem,
              logoUrl: logoUrl?.trim() || null,
            })
          }
          className="h-10 rounded-lg bg-[#10233f] text-white hover:bg-[#18375f]"
        >
          <Save className="ml-2 h-4 w-4" />
          {isWorkplaceTransitioning
            ? "جارٍ تحميل إعدادات الجهة..."
            : update.isPending
              ? "جارٍ الحفظ..."
              : "حفظ إعدادات الجهة"}
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
