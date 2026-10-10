import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  X,
  UserPlus,
  Users,
  ShieldCheck,
  Pencil,
  Trash2,
  RotateCcw,
} from "lucide-react";

export default function OwnerUserManagement() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [badgeNumber, setBadgeNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [rank, setRank] = useState("");
  const [unit, setUnit] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [organizationFilter, setOrganizationFilter] = useState("all");
  const [editing, setEditing] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    username: "",
    badgeNumber: "",
    phone: "",
    rank: "",
    unit: "",
    password: "",
  });
  const [enablePassword, setEnablePassword] = useState<Record<number, string>>(
    {}
  );

  const users = trpc.userManagement.list.useQuery(undefined, {
    enabled: open,
    refetchOnWindowFocus: false,
  });
  const userGroups = useMemo(() => {
    const groups = new Map<
      string,
      { id: string; name: string; users: NonNullable<typeof users.data> }
    >();
    for (const user of users.data ?? []) {
      const id = user.organizationId ?? "unassigned";
      const name = user.organizationName || "جهة غير محددة";
      const group = groups.get(id);
      if (group) {
        group.users.push(user);
      } else {
        groups.set(id, { id, name, users: [user] });
      }
    }
    return Array.from(groups.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "ar")
    );
  }, [users.data]);
  const visibleUserGroups = useMemo(() => {
    const query = userSearch.trim().toLocaleLowerCase("ar");
    return userGroups
      .filter(
        group => organizationFilter === "all" || group.id === organizationFilter
      )
      .map(group => ({
        ...group,
        users: query
          ? group.users.filter(user =>
              [
                user.name,
                user.username,
                user.badgeNumber,
                user.phone,
                user.rank,
                user.unit,
              ]
                .filter(Boolean)
                .some(value =>
                  String(value).toLocaleLowerCase("ar").includes(query)
                )
            )
          : group.users,
      }))
      .filter(group => group.users.length > 0);
  }, [organizationFilter, userGroups, userSearch]);
  const utils = trpc.useUtils();
  const createUser = trpc.userManagement.create.useMutation({
    onSuccess: async () => {
      toast.success("تم إنشاء حساب الشرطي بنجاح");
      setName("");
      setUsername("");
      setPassword("");
      setBadgeNumber("");
      setPhone("");
      setRank("");
      setUnit("");
      await utils.userManagement.list.invalidate();
    },
    onError: error => toast.error(error.message || "تعذر إنشاء الحساب"),
  });

  const updateUser = trpc.userManagement.update.useMutation({
    onSuccess: async () => {
      toast.success("تم تحديث الحساب");
      setEditing(null);
      await utils.userManagement.list.invalidate();
    },
    onError: error => toast.error(error.message || "تعذر تعديل الحساب"),
  });
  const disableUser = trpc.userManagement.disable.useMutation({
    onSuccess: async () => {
      toast.success("تم تعطيل الحساب مع الحفاظ على سجلاته وبرقياته");
      await utils.userManagement.list.invalidate();
    },
    onError: error => toast.error(error.message || "تعذر تعطيل الحساب"),
  });
  const enableUser = trpc.userManagement.enable.useMutation({
    onSuccess: async (_data, variables) => {
      toast.success("تمت إعادة تفعيل الحساب");
      setEnablePassword(current => ({ ...current, [variables.id]: "" }));
      await utils.userManagement.list.invalidate();
    },
    onError: error => toast.error(error.message || "تعذر تفعيل الحساب"),
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
      phone: phone.trim() || null,
      rank: rank.trim() || null,
      unit: unit.trim() || null,
    });
  };

  if (!open) return null;

  return (
    <div className="app-modal-overlay z-[70]">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="owner-users-title"
        dir="rtl"
        className="app-modal-shell p-5 sm:p-7"
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 id="owner-users-title" className="text-xl font-bold">
              إدارة الحسابات
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              إنشاء حسابات دخول فردية للشرطيين العاملين على النظام.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="إغلاق"
            onClick={() => setOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </header>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <form onSubmit={submit} className="space-y-3 rounded-xl border p-4">
            <div className="mb-2 flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-[#9b7c3d]" />
              <h3 className="font-bold">إنشاء حساب شرطي</h3>
            </div>
            <label className="grid gap-1.5 text-sm font-medium">
              الاسم الكامل
              <Input
                autoComplete="name"
                value={name}
                onChange={event => setName(event.target.value)}
                minLength={2}
                maxLength={255}
                required
                placeholder="اسم الشرطي"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              اسم المستخدم
              <Input
                autoComplete="off"
                dir="ltr"
                value={username}
                onChange={event =>
                  setUsername(
                    event.target.value.replace(/[^a-zA-Z0-9._-]/g, "")
                  )
                }
                minLength={3}
                maxLength={120}
                required
                placeholder="officer01"
              />
              <span className="text-xs font-normal text-muted-foreground">
                أحرف إنجليزية وأرقام ونقطة وشرطة فقط.
              </span>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              كلمة المرور المؤقتة
              <Input
                type="password"
                dir="ltr"
                autoComplete="new-password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                minLength={12}
                maxLength={256}
                required
                placeholder="12 محرفًا على الأقل"
              />
              <span className="text-xs font-normal text-muted-foreground">
                يجب أن تكون كلمة المرور 12 محرفًا على الأقل، وسيُطلب تغييرها عند
                الدخول.
              </span>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium">
                الرقم الوظيفي
                <Input
                  value={badgeNumber}
                  onChange={event => setBadgeNumber(event.target.value)}
                  maxLength={80}
                  placeholder="اختياري"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                الرتبة
                <Input
                  value={rank}
                  onChange={event => setRank(event.target.value)}
                  maxLength={120}
                  placeholder="اختياري"
                />
              </label>
            </div>
            <label className="grid gap-1.5 text-sm font-medium">
              رقم الهاتف
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                dir="ltr"
                value={phone}
                onChange={event => setPhone(event.target.value)}
                maxLength={32}
                placeholder="+963 9XX XXX XXX"
              />
              <span className="text-xs font-normal text-muted-foreground">
                اختياري، ويمكن تعديله لاحقًا من الملف الشخصي.
              </span>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              القسم أو المخفر
              <Input
                value={unit}
                onChange={event => setUnit(event.target.value)}
                maxLength={255}
                placeholder="الجهة الشرطية"
              />
            </label>
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-xs leading-5 text-amber-800 dark:text-amber-200">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              يُنشأ الحساب بصلاحيات شرطي، ولا يمكنه الوصول إلى إعدادات المالك.
            </div>
            <Button
              type="submit"
              className="w-full bg-[#10233f] text-white hover:bg-[#18375f]"
              disabled={
                createUser.isPending ||
                name.trim().length < 2 ||
                username.trim().length < 3 ||
                password.length < 12
              }
            >
              {createUser.isPending
                ? "جارٍ إنشاء الحساب..."
                : "إنشاء حساب الشرطي"}
            </Button>
          </form>

          <section className="min-w-0 rounded-xl border p-4">
            <div className="mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-[#9b7c3d]" />
              <h3 className="font-bold">الحسابات المسجلة</h3>
              <span className="mr-auto rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">
                {users.data?.length ?? 0}
              </span>
            </div>
            <div className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.7fr)]">
              <Input
                value={userSearch}
                onChange={event => setUserSearch(event.target.value)}
                placeholder="بحث بالاسم أو اسم المستخدم أو الرقم الوظيفي"
                aria-label="البحث في حسابات المستخدمين"
              />
              <select
                value={organizationFilter}
                onChange={event => setOrganizationFilter(event.target.value)}
                aria-label="تصفية الحسابات حسب الجهة"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">كل الجهات التنظيمية</option>
                {userGroups.map(group => (
                  <option key={group.id} value={group.id}>
                    {group.name} ({group.users.length})
                  </option>
                ))}
              </select>
            </div>
            {(userSearch.trim() || organizationFilter !== "all") && (
              <p className="mb-3 text-xs text-muted-foreground">
                يعرض{" "}
                {visibleUserGroups.reduce(
                  (total, group) => total + group.users.length,
                  0
                )}{" "}
                من أصل {users.data?.length ?? 0} حساب
              </p>
            )}
            {users.isLoading && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                جارٍ تحميل الحسابات...
              </p>
            )}
            {users.isError && (
              <div
                role="alert"
                className="py-6 text-center text-sm text-destructive"
              >
                {users.error.message || "تعذر تحميل الحسابات"}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => users.refetch()}
                >
                  إعادة المحاولة
                </Button>
              </div>
            )}
            {!users.isLoading && !users.isError && users.data?.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                لا توجد حسابات مسجلة بعد.
              </p>
            )}
            {!users.isLoading &&
              !users.isError &&
              (users.data?.length ?? 0) > 0 &&
              visibleUserGroups.length === 0 && (
                <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
                  لا توجد حسابات مطابقة للبحث أو الجهة المحددة.
                </p>
              )}
            <div className="max-h-[440px] space-y-3 overflow-y-auto">
              {visibleUserGroups.map(group => (
                <section
                  key={group.id}
                  className="overflow-hidden rounded-xl border bg-muted/10"
                >
                  <header className="flex items-center justify-between gap-3 border-b bg-muted/30 px-3 py-2.5">
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-bold">
                        {group.name}
                      </h4>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        حسابات هذه الجهة
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-xs font-semibold tabular-nums">
                      {group.users.length}
                    </span>
                  </header>
                  <ul className="divide-y px-3">
                    {group.users.map(user => (
                      <li key={user.id} className="py-3 first:pt-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">
                              {user.name}
                            </p>
                            <p
                              dir="ltr"
                              className="mt-0.5 truncate text-right font-mono text-xs text-muted-foreground"
                            >
                              @{user.username}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {[
                                user.rank,
                                user.badgeNumber
                                  ? `الرقم الوظيفي: ${user.badgeNumber}`
                                  : null,
                                user.phone ? `الهاتف: ${user.phone}` : null,
                                user.unit,
                              ]
                                .filter(Boolean)
                                .join(" • ") || "لم تُضف تفاصيل وظيفية"}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <span
                              className={
                                user.role === "admin"
                                  ? "rounded-md bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300"
                                  : "rounded-md bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300"
                              }
                            >
                              {user.role === "admin" ? "مالك" : "شرطي"}
                            </span>
                            {user.loginMethod === "disabled" && (
                              <span className="rounded-md bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-600">
                                معطّل
                              </span>
                            )}
                            {user.role !== "admin" && (
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-emerald-600 hover:bg-emerald-500/10"
                                  title="تعديل الحساب"
                                  aria-label={`تعديل حساب ${user.name}`}
                                  onClick={() => {
                                    setEditing(user);
                                    setEditForm({
                                      name: user.name ?? "",
                                      username: user.username ?? "",
                                      badgeNumber: user.badgeNumber ?? "",
                                      phone: user.phone ?? "",
                                      rank: user.rank ?? "",
                                      unit: user.unit ?? "",
                                      password: "",
                                    });
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                {user.loginMethod === "disabled" ? (
                                  <div className="flex items-center gap-1">
                                    <Input
                                      aria-label={`كلمة مرور جديدة لـ ${user.name}`}
                                      type="password"
                                      className="h-8 w-28"
                                      placeholder="كلمة مرور مؤقتة (12+)"
                                      minLength={12}
                                      value={enablePassword[user.id] ?? ""}
                                      onChange={e =>
                                        setEnablePassword(v => ({
                                          ...v,
                                          [user.id]: e.target.value,
                                        }))
                                      }
                                    />
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-blue-600"
                                      title="إعادة تفعيل الحساب"
                                      aria-label={`إعادة تفعيل ${user.name}`}
                                      disabled={
                                        (enablePassword[user.id] ?? "").length <
                                          12 || enableUser.isPending
                                      }
                                      onClick={() =>
                                        enableUser.mutate({
                                          id: user.id,
                                          password: enablePassword[user.id],
                                        })
                                      }
                                    >
                                      <RotateCcw className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-red-600 hover:bg-red-500/10"
                                    title="تعطيل الحساب"
                                    aria-label={`تعطيل حساب ${user.name}`}
                                    onClick={() => {
                                      if (
                                        window.confirm(
                                          `هل تريد تعطيل حساب ${user.name}؟ لن تُحذف البرقيات أو السجلات المرتبطة به، ويمكن إعادة تفعيله لاحقًا.`
                                        )
                                      )
                                        disableUser.mutate({ id: user.id });
                                    }}
                                    disabled={disableUser.isPending}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </section>
        </div>
        {editing && (
          <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4">
            <form
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-user-title"
              dir="rtl"
              onSubmit={e => {
                e.preventDefault();
                updateUser.mutate({
                  id: editing.id,
                  ...editForm,
                  name: editForm.name.trim(),
                  username: editForm.username.trim().toLowerCase(),
                  badgeNumber: editForm.badgeNumber.trim() || null,
                  phone: editForm.phone.trim() || null,
                  rank: editForm.rank.trim() || null,
                  unit: editForm.unit.trim() || null,
                });
              }}
              className="max-h-[calc(100dvh-2rem)] w-full max-w-lg space-y-3 overflow-y-auto rounded-xl bg-background p-5 shadow-xl"
            >
              <div className="flex items-center justify-between">
                <h3 id="edit-user-title" className="text-lg font-bold">
                  تعديل بيانات الشرطي
                </h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditing(null)}
                  aria-label="إغلاق"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {(
                [
                  ["name", "الاسم الكامل"],
                  ["username", "اسم المستخدم"],
                  ["badgeNumber", "الرقم الوظيفي"],
                  ["rank", "الرتبة"],
                  ["phone", "رقم الهاتف"],
                  ["unit", "القسم أو المخفر"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="grid gap-1 text-sm font-medium">
                  {label}
                  <Input
                    dir={
                      key === "username" || key === "phone" ? "ltr" : undefined
                    }
                    value={editForm[key]}
                    onChange={e =>
                      setEditForm(v => ({ ...v, [key]: e.target.value }))
                    }
                    required={key === "name" || key === "username"}
                    minLength={
                      key === "name" ? 2 : key === "username" ? 3 : undefined
                    }
                  />
                </label>
              ))}
              <label className="grid gap-1 text-sm font-medium">
                كلمة مرور جديدة (اختياري)
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={editForm.password}
                  onChange={e =>
                    setEditForm(v => ({ ...v, password: e.target.value }))
                  }
                  minLength={editForm.password ? 12 : undefined}
                />
              </label>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(null)}
                >
                  إلغاء
                </Button>
                <Button type="submit" disabled={updateUser.isPending}>
                  {updateUser.isPending ? "جارٍ الحفظ..." : "حفظ التعديلات"}
                </Button>
              </div>
            </form>
          </div>
        )}
        <footer className="mt-5 flex justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            إغلاق
          </Button>
        </footer>
      </section>
    </div>
  );
}
