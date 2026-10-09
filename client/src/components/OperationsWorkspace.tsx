import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  Building2,
  ChevronLeft,
  Clock3,
  FileSearch,
  MapPinned,
  Shield,
  Users,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { getTelegramDisplayNumber } from "@/lib/telegramDisplay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapView, type MapMarker } from "@/components/Map";

type WorkspaceTab = "locations" | "units" | "resources" | "archive";

const tabLabels: Record<WorkspaceTab, string> = {
  locations: "مواقع البلاغات",
  units: "الوحدات الميدانية",
  resources: "متابعة العمل",
  archive: "الأرشيف",
};

const tabDescriptions: Record<WorkspaceTab, string> = {
  locations: "عرض المواقع المسجلة في البرقيات وفتحها على الخريطة.",
  units: "عرض الجهات المتاحة وعدد البرقيات المفتوحة لديها.",
  resources: "ملخص توزيع البرقيات المفتوحة على الجهات.",
  archive: "البحث في البرقيات المغلقة المحفوظة للتدقيق.",
};

const LIVE_REFRESH_INTERVAL_MS = 15_000;

export default function OperationsWorkspace() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<WorkspaceTab>("locations");
  const [search, setSearch] = useState("");
  const allTelegrams = trpc.telegrams.list.useQuery(
    { page: 1, pageSize: 100 },
    {
      enabled: open,
      refetchInterval: LIVE_REFRESH_INTERVAL_MS,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
    }
  );
  const archivedTelegrams = trpc.telegrams.list.useQuery(
    { page: 1, pageSize: 100, status: "archived" },
    {
      enabled: open && tab === "archive",
      refetchInterval: LIVE_REFRESH_INTERVAL_MS,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
    }
  );
  const routingTargets = trpc.organizations.routingTargets.useQuery(undefined, {
    enabled: open && (tab === "units" || tab === "resources"),
  });
  const organizationContext = trpc.organizations.context.useQuery(undefined, {
    enabled: open,
  });

  useEffect(() => {
    const show = (event: Event) => {
      const requestedTab = (event as CustomEvent<{ tab?: WorkspaceTab }>).detail
        ?.tab;
      setTab(
        requestedTab && requestedTab in tabLabels ? requestedTab : "locations"
      );
      setOpen(true);
    };
    window.addEventListener("open-operations-workspace", show);
    return () => window.removeEventListener("open-operations-workspace", show);
  }, []);

  const close = () => {
    setOpen(false);
    setSearch("");
  };
  const rows = allTelegrams.data ?? [];
  const locations = useMemo(
    () =>
      rows.filter(row => row.gpsLatitude !== null && row.gpsLongitude !== null),
    [rows]
  );
  const markers: MapMarker[] = locations.map(row => ({
    id: String(row.id),
    position: { lat: Number(row.gpsLatitude), lng: Number(row.gpsLongitude) },
    title: `${getTelegramDisplayNumber(row.serialCode)} — ${row.subject}`,
  }));
  const filteredArchive = (archivedTelegrams.data ?? []).filter(row => {
    const needle = search.trim().toLowerCase();
    return (
      !needle ||
      `${getTelegramDisplayNumber(row.serialCode)} ${row.subject} ${row.recipient}`
        .toLowerCase()
        .includes(needle)
    );
  });
  const openRows = rows.filter(row => row.status !== "archived");
  const unitWorkload = (routingTargets.data ?? []).map(unit => ({
    ...unit,
    openCount: openRows.filter(row => row.currentOrganizationId === unit.id)
      .length,
  }));

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-5">
      <section
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="operations-workspace-title"
        className="flex h-[100dvh] max-h-[100dvh] w-full max-w-7xl flex-col overflow-hidden bg-background shadow-2xl sm:h-[90vh] sm:max-h-[95vh] sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b px-4 py-3 sm:gap-4 sm:px-7 sm:py-4">
          <div className="min-w-0">
            <h2
              id="operations-workspace-title"
              className="text-lg font-bold sm:text-xl"
            >
              متابعة العمل الميداني
            </h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground sm:text-sm">
              اختر قسمًا أدناه. هذه شاشة متابعة للبرقيات والمواقع المسجلة، وليست
              لتتبع الأشخاص.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={close}
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" />
          </Button>
        </header>
        <nav
          className="grid grid-cols-2 gap-2 border-b bg-muted/20 p-3 sm:flex sm:flex-wrap sm:gap-1 sm:px-4 sm:py-2"
          aria-label="وحدات التشغيل"
        >
          {(Object.keys(tabLabels) as WorkspaceTab[]).map(item => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              aria-current={tab === item ? "page" : undefined}
              className={`flex min-h-12 flex-col items-start justify-center gap-0.5 rounded-lg px-3 py-2 text-right transition sm:min-h-0 sm:flex-row sm:items-center sm:gap-2 sm:whitespace-nowrap sm:text-sm ${tab === item ? "bg-[#10233f] text-white" : "text-foreground hover:bg-background"}`}
            >
              <span className="text-xs font-bold sm:text-sm">
                {tabLabels[item]}
              </span>
              <span
                className={`text-[10px] leading-4 sm:hidden ${tab === item ? "text-white/75" : "text-muted-foreground"}`}
              >
                {item === "locations"
                  ? "الخريطة والسجل"
                  : item === "units"
                    ? "الجهات والإحالات"
                    : item === "resources"
                      ? "توزيع البرقيات"
                      : "البرقيات المغلقة"}
              </span>
            </button>
          ))}
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-7">
          <p className="mb-4 rounded-lg border bg-muted/20 px-3 py-2 text-xs leading-5 text-muted-foreground sm:text-sm">
            {tabDescriptions[tab]}
          </p>
          {tab === "locations" && (
            <LocationsPanel
              locations={locations}
              markers={markers}
              loading={allTelegrams.isLoading}
            />
          )}
          {tab === "units" && (
            <UnitsPanel
              units={unitWorkload}
              currentUnit={organizationContext.data?.organizationId}
              loading={routingTargets.isLoading}
            />
          )}
          {tab === "resources" && (
            <ResourcesPanel
              units={unitWorkload}
              openCount={openRows.length}
              locationsCount={locations.length}
            />
          )}
          {tab === "archive" && (
            <ArchivePanel
              rows={filteredArchive}
              search={search}
              setSearch={setSearch}
              loading={archivedTelegrams.isLoading}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function LocationsPanel({
  locations,
  markers,
  loading,
}: {
  locations: Array<any>;
  markers: MapMarker[];
  loading: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <SummaryCard
          icon={MapPinned}
          label="مواقع مسجلة"
          value={locations.length}
          detail="مضافة إلى البرقيات"
        />
        <SummaryCard
          icon={FileSearch}
          label="مواقع عاجلة"
          value={locations.filter(row => row.priority === "urgent").length}
          detail="تحتاج مراجعة تشغيلية"
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
        <div className="min-w-0 overflow-hidden rounded-2xl border bg-muted/20">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h3 className="font-bold">الخريطة التشغيلية</h3>
              <p className="text-xs text-muted-foreground">
                تعرض المواقع المضافة إلى البرقيات فقط.
              </p>
            </div>
            <MapPinned className="h-5 w-5 text-[#9b7c3d]" />
          </div>
          {loading ? (
            <div className="flex min-h-48 items-center justify-center p-6 text-center text-sm text-muted-foreground sm:min-h-64">
              جارٍ تحميل مواقع البرقيات...
            </div>
          ) : markers.length > 0 && import.meta.env.VITE_GOOGLE_MAPS_API_KEY ? (
            <MapView markers={markers} className="h-72 sm:h-[420px]" />
          ) : markers.length > 0 ? (
            <div className="flex min-h-48 items-center justify-center p-6 text-center text-sm leading-6 text-muted-foreground sm:min-h-64">
              الإحداثيات محفوظة. افتح أحد المواقع من «سجل المواقع» لعرضه على
              خرائط Google.
            </div>
          ) : (
            <div className="flex min-h-48 flex-col items-center justify-center gap-2 p-6 text-center sm:min-h-64">
              <MapPinned className="h-8 w-8 text-[#9b7c3d]" />
              <p className="font-semibold">لا توجد مواقع مسجلة بعد</p>
              <p className="max-w-md text-sm leading-6 text-muted-foreground">
                لا توجد إحداثيات مرتبطة بالبرقيات المعروضة حاليًا. عند توفر موقع
                مسجل سيظهر هنا وفي سجل المواقع. لا تُعرض حركة الأشخاص في هذه
                الخريطة.
              </p>
            </div>
          )}
        </div>
        <div className="rounded-2xl border">
          <div className="border-b px-4 py-3">
            <h3 className="font-bold">سجل المواقع</h3>
            <p className="text-xs text-muted-foreground">
              اضغط على الموقع لفتح الخريطة الخارجية.
            </p>
          </div>
          <div className="max-h-[420px] divide-y overflow-y-auto">
            {loading && (
              <p className="p-6 text-center text-sm text-muted-foreground">
                جارٍ تحميل المواقع...
              </p>
            )}
            {!loading && locations.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">
                لا توجد مواقع مسجلة.
              </p>
            )}
            {locations.map(row => (
              <a
                key={row.id}
                href={`https://www.google.com/maps/search/?api=1&query=${row.gpsLatitude},${row.gpsLongitude}`}
                target="_blank"
                rel="noreferrer"
                className="block p-3 transition hover:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {getTelegramDisplayNumber(row.serialCode)} — {row.subject}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.gpsLatitude}, {row.gpsLongitude}
                    </p>
                  </div>
                  <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function UnitsPanel({
  units,
  currentUnit,
  loading,
}: {
  units: Array<any>;
  currentUnit?: string;
  loading: boolean;
}) {
  const currentUnitName = units.find(unit => unit.id === currentUnit)?.name;
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border bg-[#10233f] p-5 text-white">
        <div className="flex items-center gap-2 text-[#d8c38e]">
          <Shield className="h-5 w-5" />
          <span className="text-sm font-bold">لوحة الوحدات الميدانية</span>
        </div>
        <p className="mt-2 text-sm text-slate-200">
          {currentUnitName
            ? `جهتك الحالية: ${currentUnitName}. `
            : "تعرض هذه الصفحة الجهات المتاحة للإحالة. "}
          الأعداد مبنية على البرقيات المفتوحة، ولا تتبع مواقع الأشخاص.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {loading && (
          <p className="text-sm text-muted-foreground">جارٍ تحميل الوحدات...</p>
        )}
        {!loading && units.length === 0 && (
          <div className="rounded-xl border bg-muted/20 p-5 text-sm leading-6">
            <p className="font-semibold">لا توجد جهات متاحة للإحالة بعد</p>
            <p className="mt-1 text-muted-foreground">
              أضف الجهات واربطها في إعدادات الهيكل التنظيمي لتظهر هنا.
            </p>
          </div>
        )}
        {units.map(unit => (
          <div key={unit.id} className="rounded-xl border p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold">{unit.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {unit.type} · {unit.code}
                </p>
              </div>
              <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-bold text-emerald-700">
                متاحة للإحالة
              </span>
            </div>
            <div className="mt-4 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">برقيات مرتبطة</span>
              <strong>{unit.openCount}</strong>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResourcesPanel({
  units,
  openCount,
  locationsCount,
}: {
  units: Array<any>;
  openCount: number;
  locationsCount: number;
}) {
  const busiest = [...units]
    .sort((a, b) => b.openCount - a.openCount)
    .slice(0, 5);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        <SummaryCard
          icon={Users}
          label="الجهات"
          value={units.length}
          detail="جاهزة لاستقبال الإحالات"
        />
        <SummaryCard
          icon={Clock3}
          label="البرقيات المفتوحة"
          value={openCount}
          detail="برقيات غير مؤرشفة"
        />
        <SummaryCard
          icon={MapPinned}
          label="المواقع المسجلة"
          value={locationsCount}
          detail="مواقع مسجلة"
        />
      </div>
      <section className="rounded-2xl border">
        <div className="border-b px-5 py-4">
          <h3 className="font-bold">توزيع البرقيات المفتوحة</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            يوضح عدد البرقيات غير المؤرشفة في كل جهة لمساعدة المسؤول على متابعة
            العمل؛ ولا ينشئ إحالات تلقائيًا.
          </p>
        </div>
        <div className="divide-y">
          {busiest.map(unit => (
            <div key={unit.id} className="flex items-center gap-4 px-5 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-700">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-3">
                  <p className="truncate text-sm font-semibold">{unit.name}</p>
                  <span className="text-sm font-bold">{unit.openCount}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-[#9b7c3d]"
                    style={{ width: `${Math.min(100, unit.openCount * 12)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
          {!units.length && (
            <p className="p-8 text-center text-sm text-muted-foreground">
              ستظهر هنا الجهات وأعداد البرقيات بعد إضافتها إلى الهيكل التنظيمي.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function ArchivePanel({
  rows,
  search,
  setSearch,
  loading,
}: {
  rows: Array<any>;
  search: string;
  setSearch: (value: string) => void;
  loading: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border bg-muted/20 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-[#9b7c3d]" />
            <h3 className="font-bold">البرقيات المغلقة</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            السجل مغلق تشغيليًا ومحفوظ للتدقيق، ولا يعني الحذف.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="بحث في السجلات المغلقة"
            className="h-10"
          />
        </div>
      </div>
      <div className="rounded-2xl border">
        <div className="hidden grid-cols-[110px_minmax(0,1fr)_130px_100px] gap-3 border-b bg-muted/30 px-4 py-3 text-xs font-bold text-muted-foreground md:grid">
          <span>الرقم</span>
          <span>الموضوع</span>
          <span>المستلم</span>
          <span>التاريخ</span>
        </div>
        <div className="divide-y">
          {loading && (
            <p className="p-8 text-center text-sm text-muted-foreground">
              جارٍ تحميل الأرشيف...
            </p>
          )}
          {!loading && rows.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">
              لا توجد سجلات مطابقة.
            </p>
          )}
          {rows.map(row => (
            <div
              key={row.id}
              className="hidden grid-cols-[110px_minmax(0,1fr)_130px_100px] items-center gap-3 px-4 py-3 text-sm md:grid"
            >
              <span className="font-mono text-xs font-bold text-[#9b7c3d]">
                {getTelegramDisplayNumber(row.serialCode)}
              </span>
              <span className="truncate font-semibold">{row.subject}</span>
              <span className="truncate text-xs text-muted-foreground">
                {row.recipient}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(row.closedAt ?? row.updatedAt).toLocaleDateString(
                  "ar-SY"
                )}
              </span>
            </div>
          ))}
          {rows.map(row => (
            <article
              key={`${row.id}-mobile`}
              className="space-y-1.5 p-3 md:hidden"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 break-words text-sm font-semibold">
                  {row.subject}
                </p>
                <span className="shrink-0 font-mono text-xs font-bold text-[#9b7c3d]">
                  {getTelegramDisplayNumber(row.serialCode)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                المستلم: {row.recipient}
              </p>
              <p className="text-xs text-muted-foreground">
                تاريخ الإغلاق:{" "}
                {new Date(row.closedAt ?? row.updatedAt).toLocaleDateString(
                  "ar-SY"
                )}
              </p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof MapPinned;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">
          {label}
        </span>
        <Icon className="h-4 w-4 text-[#9b7c3d]" />
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}
