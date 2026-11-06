import { useState } from "react";
import { useLocation } from "wouter";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Building2,
  Clock3,
  History,
  RefreshCw,
  ShieldCheck,
  Users,
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
const chartColors = ["#2c6c86", "#b49a55", "#4f927f", "#9a6476", "#8b9caa"];
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
    blue: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    gold: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    rose: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  };

  return (
    <Card className="relative overflow-hidden border-border/70 shadow-sm">
      <CardContent className="flex min-h-32 items-start justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-3 text-3xl font-bold tabular-nums tracking-tight">
            {formatCount(value)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
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
    <Card className="mx-auto max-w-2xl border-border/70">
      <CardContent className="flex items-start gap-3 p-6 sm:p-8">
        <AlertTriangle
          className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
          aria-hidden="true"
        />
        <div className="space-y-2">
          <h1 className="font-bold">{title}</h1>
          <p className="text-sm leading-6 text-muted-foreground">{message}</p>
          {action}
        </div>
      </CardContent>
    </Card>
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
          <Skeleton key={index} className="h-32 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-12">
        <Skeleton className="h-80 rounded-2xl xl:col-span-8" />
        <Skeleton className="h-80 rounded-2xl xl:col-span-4" />
      </div>
      <Skeleton className="h-96 rounded-2xl" />
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

  if (context.isLoading) return <DashboardSkeleton />;
  if (context.error) {
    return (
      <section dir="rtl" className="mx-auto w-full max-w-[1600px]">
        <Notice
          title="تعذر التحقق من صلاحية الحساب"
          message={context.error.message}
          action={
            <Button
              type="button"
              variant="outline"
              onClick={() => void context.refetch()}
            >
              إعادة المحاولة
            </Button>
          }
        />
      </section>
    );
  }
  if (context.data?.isOwner !== true) {
    return (
      <section dir="rtl" className="mx-auto w-full max-w-[1600px]">
        <Notice
          title="هذه اللوحة مخصصة لمالك النظام"
          message="لا تتوفر بيانات لوحة القيادة الشاملة لهذا الحساب."
          action={
            <Button
              type="button"
              variant="outline"
              onClick={() => setLocation("/")}
            >
              العودة إلى لوحة المتابعة
            </Button>
          }
        />
      </section>
    );
  }
  if (summaryQuery.isLoading && !summaryQuery.data)
    return <DashboardSkeleton />;
  if (summaryQuery.error && !summaryQuery.data) {
    return (
      <section dir="rtl" className="mx-auto w-full max-w-[1600px]">
        <Notice
          title="تعذر تحميل بيانات لوحة القيادة"
          message={summaryQuery.error.message}
          action={
            <Button
              type="button"
              variant="outline"
              onClick={() => void summaryQuery.refetch()}
            >
              إعادة المحاولة
            </Button>
          }
        />
      </section>
    );
  }

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
      className="mx-auto w-full max-w-[1600px] space-y-5 sm:space-y-6"
    >
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge className="border-0 bg-[#10233f] text-white hover:bg-[#10233f]">
              <ShieldCheck className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
              مالك النظام
            </Badge>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              قراءة شاملة لجميع الجهات
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            لوحة قيادة المنصة
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            مؤشرات تشغيلية موحدة وسجل واضح للعمليات المسجلة على مستوى النظام.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
            الفترة الزمنية
            <select
              aria-label="الفترة الزمنية للوحة القيادة"
              value={days}
              onChange={event =>
                setDays(Number(event.target.value) as 7 | 30 | 90)
              }
              className="h-10 min-w-40 rounded-xl border border-input bg-background px-3 text-sm font-medium text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            className="h-10 rounded-xl"
          >
            <RefreshCw
              className={`ml-2 h-4 w-4 ${summaryQuery.isFetching ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            تحديث
          </Button>
          <Button
            type="button"
            onClick={() => setLocation("/audit-log")}
            className="h-10 rounded-xl bg-[#10233f] text-white hover:bg-[#18375f]"
          >
            <History className="ml-2 h-4 w-4" aria-hidden="true" />
            سجل الإجراءات الكامل
            <ArrowUpRight className="mr-2 h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </header>

      <div className="relative overflow-hidden rounded-3xl border border-[#b49a55]/25 bg-gradient-to-l from-[#10233f] via-[#173858] to-[#24506a] p-5 text-white shadow-md sm:p-7">
        <div className="pointer-events-none absolute -left-10 -top-20 h-64 w-64 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -left-2 -top-12 h-48 w-48 rounded-full border border-[#d8c38e]/15" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-wide text-[#d8c38e]">
              نظرة المنصة · {periodLabel}
            </p>
            <p className="mt-2 text-xl font-bold sm:text-2xl">
              كل جهة ضمن صورة تشغيلية واحدة
            </p>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-200">
              تجمع اللوحة سجل الإجراءات الموثق، وتفصل بين حجم النشاط وحالة
              الجهات والحسابات الحالية.
            </p>
          </div>
          <p className="shrink-0 text-xs text-slate-300">
            آخر تحديث: {formatDate(summary.generatedAt, true)}
          </p>
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
          detail="حذف أو تعطيل أو إجراء دائم"
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
        <Card className="overflow-hidden border-border/70 shadow-sm xl:col-span-8">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold">وتيرة العمليات اليومية</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  عدد سجلات التدقيق خلال {periodLabel}
                </p>
              </div>
              <span className="rounded-xl bg-sky-500/10 p-2 text-sky-700 dark:text-sky-300">
                <Activity className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>
            {summary.operationsByDay.some(point => point.count > 0) ? (
              <div
                className="h-64 min-w-0 sm:h-72"
                role="img"
                aria-label="رسم يوضح عدد العمليات لكل يوم"
              >
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
                          stopColor="#2c6c86"
                          stopOpacity={0.28}
                        />
                        <stop
                          offset="95%"
                          stopColor="#2c6c86"
                          stopOpacity={0.02}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      className="stroke-border/70"
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
                        background: "var(--background)",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      name="العمليات"
                      stroke="#2c6c86"
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

        <Card className="overflow-hidden border-border/70 shadow-sm xl:col-span-4">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold">توزيع العمليات</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  حسب مجال الإجراء
                </p>
              </div>
              <span className="rounded-xl bg-amber-500/10 p-2 text-amber-700 dark:text-amber-300">
                <History className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>
            {categories.length > 0 ? (
              <div
                className="h-64 min-w-0 sm:h-72"
                role="img"
                aria-label="رسم يوضح توزيع العمليات حسب المجال"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categories}
                      dataKey="count"
                      nameKey="label"
                      innerRadius={54}
                      outerRadius={86}
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
                        background: "var(--background)",
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
        <Card className="overflow-hidden border-border/70 shadow-sm xl:col-span-5">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold">الجهات الأعلى نشاطًا</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  بحسب عدد العمليات في الفترة المحددة
                </p>
              </div>
              <span className="rounded-xl bg-emerald-500/10 p-2 text-emerald-700 dark:text-emerald-300">
                <Building2 className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>
            {summary.topOrganizations.length > 0 ? (
              <div
                className="h-72 min-w-0"
                role="img"
                aria-label="رسم يوضح الجهات الأعلى نشاطًا"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={summary.topOrganizations}
                    layout="vertical"
                    margin={{ top: 4, right: 4, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      className="stroke-border/70"
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
                        background: "var(--background)",
                      }}
                    />
                    <Bar
                      dataKey="count"
                      name="العمليات"
                      fill="#b49a55"
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

        <Card className="overflow-hidden border-border/70 shadow-sm xl:col-span-7">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold">أحدث العمليات</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  لقطة مختصرة من سجل التدقيق الموحّد
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/audit-log")}
                className="shrink-0 text-primary"
              >
                عرض الكل{" "}
                <ArrowUpRight className="mr-1 h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            {summary.recentOperations.length > 0 ? (
              <ul className="divide-y divide-border/70">
                {summary.recentOperations.map(operation => (
                  <li
                    key={operation.id}
                    className="flex gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary">
                      <Activity className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
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
                      <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
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

      <p className="flex items-start gap-2 rounded-xl border border-border/70 bg-muted/25 px-4 py-3 text-xs leading-5 text-muted-foreground">
        <ShieldCheck
          className="mt-0.5 h-4 w-4 shrink-0 text-primary"
          aria-hidden="true"
        />
        المؤشرات مبنية على سجلات الإجراءات الموثقة؛ لا تعرض هذه الصفحة نصوص
        البرقيات أو بيانات الشبكة أو تفاصيل المرفقات.
      </p>
    </section>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/15 px-5 text-center sm:h-72">
      <Activity
        className="h-7 w-7 text-muted-foreground/60"
        aria-hidden="true"
      />
      <p className="text-sm font-medium">لا توجد بيانات كافية للرسم</p>
      <p className="max-w-sm text-xs leading-5 text-muted-foreground">
        {message}
      </p>
    </div>
  );
}
