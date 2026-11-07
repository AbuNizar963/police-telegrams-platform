import { useState } from "react";
import { useLocation } from "wouter";
import {
  Activity,
  AlarmClock,
  ArrowUpLeft,
  ArrowUpRight,
  BellRing,
  Building2,
  ChevronLeft,
  Clock3,
  Database,
  FileBarChart2,
  History,
  Landmark,
  TrendingUp,
  RefreshCw,
  ShieldCheck,
  UserCog,
  Users,
  Zap,
  CheckCircle2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  auditActionLabel,
  auditEntitySummary,
} from "@/features/reports/auditPresentation";
import { trpc } from "@/lib/trpc";

const numberFormatter = new Intl.NumberFormat("ar-SY");
const chartColors = ["#10233f", "#d8c38e", "#2c6c86", "#4f927f", "#9a6476"];
const categoryLabels: Record<string, string> = {
  telegram: "البرقيات",
  user: "الحسابات",
  organization: "الجهات",
  platform: "المنصة والإعدادات",
  other: "عمليات أخرى",
};

function formatCount(value: unknown): string {
  const numeric = Number(value ?? 0);
  return numberFormatter.format(Number.isFinite(numeric) ? numeric : 0);
}

function formatDate(value: string, withTime = false): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "وقت غير متاح";
  return new Intl.DateTimeFormat("ar-SY", {
    year: "numeric",
    month: withTime ? "2-digit" : "short",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(date);
}

function formatDayTick(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("ar-SY", {
    month: "short",
    day: "numeric",
  }).format(new Date(year, month - 1, day, 12));
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  detail: string;
  tone: "blue" | "gold" | "green" | "rose";
}) {
  const tones = {
    blue: "bg-[#193247] text-[#6bc7ff]",
    gold: "bg-[#44391f] text-[#e7c45d]",
    green: "bg-[#173b31] text-[#69dfb0]",
    rose: "bg-[#452936] text-[#ff91ad]",
  };
  return (
    <Card className="group relative overflow-hidden border-[#2a3444] bg-[#151b26] shadow-[0_18px_48px_rgba(0,0,0,0.22)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-[#d8c38e] to-transparent opacity-70" />
      <CardContent className="flex min-h-[142px] items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">{label}</p>
          <p className="mt-4 text-[2rem] font-bold tracking-tight text-foreground">
            {formatCount(value)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
        </div>
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tones[tone]}`}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </CardContent>
    </Card>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-[#202a39] text-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-bold text-foreground">{title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

function Notice({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <section dir="rtl" className="mx-auto w-full max-w-[1600px]">
      <Card className="mx-auto max-w-2xl border-[#2a3444]">
        <CardContent className="flex items-start gap-3 p-6 sm:p-8">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#9a7d31]" />
          <div className="space-y-2">
            <h1 className="font-bold">{title}</h1>
            <p className="text-sm leading-6 text-muted-foreground">{message}</p>
            {action}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <section dir="rtl" className="mx-auto w-full max-w-[1600px] space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-36 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-12">
        <Skeleton className="h-80 rounded-2xl xl:col-span-8" />
        <Skeleton className="h-80 rounded-2xl xl:col-span-4" />
      </div>
    </section>
  );
}

export default function OwnerDashboardPage() {
  const [, setLocation] = useLocation();
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const context = trpc.organizations.context.useQuery(undefined, {
    staleTime: 30_000,
  });
  const summaryQuery = trpc.ownerDashboard.summary.useQuery(
    { days },
    {
      enabled: context.data?.isOwner === true,
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
    }
  );
  const notificationsQuery = trpc.notifications.inbox.useQuery(undefined, {
    enabled: context.data?.isOwner === true,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
  const markNotificationRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => void notificationsQuery.refetch(),
  });

  if (context.isLoading || (summaryQuery.isLoading && !summaryQuery.data))
    return <DashboardSkeleton />;
  if (context.error)
    return (
      <Notice
        title="تعذر التحقق من صلاحية الحساب"
        message={context.error.message}
        action={
          <Button variant="outline" onClick={() => void context.refetch()}>
            إعادة المحاولة
          </Button>
        }
      />
    );
  if (context.data?.isOwner !== true)
    return (
      <Notice
        title="هذه اللوحة مخصصة لمالك النظام"
        message="لا تتوفر بيانات لوحة القيادة الشاملة لهذا الحساب."
        action={
          <Button variant="outline" onClick={() => setLocation("/")}>
            العودة إلى لوحة المتابعة
          </Button>
        }
      />
    );
  if (summaryQuery.error && !summaryQuery.data)
    return (
      <Notice
        title="تعذر تحميل بيانات لوحة القيادة"
        message={summaryQuery.error.message}
        action={
          <Button variant="outline" onClick={() => void summaryQuery.refetch()}>
            إعادة المحاولة
          </Button>
        }
      />
    );
  const summary = summaryQuery.data;
  if (!summary) return <DashboardSkeleton />;

  const categories = summary.operationsByCategory.map(item => ({
    ...item,
    label: categoryLabels[item.category] ?? "عمليات أخرى",
  }));
  const periodLabel = `آخر ${formatCount(days)} ${days === 7 ? "أيام" : "يومًا"}`;

  return (
    <section
      dir="rtl"
      className="owner-dashboard-shell mx-auto w-full max-w-[1600px] space-y-5 sm:space-y-6"
    >
      <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge className="border-0 bg-[#10233f] px-3 py-1 text-white hover:bg-[#10233f]">
              <ShieldCheck className="ml-1.5 h-3.5 w-3.5" />
              مالك النظام
            </Badge>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#173b31] px-3 py-1 text-xs font-semibold text-[#69dfb0]">
              <span className="h-2 w-2 rounded-full bg-[#35a56d]" />
              النظام يعمل بشكل طبيعي
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            مركز قيادة المنصة
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            صورة تشغيلية موحدة تساعدك على متابعة الجهات، الحسابات، وسجل
            الإجراءات من مكان واحد.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
            الفترة الزمنية
            <select
              aria-label="الفترة الزمنية للوحة القيادة"
              value={days}
              onChange={event =>
                setDays(Number(event.target.value) as 7 | 30 | 90)
              }
              className="h-10 min-w-36 rounded-xl border border-[#2d3849] bg-[#151b26] px-3 text-sm font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[#d8c38e]"
            >
              <option value={7}>آخر 7 أيام</option>
              <option value={30}>آخر 30 يومًا</option>
              <option value={90}>آخر 90 يومًا</option>
            </select>
          </label>
          <Button
            type="button"
            variant="outline"
            onClick={() => void summaryQuery.refetch()}
            disabled={summaryQuery.isFetching}
            className="h-10 rounded-xl border-[#2d3849] bg-[#151b26]"
          >
            <RefreshCw
              className={`ml-2 h-4 w-4 ${summaryQuery.isFetching ? "animate-spin" : ""}`}
            />
            تحديث
          </Button>
          <Button
            type="button"
            onClick={() => setLocation("/audit-log")}
            className="h-10 rounded-xl bg-[#d8c38e] text-[#111827] hover:bg-[#ead69a]"
          >
            <History className="ml-2 h-4 w-4" />
            سجل الإجراءات
            <ArrowUpLeft className="mr-2 h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="relative overflow-hidden rounded-[1.75rem] bg-[#10233f] p-5 text-white shadow-[0_18px_50px_rgba(16,35,63,0.16)] sm:p-7">
        <div className="pointer-events-none absolute -left-12 -top-24 h-72 w-72 rounded-full border border-[#d8c38e]/20" />
        <div className="pointer-events-none absolute -left-4 -top-12 h-48 w-48 rounded-full border border-white/10" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[#d8c38e]">
              <Zap className="h-4 w-4" />
              نظرة المنصة · {periodLabel}
            </div>
            <p className="text-xl font-bold sm:text-2xl">
              كل الجهات ضمن صورة تشغيلية واحدة
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#c5cfdd]">
              تجمع اللوحة النشاط الموثق، وتفصل بين حجم العمل والحالة الحالية
              للجهات والحسابات، دون عرض محتوى البرقيات الحساسة.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-[#e1e8f2]">
            <Database className="h-4 w-4 text-[#d8c38e]" />
            آخر مزامنة: {formatDate(summary.generatedAt, true)}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Activity}
          label="إجمالي العمليات"
          value={summary.totalOperations}
          detail={`ضمن ${periodLabel}`}
          tone="blue"
        />
        <MetricCard
          icon={ShieldCheck}
          label="العمليات الحساسة"
          value={summary.sensitiveOperations}
          detail="إجراءات حذف أو تعطيل أو دائمة"
          tone="rose"
        />
        <MetricCard
          icon={Building2}
          label="الجهات النشطة"
          value={summary.activeOrganizations}
          detail="حالة الجهات الحالية"
          tone="gold"
        />
        <MetricCard
          icon={Users}
          label="الحسابات النشطة"
          value={summary.activeUsers}
          detail="حسابات النظام المفعّلة"
          tone="green"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="overflow-hidden border-[#2a3444] bg-[#151b26] shadow-sm xl:col-span-8">
          <CardContent className="p-5">
            <SectionTitle
              icon={Activity}
              title="وتيرة العمليات اليومية"
              subtitle={`عدد سجلات التدقيق خلال ${periodLabel}`}
              action={
                <span className="rounded-xl bg-[#193247] p-2 text-[#6bc7ff]">
                  <BellRing className="h-4 w-4" />
                </span>
              }
            />
            {summary.operationsByDay.some(point => point.count > 0) ? (
              <div className="h-64 min-w-0 sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={summary.operationsByDay}
                    margin={{ top: 8, right: 8, left: -18, bottom: 2 }}
                  >
                    <defs>
                      <linearGradient
                        id="owner-dashboard-activity"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#24506a"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#24506a"
                          stopOpacity={0.02}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      className="stroke-[#e8edf1]"
                    />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDayTick}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11 }}
                      minTickGap={20}
                    />
                    <YAxis
                      orientation="right"
                      allowDecimals={false}
                      tickFormatter={formatCount}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11 }}
                      width={40}
                    />
                    <Tooltip
                      formatter={value => [formatCount(value), "عملية"]}
                      labelFormatter={label => formatDayTick(String(label))}
                      contentStyle={{
                        direction: "rtl",
                        borderRadius: 12,
                        borderColor: "var(--border)",
                        background: "var(--popover)",
                        color: "var(--popover-foreground)",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      name="العمليات"
                      stroke="#24506a"
                      strokeWidth={2.5}
                      fill="url(#owner-dashboard-activity)"
                      activeDot={{ r: 4, strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChart message="لا توجد عمليات مسجلة في هذه الفترة." />
            )}
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-[#2a3444] bg-[#151b26] shadow-sm xl:col-span-4">
          <CardContent className="p-5">
            <SectionTitle
              icon={History}
              title="توزيع العمليات"
              subtitle="حسب مجال الإجراء"
            />
            {categories.length > 0 ? (
              <div className="h-64 min-w-0 sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categories}
                      dataKey="count"
                      nameKey="label"
                      innerRadius={55}
                      outerRadius={84}
                      paddingAngle={3}
                      stroke="none"
                    >
                      {categories.map((item, index) => (
                        <Cell
                          key={item.category}
                          fill={chartColors[index % chartColors.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={value => [formatCount(value), "عملية"]}
                      contentStyle={{
                        direction: "rtl",
                        borderRadius: 12,
                        borderColor: "var(--border)",
                        background: "var(--popover)",
                        color: "var(--popover-foreground)",
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      iconType="circle"
                      formatter={value => (
                        <span className="text-xs text-muted-foreground">
                          {value}
                        </span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChart message="سيظهر التوزيع عند تسجيل عمليات جديدة." />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="overflow-hidden border-[#2a3444] bg-[#151b26] shadow-sm xl:col-span-5">
          <CardContent className="p-5">
            <SectionTitle
              icon={Landmark}
              title="الجهات الأعلى نشاطًا"
              subtitle="بحسب عدد العمليات في الفترة المحددة"
              action={
                <span className="rounded-xl bg-[#44391f] p-2 text-[#e7c45d]">
                  <Building2 className="h-4 w-4" />
                </span>
              }
            />
            {summary.topOrganizations.length > 0 ? (
              <div className="h-72 min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={summary.topOrganizations}
                    layout="vertical"
                    margin={{ top: 4, right: 4, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      className="stroke-[#e8edf1]"
                    />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tickFormatter={formatCount}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="organizationName"
                      orientation="right"
                      width={110}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      formatter={value => [formatCount(value), "عملية"]}
                      contentStyle={{
                        direction: "rtl",
                        borderRadius: 12,
                        borderColor: "var(--border)",
                        background: "var(--popover)",
                        color: "var(--popover-foreground)",
                      }}
                    />
                    <Bar
                      dataKey="count"
                      name="العمليات"
                      fill="#d8c38e"
                      radius={[5, 5, 5, 5]}
                      maxBarSize={22}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChart message="لا توجد عمليات مرتبطة بجهة خلال هذه الفترة." />
            )}
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-[#2a3444] bg-[#151b26] shadow-sm xl:col-span-7">
          <CardContent className="p-5">
            <SectionTitle
              icon={Clock3}
              title="أحدث العمليات"
              subtitle="لقطة مختصرة من سجل التدقيق الموحّد"
              action={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setLocation("/audit-log")}
                  className="text-[#6bc7ff]"
                >
                  عرض الكل
                  <ChevronLeft className="mr-1 h-4 w-4" />
                </Button>
              }
            />
            {summary.recentOperations.length > 0 ? (
              <ul className="divide-y divide-[#edf0f3]">
                {summary.recentOperations.map(operation => (
                  <li
                    key={operation.id}
                    className="flex gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#202a39] text-foreground">
                      <UserCog className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {auditActionLabel(operation.action)}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {operation.actorName} <span aria-hidden="true">·</span>{" "}
                        {operation.organizationName ?? "النظام"}{" "}
                        <span aria-hidden="true">·</span>{" "}
                        {auditEntitySummary(
                          operation.entityType,
                          operation.entityId
                        )}
                      </p>
                    </div>
                    <time
                      className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground"
                      dateTime={operation.createdAt}
                    >
                      <Clock3 className="h-3.5 w-3.5" />
                      {formatDate(operation.createdAt, true)}
                    </time>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyChart message="لا توجد عمليات مسجلة في هذه الفترة." />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <NotificationPanel
          data={notificationsQuery.data}
          loading={notificationsQuery.isLoading}
          onRead={id => markNotificationRead.mutate({ id })}
        />
        <PerformanceReport summary={summary} />
      </div>

      <p className="flex items-start gap-2 rounded-2xl border border-border bg-muted px-4 py-3 text-xs leading-5 text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#6bc7ff]" />
        المؤشرات مبنية على سجلات الإجراءات الموثقة؛ لا تعرض هذه الصفحة نصوص
        البرقيات أو بيانات الشبكة أو تفاصيل المرفقات.
      </p>
    </section>
  );
}

type NotificationItem = {
  id: number;
  title: string;
  body: string;
  type: string;
  createdAt: Date | string;
};
function NotificationPanel({
  data,
  loading,
  onRead,
}: {
  data?: { items?: NotificationItem[]; unreadCount?: number };
  loading: boolean;
  onRead: (id: number) => void;
}) {
  const items = (data?.items ?? []).slice(0, 4);
  return (
    <Card className="overflow-hidden border-[#2a3444] bg-[#151b26] shadow-sm xl:col-span-5">
      <CardContent className="p-5">
        <SectionTitle
          icon={AlarmClock}
          title="التنبيهات الفورية"
          subtitle="تتحدث تلقائيًا كل 15 ثانية"
          action={
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#452936] px-2.5 py-1 text-[11px] font-bold text-[#ff91ad]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#d6516d]" />
              {formatCount(data?.unreadCount ?? 0)} جديدة
            </span>
          }
        />
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : items.length ? (
          <ul className="space-y-2">
            {items.map(item => (
              <li
                key={item.id}
                className="flex items-start gap-3 rounded-xl border border-border bg-card p-3"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#44391f] text-[#e7c45d]">
                  <BellRing className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-foreground">
                    {item.title}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted-foreground">
                    {item.body}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="تحديد التنبيه كمقروء"
                  onClick={() => onRead(item.id)}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-[#173b31] hover:text-[#69dfb0]"
                >
                  <CheckCircle2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyChart message="لا توجد تنبيهات جديدة حاليًا." />
        )}
      </CardContent>
    </Card>
  );
}

function PerformanceReport({ summary }: { summary: any }) {
  const top = summary.topOrganizations ?? [];
  const total = Number(summary.totalOperations ?? 0);
  const sensitive = Number(summary.sensitiveOperations ?? 0);
  const average = summary.operationsByDay?.length
    ? Math.round(total / summary.operationsByDay.length)
    : 0;
  const rows = [
    {
      label: "معدل العمليات اليومي",
      value: average,
      detail: "متوسط الفترة المحددة",
      tone: "#24506a",
    },
    {
      label: "مؤشر العمليات الحساسة",
      value: total ? Math.round((sensitive / total) * 100) : 0,
      detail: "نسبة من إجمالي النشاط",
      tone: "#9a4458",
      suffix: "%",
    },
    {
      label: "الجهة الأعلى نشاطًا",
      value: top[0]?.count ?? 0,
      detail: top[0]?.organizationName ?? "لا توجد بيانات",
      tone: "#8b6d22",
    },
  ];
  return (
    <Card className="overflow-hidden border-[#2a3444] bg-[#151b26] shadow-sm xl:col-span-7">
      <CardContent className="p-5">
        <SectionTitle
          icon={FileBarChart2}
          title="تقرير الأداء التفصيلي"
          subtitle="قراءة تنفيذية سريعة لمؤشرات الكفاءة"
          action={
            <span className="rounded-xl bg-[#193247] p-2 text-[#6bc7ff]">
              <TrendingUp className="h-4 w-4" />
            </span>
          }
        />
        <div className="grid gap-3 sm:grid-cols-3">
          {rows.map(row => (
            <div
              key={row.label}
              className="rounded-2xl border border-border bg-card p-4"
            >
              <div className="mb-4 h-1.5 rounded-full bg-[#e8edf1]">
                <div
                  className="h-1.5 rounded-full"
                  style={{
                    width: `${row.suffix ? Math.min(100, row.value) : Math.min(100, row.value ? 76 : 8)}%`,
                    background: row.tone,
                  }}
                />
              </div>
              <p className="text-[11px] font-bold leading-5 text-muted-foreground">
                {row.label}
              </p>
              <p className="mt-2 truncate text-2xl font-bold text-foreground">
                {formatCount(row.value)}
                {row.suffix ?? ""}
              </p>
              <p className="mt-1 truncate text-[10px] text-muted-foreground">
                {row.detail}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#44391f] px-3 py-2 text-[11px] font-semibold text-[#725b20]">
          <FileBarChart2 className="h-4 w-4" />
          يتم احتساب التقرير من سجلات التدقيق والعمليات الموثقة فقط.
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#2d3849] bg-muted px-5 text-center sm:h-72">
      <Activity className="h-7 w-7 text-[#9aa6b5]" />
      <p className="text-sm font-semibold text-foreground">
        لا توجد بيانات كافية للرسم
      </p>
      <p className="max-w-sm text-xs leading-5 text-muted-foreground">
        {message}
      </p>
    </div>
  );
}
