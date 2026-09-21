import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Activity, AlertTriangle, Archive, ArrowUpLeft, Building2, CheckCircle2, ChevronLeft, Clock3, Command, FileDown, FileText, Filter, ImagePlus, LocateFixed, LockKeyhole, MapPinned, Menu, Plus, Printer, Radio, Search, Save, Settings2, Shield, Siren, SlidersHorizontal, Upload, UserRound, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const dateFormatter = new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" });
const numberFormatter = new Intl.NumberFormat("en-US");
const classificationLabels = { urgent: "عاجل جداً", secret: "سري للغاية", normal: "عادي" } as const;
const categoryLabels = { criminal: "جنائي", administrative: "إداري", traffic: "مروري", security: "أمني", tactical: "تكتيكي" } as const;
const statusLabels = { pending: "قيد الانتظار", in_progress: "تحت الإجراء", resolved: "مكتملة", archived: "مؤرشفة" } as const;
const statusStyles = { pending: "bg-amber-500/10 text-amber-700 dark:text-amber-300", in_progress: "bg-blue-500/10 text-blue-700 dark:text-blue-300", resolved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", archived: "bg-slate-500/10 text-slate-600 dark:text-slate-300" } as const;
const classificationStyles = { urgent: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300", secret: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-300", normal: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300" } as const;

type Classification = keyof typeof classificationLabels;
type Category = keyof typeof categoryLabels;
type Status = keyof typeof statusLabels;

function SeverityBadge({ value }: { value: Classification }) {
  const Icon = value === "urgent" ? Siren : value === "secret" ? LockKeyhole : Shield;
  return <Badge variant="outline" className={`gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold ${classificationStyles[value]}`}><Icon className="h-3.5 w-3.5" />{classificationLabels[value]}</Badge>;
}

function StatusBadge({ value }: { value: Status }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold ${statusStyles[value]}`}><span className={`h-1.5 w-1.5 rounded-full ${value === "in_progress" ? "animate-pulse bg-blue-500" : value === "resolved" ? "bg-emerald-500" : value === "pending" ? "bg-amber-500" : "bg-slate-400"}`} />{statusLabels[value]}</span>;
}

function Kpi({ label, value, detail, icon: Icon, tone }: { label: string; value: number; detail: string; icon: typeof FileText; tone: string }) {
  return <Card className="border-border/60 bg-card shadow-sm"><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{numberFormatter.format(value)}</p><p className="mt-1 text-[11px] text-muted-foreground">{detail}</p></div><div className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}><Icon className="h-4 w-4" /></div></div></CardContent></Card>;
}

export default function Home() {
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState<"all" | Classification>("all");
  const [status, setStatus] = useState<"all" | Status>("all");
  const [category, setCategory] = useState<"all" | Category>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const input = useMemo(() => ({ search: search.trim() || undefined, classification: severity === "all" ? undefined : severity, status: status === "all" ? undefined : status, category: category === "all" ? undefined : category }), [search, severity, status, category]);
  const settings = trpc.settings.get.useQuery();
  const me = trpc.auth.me.useQuery();
  const stats = trpc.dashboard.stats.useQuery();
  const list = trpc.telegrams.list.useQuery(input);
  const detail = trpc.telegrams.get.useQuery({ id: selectedId ?? 0 }, { enabled: selectedId !== null });
  const utils = trpc.useUtils();
  const create = trpc.telegrams.create.useMutation({ onSuccess: () => { toast.success("تم تسجيل البرقية وربطها بهويتك الرقمية"); setComposerOpen(false); utils.telegrams.list.invalidate(); utils.dashboard.stats.invalidate(); }, onError: error => toast.error(error.message || "تعذر إنشاء البرقية") });
  const data = stats.data ?? { total: 0, today: 0, urgent: 0, secret: 0, pending: 0, inProgress: 0, resolved: 0 };
  const rows = list.data ?? [];

  return <div dir="rtl" className="min-h-[calc(100vh-3rem)] space-y-4 pb-10">
    <div className="flex flex-col gap-3 border-b border-border/70 pb-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#10233f] text-[#d8c38e] shadow-sm"><Radio className="h-5 w-5" /></div><div><div className="flex items-center gap-2"><span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9b7c3d]">SECURE OPERATIONS</span><span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-600"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />النظام متصل</span></div><h1 className="mt-1 text-2xl font-bold tracking-tight">مركز القيادة والسيطرة</h1></div></div>
      <div className="flex flex-wrap items-center gap-2"><div className="hidden items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground md:flex"><Clock3 className="h-3.5 w-3.5" />{new Intl.DateTimeFormat("ar-SA", { dateStyle: "full" }).format(new Date())}</div>{me.data?.role === "admin" && <Button variant="outline" className="h-10 rounded-lg" onClick={() => window.dispatchEvent(new CustomEvent("open-department-settings"))}><Building2 className="ml-2 h-4 w-4" />هوية القسم</Button>}<Button variant="outline" className="h-10 rounded-lg" onClick={() => setFiltersOpen(value => !value)}><SlidersHorizontal className="ml-2 h-4 w-4" />تخصيص العرض</Button><Button onClick={() => setComposerOpen(true)} className="h-10 rounded-lg bg-[#10233f] px-4 text-white hover:bg-[#18375f]"><Plus className="ml-2 h-4 w-4" />برقية جديدة</Button></div>
    </div>

    {data.urgent > 0 && <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500 text-white"><Siren className="h-4 w-4" /></div><div><p className="text-sm font-bold">تنبيه أمني يحتاج إلى متابعة</p><p className="text-xs opacity-80">يوجد {numberFormatter.format(data.urgent)} برقية مصنفة عاجل جداً ضمن نطاق صلاحيتك.</p></div></div><button onClick={() => setSeverity("urgent")} className="rounded-lg border border-current/20 px-3 py-1.5 text-xs font-semibold hover:bg-red-500/10">عرض البلاغات <ArrowUpLeft className="mr-1 inline h-3 w-3" /></button></div>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><Kpi label="إجمالي البرقيات" value={data.total} detail="الرصيد التشغيلي" icon={FileText} tone="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" /><Kpi label="الواردة اليوم" value={data.today} detail="آخر 24 ساعة" icon={Activity} tone="bg-blue-500/10 text-blue-600" /><Kpi label="عاجل جداً" value={data.urgent} detail="تحتاج انتباهاً" icon={Siren} tone="bg-red-500/10 text-red-600" /><Kpi label="سري للغاية" value={data.secret} detail="مقيدة الصلاحية" icon={LockKeyhole} tone="bg-violet-500/10 text-violet-600" /><Kpi label="تحت الإجراء" value={data.inProgress} detail="قيد المعالجة" icon={Radio} tone="bg-cyan-500/10 text-cyan-600" /><Kpi label="مكتملة" value={data.resolved} detail="تم إغلاقها" icon={CheckCircle2} tone="bg-emerald-500/10 text-emerald-600" /></section>

    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      <section className="min-w-0 rounded-2xl border border-border/70 bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex items-center gap-2"><h2 className="text-lg font-bold">سجل البرقيات والبلاغات</h2><span className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground">{numberFormatter.format(rows.length)} نتيجة</span></div><p className="mt-1 text-xs text-muted-foreground">مرجع موحّد للبرقيات مع ختم الهوية الرقمية وسجل زمني كامل.</p></div><div className="relative w-full lg:w-72"><Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="بحث بالرقم، الموضوع، الاسم..." className="h-10 rounded-lg bg-background pr-10" /></div></div>
        {(filtersOpen || severity !== "all" || status !== "all" || category !== "all") && <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-4 py-3"><Filter className="h-3.5 w-3.5 text-muted-foreground" /><select value={severity} onChange={event => setSeverity(event.target.value as "all" | Classification)} className="rounded-md border bg-background px-2.5 py-1.5 text-xs"><option value="all">كل الأولويات</option>{(Object.keys(classificationLabels) as Classification[]).map(item => <option key={item} value={item}>{classificationLabels[item]}</option>)}</select><select value={status} onChange={event => setStatus(event.target.value as "all" | Status)} className="rounded-md border bg-background px-2.5 py-1.5 text-xs"><option value="all">كل الحالات</option>{(Object.keys(statusLabels) as Status[]).map(item => <option key={item} value={item}>{statusLabels[item]}</option>)}</select><select value={category} onChange={event => setCategory(event.target.value as "all" | Category)} className="rounded-md border bg-background px-2.5 py-1.5 text-xs"><option value="all">كل التصنيفات</option>{(Object.keys(categoryLabels) as Category[]).map(item => <option key={item} value={item}>{categoryLabels[item]}</option>)}</select><button onClick={() => { setSeverity("all"); setStatus("all"); setCategory("all"); }} className="mr-auto text-xs text-muted-foreground hover:text-foreground">مسح الفلاتر</button></div>}
        <div className="hidden grid-cols-[110px_minmax(180px,1fr)_120px_125px_145px_32px] gap-3 border-b bg-muted/30 px-5 py-3 text-[10px] font-bold uppercase tracking-wide text-muted-foreground md:grid"><span>الرقم</span><span>موضوع البلاغ</span><span>التصنيف</span><span>الأولوية</span><span>المنشئ / الوقت</span><span /></div>
        <div className="divide-y">{list.isLoading && <div className="p-12 text-center text-sm text-muted-foreground">جارٍ مزامنة سجل العمليات...</div>}{!list.isLoading && rows.length === 0 && <div className="p-14 text-center"><FileText className="mx-auto h-10 w-10 text-muted-foreground/30" /><p className="mt-3 font-semibold">لا توجد نتائج</p><p className="mt-1 text-xs text-muted-foreground">غيّر الفلاتر أو أنشئ برقية جديدة.</p></div>}{rows.map(row => <button key={row.id} onClick={() => setSelectedId(row.id)} className="group grid w-full gap-3 px-4 py-4 text-right transition-colors hover:bg-muted/40 md:grid-cols-[110px_minmax(180px,1fr)_120px_125px_145px_32px] md:items-center md:px-5"><div className="flex items-center gap-2"><span className="font-mono text-xs font-bold text-[#9b7c3d]">{row.serialCode}</span><span className="md:hidden"><StatusBadge value={row.status} /></span></div><div className="min-w-0"><p className="truncate text-sm font-bold">{row.subject}</p><p className="mt-1 truncate text-xs text-muted-foreground">إلى: {row.recipient}</p></div><span className="text-xs text-muted-foreground">{categoryLabels[row.category]}</span><SeverityBadge value={row.classification} /><div className="flex items-center gap-2 text-xs text-muted-foreground"><UserRound className="h-3.5 w-3.5" /><span className="truncate">{row.creatorName}</span><span className="hidden lg:inline">{dateFormatter.format(new Date(row.createdAt))}</span></div><ChevronLeft className="hidden h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-x-1 md:block" /></button>)}</div>
      </section>

      <aside className="space-y-4"><Card className="border-border/70 shadow-sm"><CardContent className="p-5"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Command className="h-4 w-4 text-[#9b7c3d]" /><h3 className="font-bold">مركز الإجراءات</h3></div><Settings2 className="h-4 w-4 text-muted-foreground" /></div><div className="mt-4 space-y-2"><QuickAction icon={Plus} label="إنشاء برقية" detail="فتح نموذج موثق" onClick={() => setComposerOpen(true)} /><QuickAction icon={MapPinned} label="خريطة البلاغات" detail="المواقع المسجلة" onClick={() => toast.info("سيتم تفعيل خريطة العمليات في المرحلة القادمة") } /><QuickAction icon={Users} label="الوحدات الميدانية" detail="إدارة الموارد" onClick={() => toast.info("وحدة الموارد الميدانية قيد الإعداد") } /><QuickAction icon={Archive} label="الأرشيف" detail="السجلات المغلقة" onClick={() => setStatus("archived")} /></div></CardContent></Card><Card className="border-border/70 bg-[#10233f] text-white shadow-sm"><CardContent className="p-5"><div className="flex items-center gap-2 text-[#d8c38e]"><Shield className="h-4 w-4" /><span className="text-xs font-semibold tracking-wide">سلامة السجل</span></div><p className="mt-3 text-sm font-semibold">الهوية الرقمية مفعلة</p><p className="mt-2 text-xs leading-6 text-slate-300">كل برقية تُربط بحساب منشئها وتوقيتها وسجل التدقيق. الحذف النهائي غير متاح.</p><div className="mt-4 flex items-center gap-2 text-[11px] text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />حماية تشغيلية نشطة</div></CardContent></Card></aside>
    </div>

    {composerOpen && <TelegramComposer pending={create.isPending} close={() => setComposerOpen(false)} submit={values => create.mutate(values)} />}
    {selectedId !== null && detail.data && <TelegramDetail telegram={detail.data} settings={settings.data} close={() => setSelectedId(null)} />}
    {me.data?.role === "admin" && <DepartmentSettingsModal settings={settings.data} />}
  </div>;
}

function QuickAction({ icon: Icon, label, detail, onClick }: { icon: typeof Plus; label: string; detail: string; onClick: () => void }) { return <button onClick={onClick} className="flex w-full items-center gap-3 rounded-xl border bg-background p-3 text-right transition-colors hover:border-[#b4945a] hover:bg-[#fffaf0] dark:hover:bg-[#2d281b]"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#10233f] text-[#d8c38e]"><Icon className="h-4 w-4" /></span><span className="min-w-0"><span className="block text-xs font-bold">{label}</span><span className="mt-0.5 block text-[10px] text-muted-foreground">{detail}</span></span><ChevronLeft className="mr-auto h-3.5 w-3.5 text-muted-foreground" /></button>; }

function TelegramComposer({ pending, close, submit }: { pending: boolean; close: () => void; submit: (values: { subject: string; recipient: string; body: string; classification: Classification; category: Category }) => void }) {
  const [subject, setSubject] = useState(""); const [recipient, setRecipient] = useState(""); const [body, setBody] = useState(""); const [classification, setClassification] = useState<Classification>("normal"); const [category, setCategory] = useState<Category>("administrative");
  const save = () => { if (subject.trim().length < 2 || recipient.trim().length < 2 || body.trim().length < 3) return toast.error("أكمل الموضوع والجهة ونص البرقية"); submit({ subject: subject.trim(), recipient: recipient.trim(), body: body.trim(), classification, category }); };
  return <Modal title="إنشاء برقية تشغيلية" subtitle="سيتم تثبيت هويتك الرقمية تلقائياً من الحساب الموثق." close={close}><div className="grid gap-4"><label className="grid gap-1.5 text-xs font-bold">الموضوع<Input value={subject} onChange={event => setSubject(event.target.value)} placeholder="عنوان مختصر ودقيق للبلاغ" className="h-11 rounded-lg" /></label><label className="grid gap-1.5 text-xs font-bold">الجهة الموجهة إليها<Input value={recipient} onChange={event => setRecipient(event.target.value)} placeholder="القطاع أو المسؤول المعني" className="h-11 rounded-lg" /></label><div className="grid gap-1.5 text-xs font-bold"><span>الأولوية والسرية</span><div className="grid grid-cols-3 gap-2">{(Object.keys(classificationLabels) as Classification[]).map(item => <button type="button" key={item} onClick={() => setClassification(item)} className={`rounded-lg border p-2.5 text-xs ${classification === item ? "border-[#b4945a] bg-[#fff8e8] text-[#7a5c1e] dark:bg-[#3c301a] dark:text-[#e7cc8c]" : "hover:bg-muted"}`}>{classificationLabels[item]}</button>)}</div></div><div className="grid gap-1.5 text-xs font-bold"><span>تصنيف البلاغ</span><select value={category} onChange={event => setCategory(event.target.value as Category)} className="h-11 rounded-lg border bg-background px-3 text-sm font-normal">{(Object.keys(categoryLabels) as Category[]).map(item => <option key={item} value={item}>{categoryLabels[item]}</option>)}</select></div><label className="grid gap-1.5 text-xs font-bold">نص البرقية<Textarea value={body} onChange={event => setBody(event.target.value)} placeholder="اكتب تفاصيل البلاغ والإجراء المطلوب..." className="min-h-36 rounded-lg leading-7" /></label></div><div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row"><Button variant="outline" onClick={close} className="h-11 rounded-lg">إلغاء</Button><Button onClick={save} disabled={pending} className="h-11 rounded-lg bg-[#10233f] text-white hover:bg-[#18375f]">{pending ? "جارٍ التسجيل..." : "تسجيل البرقية"}</Button></div></Modal>;
}

function TelegramDetail({ telegram, settings, close }: { telegram: { serialCode: string; subject: string; recipient: string; body: string; creatorName: string; classification: Classification; category: Category; status: Status; createdAt: Date; gpsLatitude?: string | null; gpsLongitude?: string | null }; settings?: { departmentName: string; logoUrl: string | null }; close: () => void }) {
  return <Modal title={telegram.subject} subtitle={telegram.serialCode} close={close}><div className="mb-5 border-b-2 border-[#b4945a] pb-4 text-center"><div className="flex items-center justify-center gap-3">{settings?.logoUrl ? <img src={settings.logoUrl} alt="شعار القسم" className="h-14 w-14 rounded-xl object-contain" /> : <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#10233f] text-[#d8c38e]"><Shield className="h-7 w-7" /></div>}<div><p className="text-[10px] font-semibold tracking-[0.16em] text-[#9b7c3d]">برقية رسمية</p><h3 className="mt-1 text-lg font-bold">{settings?.departmentName ?? "إدارة الشرطة"}</h3></div></div></div><div className="flex flex-wrap items-center gap-2"><SeverityBadge value={telegram.classification} /><StatusBadge value={telegram.status} /><span className="rounded-md bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">{categoryLabels[telegram.category]}</span></div><div className="mt-5 grid gap-3 rounded-xl border bg-muted/20 p-4 text-xs sm:grid-cols-2"><Info label="الجهة الموجهة" value={telegram.recipient} /><Info label="منشئ البرقية" value={telegram.creatorName} /><Info label="التاريخ والوقت" value={dateFormatter.format(new Date(telegram.createdAt))} /><Info label="الموقع" value={telegram.gpsLatitude ? `${telegram.gpsLatitude}, ${telegram.gpsLongitude}` : "غير محدد"} /></div><div className="mt-4 whitespace-pre-wrap rounded-xl border p-4 text-sm leading-8">{telegram.body}</div><div className="mt-5 flex flex-wrap gap-2"><Button onClick={() => window.print()} className="h-10 rounded-lg bg-[#10233f] text-white"><Printer className="ml-2 h-4 w-4" />طباعة / حفظ PDF</Button><Button variant="outline" onClick={() => toast.info("سيظهر موقع البلاغ بعد تفعيل خريطة العمليات")} className="h-10 rounded-lg"><LocateFixed className="ml-2 h-4 w-4" />عرض الموقع</Button></div><p className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground"><Shield className="h-3.5 w-3.5" />هذه الوثيقة مرتبطة بهوية المنشئ ولا يمكن تعديلها من شاشة العرض.</p></Modal>;
}

function Info({ label, value }: { label: string; value: string }) { return <div><span className="block text-muted-foreground">{label}</span><span className="mt-1 block font-semibold">{value}</span></div>; }
function Modal({ title, subtitle, close, children }: { title: string; subtitle: string; close: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"><div dir="rtl" className="max-h-[94vh] w-full overflow-y-auto rounded-t-[1.5rem] bg-background p-5 shadow-2xl sm:max-w-2xl sm:rounded-2xl sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="font-mono text-xs font-bold text-[#9b7c3d]">{subtitle}</p><h2 className="mt-1 text-xl font-bold">{title}</h2></div><button onClick={close} className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button></div><div className="mt-6">{children}</div></div></div>; }


function DepartmentSettingsModal({ settings }: { settings?: { id: number; departmentName: string; serialStart: number; logoUrl: string | null } }) {
  const [open, setOpen] = useState(false);
  const [departmentName, setDepartmentName] = useState(settings?.departmentName ?? "");
  const [logoUrl, setLogoUrl] = useState(settings?.logoUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const update = trpc.settings.update.useMutation({ onSuccess: result => { setOpen(false); setLogoUrl(result?.logoUrl ?? null); toast.success("تم تحديث هوية القسم وستظهر في البرقيات الجديدة"); }, onError: error => toast.error(error.message || "تعذر تحديث إعدادات القسم") });
  const upload = trpc.telegrams.uploadAttachment.useMutation();

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-department-settings", handler);
    return () => window.removeEventListener("open-department-settings", handler);
  }, []);
  useEffect(() => {
    setDepartmentName(settings?.departmentName ?? "");
    setLogoUrl(settings?.logoUrl ?? null);
  }, [settings?.departmentName, settings?.logoUrl]);

  const handleLogo = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("اختر ملف صورة للشعار");
    if (file.size > 5 * 1024 * 1024) return toast.error("حجم الشعار يجب ألا يتجاوز 5 ميغابايت");
    setUploading(true);
    try {
      const base64 = await readFileAsBase64(file);
      const result = await upload.mutateAsync({ fileName: file.name, contentType: file.type === "image/jpeg" ? "image/jpeg" : "image/png", base64 });
      setLogoUrl(result.url);
      toast.success("تم رفع الشعار، اضغط حفظ لاعتماده");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر رفع الشعار");
    } finally {
      setUploading(false);
    }
  };

  if (!open) return null;
  return <Modal title="هوية قسم الشرطة" subtitle="ADMIN / DEPARTMENT BRANDING" close={() => setOpen(false)}><div className="space-y-5"><div className="rounded-xl border bg-muted/20 p-4"><p className="text-xs font-bold text-muted-foreground">معاينة ترويسة البرقية</p><div className="mt-4 border-b-2 border-[#b4945a] pb-4 text-center"><div className="flex items-center justify-center gap-3">{logoUrl ? <img src={logoUrl} alt="معاينة شعار القسم" className="h-14 w-14 rounded-xl object-contain" /> : <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#10233f] text-[#d8c38e]"><Shield className="h-7 w-7" /></div>}<div><p className="text-[10px] font-semibold tracking-[0.16em] text-[#9b7c3d]">برقية رسمية</p><h3 className="mt-1 text-lg font-bold">{departmentName || "اسم قسم الشرطة"}</h3></div></div></div></div><label className="grid gap-1.5 text-xs font-bold">اسم قسم الشرطة<Input value={departmentName} onChange={event => setDepartmentName(event.target.value)} placeholder="مثال: شرطة محافظة الرياض" className="h-11 rounded-lg" /></label><div className="grid gap-2"><span className="text-xs font-bold">شعار القسم</span><div className="flex items-center gap-4 rounded-xl border border-dashed p-4"><div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-muted">{logoUrl ? <img src={logoUrl} alt="شعار القسم" className="h-full w-full rounded-xl object-contain" /> : <ImagePlus className="h-7 w-7 text-muted-foreground" />}</div><div className="min-w-0"><p className="text-sm font-semibold">ارفع شعارًا رسميًا</p><p className="mt-1 text-[11px] text-muted-foreground">PNG أو JPG، بحد أقصى 5 ميغابايت. سيظهر في منتصف ترويسة كل برقية.</p><label className="mt-3 inline-flex cursor-pointer items-center rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-muted"><Upload className="ml-2 h-3.5 w-3.5" />{uploading ? "جارٍ الرفع..." : "اختيار الشعار"}<input type="file" accept="image/png,image/jpeg" className="hidden" onChange={event => handleLogo(event.target.files?.[0])} /></label></div></div></div><div className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200"><Shield className="mt-0.5 h-4 w-4 shrink-0" /><span>هذه الإعدادات متاحة للمالك أو المدير فقط، وتُحفظ في الخادم وتظهر في ترويسة البرقية عند العرض والطباعة.</span></div></div><div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)} className="h-10 rounded-lg">إلغاء</Button><Button disabled={update.isPending || uploading || !settings || departmentName.trim().length < 2} onClick={() => settings && update.mutate({ departmentName: departmentName.trim(), serialStart: settings.serialStart, logoUrl })} className="h-10 rounded-lg bg-[#10233f] text-white hover:bg-[#18375f]"><Save className="ml-2 h-4 w-4" />{update.isPending ? "جارٍ الحفظ..." : "حفظ هوية القسم"}</Button></div></Modal>;
}

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("تعذر قراءة الملف"));
    reader.readAsDataURL(file);
  });
}
