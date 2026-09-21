import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, FileText, LockKeyhole, Plus, Search, Shield, Siren, UserRound, X } from "lucide-react";
import { useMemo, useState } from "react";

const dateFormatter = new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" });
const classificationLabels = { urgent: "عاجل جداً", secret: "سري للغاية", normal: "عادي" } as const;
const classificationStyles = {
  urgent: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300",
  secret: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-300",
  normal: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300",
} as const;

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof FileText; tone: string }) {
  return (
    <Card className="border-0 shadow-sm bg-card/90">
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{value.toLocaleString("ar-SA")}</p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tone}`}><Icon className="h-5 w-5" /></div>
      </CardContent>
    </Card>
  );
}

function ClassificationBadge({ value }: { value: "urgent" | "secret" | "normal" }) {
  return <Badge variant="outline" className={`gap-1.5 rounded-full px-3 py-1 font-medium ${classificationStyles[value]}`}>
    {value === "urgent" ? <Siren className="h-3.5 w-3.5" /> : value === "secret" ? <LockKeyhole className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
    {classificationLabels[value]}
  </Badge>;
}

export default function Home() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "urgent" | "secret" | "normal">("all");
  const [isComposerOpen, setComposerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const listInput = useMemo(() => ({ search: search.trim() || undefined, classification: filter === "all" ? undefined : filter }), [search, filter]);
  const settingsQuery = trpc.settings.get.useQuery();
  const statsQuery = trpc.dashboard.stats.useQuery();
  const telegramsQuery = trpc.telegrams.list.useQuery(listInput);
  const telegramQuery = trpc.telegrams.get.useQuery({ id: selectedId ?? 0 }, { enabled: selectedId !== null });
  const utils = trpc.useUtils();
  const createTelegram = trpc.telegrams.create.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ البرقية وتوثيق منشئها بنجاح");
      setComposerOpen(false);
      utils.telegrams.list.invalidate();
      utils.dashboard.stats.invalidate();
    },
    onError: error => toast.error(error.message || "تعذر حفظ البرقية"),
  });

  const settings = settingsQuery.data;
  const stats = statsQuery.data ?? { total: 0, today: 0, urgent: 0, secret: 0, normal: 0 };
  const telegrams = telegramsQuery.data ?? [];

  return (
    <div dir="rtl" className="min-h-[calc(100vh-2rem)] space-y-6 pb-12">
      <header className="relative overflow-hidden rounded-[2rem] bg-[#10233f] px-6 py-7 text-white shadow-xl shadow-slate-900/10 sm:px-8">
        <div className="absolute -left-12 -top-20 h-64 w-64 rounded-full bg-[#b4945a]/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <div className="mb-4 flex items-center gap-3 text-[#d8c38e]">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#d8c38e]/30 bg-white/5"><Shield className="h-6 w-6" /></div>
              <span className="text-sm font-medium tracking-[0.16em]">نظام المراسلات الأمنية</span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{settings?.departmentName ?? "إدارة الشرطة"}</h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-slate-300">منصة مركزية موحّدة لإنشاء البرقيات الرسمية، حفظها، والرجوع إليها مع توثيق كامل لهوية منشئ كل برقية.</p>
          </div>
          <Button onClick={() => setComposerOpen(true)} className="h-12 rounded-xl bg-[#c6a86b] px-5 text-[#10233f] shadow-lg shadow-black/10 hover:bg-[#d8c38e]">
            <Plus className="ml-2 h-5 w-5" /> إنشاء برقية جديدة
          </Button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="إجمالي البرقيات" value={stats.total} icon={FileText} tone="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" />
        <StatCard label="برقيات اليوم" value={stats.today} icon={ArrowLeft} tone="bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" />
        <StatCard label="عاجل جداً" value={stats.urgent} icon={Siren} tone="bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300" />
        <StatCard label="سري للغاية" value={stats.secret} icon={LockKeyhole} tone="bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300" />
      </section>

      <section className="rounded-3xl border border-border/70 bg-card/70 p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold">سجل البرقيات</h2>
            <p className="mt-1 text-sm text-muted-foreground">كل سجل يعرض الشرطي الذي أنشأ البرقية وتاريخ إنشائها بشكل ثابت.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative min-w-0 sm:w-72">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث بالرقم أو الموضوع أو الاسم" className="h-10 rounded-xl bg-background pr-10" />
            </div>
            <div className="flex rounded-xl border bg-background p-1">
              {(["all", "urgent", "secret", "normal"] as const).map(item => <button key={item} onClick={() => setFilter(item)} className={`rounded-lg px-3 py-2 text-xs transition-colors ${filter === item ? "bg-[#10233f] text-white" : "text-muted-foreground hover:bg-muted"}`}>{item === "all" ? "الكل" : classificationLabels[item]}</button>)}
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {telegramsQuery.isLoading && <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">جارٍ تحميل السجل...</div>}
          {!telegramsQuery.isLoading && telegrams.length === 0 && <div className="rounded-2xl border border-dashed p-10 text-center"><FileText className="mx-auto h-8 w-8 text-muted-foreground/50" /><p className="mt-3 font-medium">لا توجد برقيات مطابقة</p><p className="mt-1 text-sm text-muted-foreground">ابدأ بإنشاء أول برقية موثقة في النظام.</p></div>}
          {telegrams.map(telegram => <button key={telegram.id} onClick={() => setSelectedId(telegram.id)} className="group w-full rounded-2xl border bg-background p-4 text-right transition-all hover:-translate-y-0.5 hover:border-[#b4945a] hover:shadow-md sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#10233f] text-sm font-semibold text-[#d8c38e]">{String(telegram.serialNumber).padStart(4, "0")}</div>
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold">{telegram.subject}</h3><ClassificationBadge value={telegram.classification} /></div><p className="mt-1 truncate text-sm text-muted-foreground">إلى: {telegram.recipient}</p></div>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" />{telegram.creatorName}</span><span>{dateFormatter.format(new Date(telegram.createdAt))}</span></div>
            </div>
          </button>)}
        </div>
      </section>

      {isComposerOpen && <TelegramComposer isPending={createTelegram.isPending} onClose={() => setComposerOpen(false)} onSubmit={values => createTelegram.mutate(values)} />}
      {selectedId !== null && telegramQuery.data && <TelegramDetail telegram={telegramQuery.data} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

function TelegramComposer({ isPending, onClose, onSubmit }: { isPending: boolean; onClose: () => void; onSubmit: (values: { subject: string; recipient: string; body: string; classification: "urgent" | "secret" | "normal" }) => void }) {
  const [subject, setSubject] = useState("");
  const [recipient, setRecipient] = useState("");
  const [body, setBody] = useState("");
  const [classification, setClassification] = useState<"urgent" | "secret" | "normal">("normal");
  const submit = () => {
    if (subject.trim().length < 2 || recipient.trim().length < 2 || body.trim().length < 3) { toast.error("أكمل الموضوع والجهة ونص البرقية قبل الحفظ"); return; }
    onSubmit({ subject: subject.trim(), recipient: recipient.trim(), body: body.trim(), classification });
  };
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"><div dir="rtl" className="max-h-[92vh] w-full overflow-y-auto rounded-t-[2rem] bg-background p-6 shadow-2xl sm:max-w-2xl sm:rounded-[2rem] sm:p-8"><div className="flex items-start justify-between"><div><p className="text-sm font-medium text-[#9b7c3d]">وثيقة جديدة</p><h2 className="mt-1 text-2xl font-semibold">إنشاء برقية رسمية</h2><p className="mt-2 text-sm text-muted-foreground">سيُثبّت النظام حسابك الحالي تلقائياً كمنشئ للبرقية.</p></div><button onClick={onClose} className="rounded-xl p-2 text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button></div><div className="mt-7 grid gap-5"><label className="grid gap-2 text-sm font-medium">الموضوع<Input value={subject} onChange={event => setSubject(event.target.value)} placeholder="موضوع البرقية" className="h-12 rounded-xl" /></label><label className="grid gap-2 text-sm font-medium">الموجّه إليه<Input value={recipient} onChange={event => setRecipient(event.target.value)} placeholder="الجهة أو المسؤول المعني" className="h-12 rounded-xl" /></label><div className="grid gap-2 text-sm font-medium"><span>درجة السرية والأولوية</span><div className="grid grid-cols-3 gap-2">{(["urgent", "secret", "normal"] as const).map(item => <button type="button" key={item} onClick={() => setClassification(item)} className={`rounded-xl border p-3 text-sm transition-colors ${classification === item ? "border-[#b4945a] bg-[#fff8e8] text-[#7a5c1e] dark:bg-[#3c301a] dark:text-[#e7cc8c]" : "hover:bg-muted"}`}>{classificationLabels[item]}</button>)}</div></div><label className="grid gap-2 text-sm font-medium">نص البرقية<Textarea value={body} onChange={event => setBody(event.target.value)} placeholder="اكتب نص البرقية بالتفصيل..." className="min-h-44 resize-y rounded-xl leading-7" /></label></div><div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-start"><Button variant="outline" onClick={onClose} className="h-11 rounded-xl">إلغاء</Button><Button onClick={submit} disabled={isPending} className="h-11 rounded-xl bg-[#10233f] text-white hover:bg-[#18375f]">{isPending ? "جارٍ الحفظ..." : "حفظ البرقية وتوثيقها"}</Button></div></div></div>;
}

function TelegramDetail({ telegram, onClose }: { telegram: { serialNumber: number; subject: string; recipient: string; body: string; creatorName: string; creatorEmail: string | null; classification: "urgent" | "secret" | "normal"; createdAt: Date }; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"><div dir="rtl" className="max-h-[92vh] w-full overflow-y-auto rounded-t-[2rem] bg-background p-6 shadow-2xl sm:max-w-2xl sm:rounded-[2rem] sm:p-8"><div className="flex items-start justify-between"><div><div className="flex items-center gap-3"><span className="rounded-lg bg-[#10233f] px-3 py-1.5 text-sm font-semibold text-[#d8c38e]">#{String(telegram.serialNumber).padStart(4, "0")}</span><ClassificationBadge value={telegram.classification} /></div><h2 className="mt-4 text-2xl font-semibold">{telegram.subject}</h2></div><button onClick={onClose} className="rounded-xl p-2 text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button></div><div className="mt-7 grid gap-4 rounded-2xl border bg-muted/30 p-4 text-sm"><div className="flex justify-between gap-4"><span className="text-muted-foreground">الموجّه إليه</span><span className="font-medium">{telegram.recipient}</span></div><div className="flex justify-between gap-4"><span className="text-muted-foreground">منشئ البرقية</span><span className="font-medium">{telegram.creatorName}</span></div><div className="flex justify-between gap-4"><span className="text-muted-foreground">وقت الإنشاء</span><span className="font-medium">{dateFormatter.format(new Date(telegram.createdAt))}</span></div></div><div className="mt-6 whitespace-pre-wrap rounded-2xl border p-5 text-[15px] leading-8">{telegram.body}</div><div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground"><UserRound className="h-4 w-4" /> هذه البرقية مرتبطة بحساب المنشئ في سجل التدقيق ولا يمكن تغيير اسم المنشئ من الواجهة.</div></div></div>;
}
