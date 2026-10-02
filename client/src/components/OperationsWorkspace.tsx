import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  Building2,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Compass,
  FileSearch,
  MapPinned,
  RefreshCw,
  Shield,
  Users,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapView, type MapMarker } from "@/components/Map";

type WorkspaceTab = "locations" | "units" | "resources" | "archive";

const tabLabels: Record<WorkspaceTab, string> = {
  locations: "خريطة البلاغات والمواقع",
  units: "الوحدات الميدانية",
  resources: "إدارة الموارد",
  archive: "الأرشيف والسجلات المغلقة",
};

export default function OperationsWorkspace() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<WorkspaceTab>("locations");
  const [search, setSearch] = useState("");
  const allTelegrams = trpc.telegrams.list.useQuery(
    { page: 1, pageSize: 100 },
    { enabled: open, refetchOnWindowFocus: false }
  );
  const archivedTelegrams = trpc.telegrams.list.useQuery(
    { page: 1, pageSize: 100, status: "archived" },
    { enabled: open && tab === "archive", refetchOnWindowFocus: false }
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
    title: `${row.serialCode} — ${row.subject}`,
  }));
  const filteredArchive = (archivedTelegrams.data ?? []).filter(row => {
    const needle = search.trim().toLowerCase();
    return (
      !needle ||
      `${row.serialCode} ${row.subject} ${row.recipient}`
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
        className="flex max-h-[95vh] w-full max-w-7xl flex-col overflow-hidden rounded-t-2xl bg-background shadow-2xl sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b px-5 py-4 sm:px-7">
          <div>
            <p className="text-xs font-bold tracking-wide text-[#9b7c3d]">
              OPERATIONS CONTROL ROOM
            </p>
            <h2
              id="operations-workspace-title"
              className="mt-1 text-xl font-bold"
            >
              مركز التشغيل الميداني والسجلات
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              بيانات تشغيلية موحّدة للمواقع والجهات والموارد والأرشيف، دون تتبع
              حي للأفراد.
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
          className="flex gap-1 overflow-x-auto border-b bg-muted/20 px-4 py-2"
          aria-label="وحدات التشغيل"
        >
          {(Object.keys(tabLabels) as WorkspaceTab[]).map(item => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition ${tab === item ? "bg-[#10233f] text-white" : "text-muted-foreground hover:bg-background hover:text-foreground"}`}
            >
              {tabLabels[item]}
            </button>
          ))}
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
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
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          icon={MapPinned}
          label="مواقع مسجلة"
          value={locations.length}
          detail="إحداثيات موثقة في البرقيات"
        />
        <SummaryCard
          icon={FileSearch}
          label="مواقع عاجلة"
          value={locations.filter(row => row.priority === "urgent").length}
          detail="تحتاج مراجعة تشغيلية"
        />
        <SummaryCard
          icon={Compass}
          label="إحداثيات محفوظة"
          value={locations.length}
          detail="مرتبطة بسجل البرقية"
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
        <div className="overflow-hidden rounded-2xl border bg-muted/20">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h3 className="font-bold">الخريطة التشغيلية</h3>
              <p className="text-xs text-muted-foreground">
                تعرض المواقع المسجلة فقط، ولا تعرض حركة الأفراد.
              </p>
            </div>
            <MapPinned className="h-5 w-5 text-[#9b7c3d]" />
          </div>
          {markers.length > 0 && import.meta.env.VITE_GOOGLE_MAPS_API_KEY ? (
            <MapView markers={markers} className="h-[420px]" />
          ) : markers.length > 0 ? (
            <div className="flex h-[420px] items-center justify-center p-8 text-center text-sm text-muted-foreground">
              تم حفظ الإحداثيات، لكن مفتاح الخريطة غير مفعّل في بيئة التشغيل.
              استخدم سجل المواقع لفتحها على الخريطة الخارجية، أو فعّل{" "}
              <code dir="ltr">VITE_GOOGLE_MAPS_API_KEY</code>.
            </div>
          ) : (
            <div className="flex h-[420px] items-center justify-center p-8 text-center text-sm text-muted-foreground">
              لا توجد إحداثيات مسجلة بعد. أضف موقع البلاغ من نموذج البرقية لتظهر
              هنا.
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
                      {row.serialCode} — {row.subject}
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
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border bg-[#10233f] p-5 text-white">
        <div className="flex items-center gap-2 text-[#d8c38e]">
          <Shield className="h-5 w-5" />
          <span className="text-sm font-bold">لوحة الوحدات الميدانية</span>
        </div>
        <p className="mt-2 text-sm text-slate-200">
          الوحدة الحالية: {currentUnit ?? "غير محددة"}. الحالات المعروضة تعتمد
          على الإحالات والمهام المسجلة، وليس على تتبع GPS.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {loading && (
          <p className="text-sm text-muted-foreground">جارٍ تحميل الوحدات...</p>
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
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          icon={Users}
          label="جهات قابلة للإحالة"
          value={units.length}
          detail="من الهيكل التنظيمي الحالي"
        />
        <SummaryCard
          icon={Clock3}
          label="العمل المفتوح"
          value={openCount}
          detail="برقيات غير مؤرشفة"
        />
        <SummaryCard
          icon={MapPinned}
          label="نقاط تشغيلية"
          value={locationsCount}
          detail="مواقع مسجلة"
        />
      </div>
      <section className="rounded-2xl border">
        <div className="border-b px-5 py-4">
          <h3 className="font-bold">توزيع الحمل التشغيلي</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            مؤشر مساعدة للمدير والموزع، ولا يستبدل قرار الإحالة البشري.
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
          {busiest.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">
              لا توجد جهات مرتبطة بعد.
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
            <h3 className="font-bold">الأرشيف والسجلات المغلقة</h3>
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
        <div className="grid grid-cols-[130px_minmax(0,1fr)_140px_120px] gap-3 border-b bg-muted/30 px-4 py-3 text-xs font-bold text-muted-foreground">
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
              className="grid grid-cols-[130px_minmax(0,1fr)_140px_120px] items-center gap-3 px-4 py-3 text-sm"
            >
              <span className="font-mono text-xs font-bold text-[#9b7c3d]">
                {row.serialCode}
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
