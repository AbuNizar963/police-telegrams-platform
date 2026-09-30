import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, UserPlus, Users, ShieldCheck } from "lucide-react";

export default function OwnerUserManagement() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [badgeNumber, setBadgeNumber] = useState("");
  const [rank, setRank] = useState("");
  const [unit, setUnit] = useState("");

  const users = trpc.userManagement.list.useQuery(undefined, {
    enabled: open,
    refetchOnWindowFocus: false,
  });
  const utils = trpc.useUtils();
  const createUser = trpc.userManagement.create.useMutation({
    onSuccess: async () => {
      toast.success("تم إنشاء حساب الضابط بنجاح");
      setName("");
      setUsername("");
      setPassword("");
      setBadgeNumber("");
      setRank("");
      setUnit("");
      await utils.userManagement.list.invalidate();
    },
    onError: error => toast.error(error.message || "تعذر إنشاء الحساب"),
  });

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("open-owner-user-management", show);
    return () => window.removeEventListener("open-owner-user-management", show);
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createUser.mutate({
      name: name.trim(),
      username: username.trim().toLowerCase(),
      password,
      badgeNumber: badgeNumber.trim() || null,
      rank: rank.trim() || null,
      unit: unit.trim() || null,
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-5">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="owner-users-title"
        dir="rtl"
        className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-background p-5 shadow-2xl sm:rounded-2xl sm:p-7"
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-wide text-[#9b7c3d]">OWNER / USER MANAGEMENT</p>
            <h2 id="owner-users-title" className="mt-1 text-xl font-bold">إدارة حسابات الضباط</h2>
            <p className="mt-1 text-sm text-muted-foreground">إنشاء حسابات دخول فردية للشرطيين العاملين على النظام.</p>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="إغلاق" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" />
          </Button>
        </header>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <form onSubmit={submit} className="space-y-3 rounded-xl border p-4">
            <div className="mb-2 flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-[#9b7c3d]" />
              <h3 className="font-bold">إنشاء حساب شرطي</h3>
            </div>
            <label className="grid gap-1.5 text-sm font-medium">الاسم الكامل
              <Input autoComplete="name" value={name} onChange={event => setName(event.target.value)} minLength={2} maxLength={255} required placeholder="اسم الضابط أو الشرطي" />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">اسم المستخدم
              <Input autoComplete="off" dir="ltr" value={username} onChange={event => setUsername(event.target.value.replace(/[^a-zA-Z0-9._-]/g, ""))} minLength={3} maxLength={120} required placeholder="officer01" />
              <span className="text-xs font-normal text-muted-foreground">أحرف إنجليزية وأرقام ونقطة وشرطة فقط.</span>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">كلمة المرور المؤقتة
              <Input type="password" dir="ltr" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} minLength={12} maxLength={256} required placeholder="12 حرفًا على الأقل" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium">الرقم الوظيفي
                <Input value={badgeNumber} onChange={event => setBadgeNumber(event.target.value)} maxLength={80} placeholder="اختياري" />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">الرتبة
                <Input value={rank} onChange={event => setRank(event.target.value)} maxLength={120} placeholder="اختياري" />
              </label>
            </div>
            <label className="grid gap-1.5 text-sm font-medium">القسم أو المخفر
              <Input value={unit} onChange={event => setUnit(event.target.value)} maxLength={255} placeholder="الجهة الشرطية" />
            </label>
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-xs leading-5 text-amber-800 dark:text-amber-200">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              الحساب يُنشأ بصلاحية ضابط عادي، ولا يمكنه الوصول إلى إعدادات المالك.
            </div>
            <Button type="submit" className="w-full bg-[#10233f] text-white hover:bg-[#18375f]" disabled={createUser.isPending || name.trim().length < 2 || username.trim().length < 3 || password.length < 12}>
              {createUser.isPending ? "جارٍ إنشاء الحساب..." : "إنشاء حساب الضابط"}
            </Button>
          </form>

          <section className="min-w-0 rounded-xl border p-4">
            <div className="mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-[#9b7c3d]" />
              <h3 className="font-bold">الحسابات المسجلة</h3>
              <span className="mr-auto rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">{users.data?.length ?? 0}</span>
            </div>
            {users.isLoading && <p className="py-8 text-center text-sm text-muted-foreground">جارٍ تحميل الحسابات...</p>}
            {users.isError && <div role="alert" className="py-6 text-center text-sm text-destructive">{users.error.message || "تعذر تحميل الحسابات"}<Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => users.refetch()}>إعادة المحاولة</Button></div>}
            {!users.isLoading && !users.isError && users.data?.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">لا توجد حسابات مسجلة بعد.</p>}
            <ul className="max-h-[440px] divide-y overflow-y-auto">
              {users.data?.map(user => (
                <li key={user.id} className="py-3 first:pt-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{user.name}</p>
                      <p dir="ltr" className="mt-0.5 truncate text-right font-mono text-xs text-muted-foreground">@{user.username}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{[user.rank, user.badgeNumber ? `الرقم الوظيفي: ${user.badgeNumber}` : null, user.unit].filter(Boolean).join(" • ") || "لم تُضف تفاصيل وظيفية"}</p>
                    </div>
                    <span className={user.role === "admin" ? "shrink-0 rounded-md bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300" : "shrink-0 rounded-md bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300"}>{user.role === "admin" ? "مالك" : "ضابط"}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <footer className="mt-5 flex justify-end">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>إغلاق</Button>
        </footer>
      </section>
    </div>
  );
}
