import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OrganizationTreePicker } from "@/components/OrganizationTreePicker";
import { organizationTypeLabels } from "@/lib/uiLabels";
import {
  Building2,
  CheckCircle2,
  Pencil,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";

type ManagedUser = {
  id: number;
  organizationId: string | null;
  organizationName: string | null;
  username: string | null;
  name: string | null;
  badgeNumber: string | null;
  phone: string | null;
  rank: string | null;
  unit: string | null;
  role: string;
  loginMethod: string | null;
};

type ManagedOrganization = {
  id: string;
  name: string;
  code: string;
  type: string;
  parentOrganizationId: string | null;
  isActive: boolean;
};

type EditForm = {
  name: string;
  username: string;
  badgeNumber: string;
  phone: string;
  rank: string;
  unit: string;
  password: string;
};

type OrganizationUserGroup = {
  id: string;
  organization: ManagedOrganization | null;
  path: string;
  users: ManagedUser[];
};

const emptyEditForm: EditForm = {
  name: "",
  username: "",
  badgeNumber: "",
  phone: "",
  rank: "",
  unit: "",
  password: "",
};

function matchesUserSearch(user: ManagedUser, query: string): boolean {
  if (!query) return true;
  return [
    user.name,
    user.username,
    user.badgeNumber,
    user.phone,
    user.rank,
    user.unit,
  ]
    .filter(Boolean)
    .some(value => String(value).toLocaleLowerCase("ar").includes(query));
}

export default function OwnerUserManagement() {
  const [open, setOpen] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [badgeNumber, setBadgeNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [rank, setRank] = useState("");
  const [unit, setUnit] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(emptyEditForm);
  const [enablePassword, setEnablePassword] = useState<Record<number, string>>(
    {}
  );

  const users = trpc.userManagement.list.useQuery(undefined, {
    enabled: open,
    refetchOnWindowFocus: false,
  });
  const organizations = trpc.organizations.all.useQuery(undefined, {
    enabled: open,
    refetchOnWindowFocus: false,
  });
  const utils = trpc.useUtils();

  const managedUsers = (users.data ?? []) as ManagedUser[];
  const managedOrganizations = (organizations.data ??
    []) as ManagedOrganization[];
  const organizationById = useMemo(
    () =>
      new Map(
        managedOrganizations.map(organization => [
          organization.id,
          organization,
        ])
      ),
    [managedOrganizations]
  );
  const organizationPathById = useMemo(() => {
    const paths = new Map<string, string>();
    for (const organization of managedOrganizations) {
      const segments = [organization.name];
      const visited = new Set([organization.id]);
      let parentId = organization.parentOrganizationId;
      while (parentId && !visited.has(parentId)) {
        const parent = organizationById.get(parentId);
        if (!parent) break;
        segments.unshift(parent.name);
        visited.add(parent.id);
        parentId = parent.parentOrganizationId;
      }
      paths.set(organization.id, segments.join(" ← "));
    }
    return paths;
  }, [managedOrganizations, organizationById]);

  const userGroups = useMemo(() => {
    const usersByOrganization = new Map<string, ManagedUser[]>();
    for (const user of managedUsers) {
      const organizationId = user.organizationId ?? "unassigned";
      const group = usersByOrganization.get(organizationId) ?? [];
      group.push(user);
      usersByOrganization.set(organizationId, group);
    }

    const groups: OrganizationUserGroup[] = managedOrganizations
      .map(organization => ({
        id: organization.id,
        organization,
        path: organizationPathById.get(organization.id) ?? organization.name,
        users: (usersByOrganization.get(organization.id) ?? []).sort(
          (left, right) =>
            (left.name ?? "").localeCompare(right.name ?? "", "ar")
        ),
      }))
      .sort((left, right) => left.path.localeCompare(right.path, "ar"));

    const unassignedUsers = usersByOrganization.get("unassigned") ?? [];
    if (unassignedUsers.length > 0) {
      groups.push({
        id: "unassigned",
        organization: null,
        path: "حسابات بحاجة إلى مراجعة",
        users: unassignedUsers.sort((left, right) =>
          (left.name ?? "").localeCompare(right.name ?? "", "ar")
        ),
      });
    }
    return groups;
  }, [managedOrganizations, managedUsers, organizationPathById]);

  const visibleGroups = useMemo(() => {
    const query = userSearch.trim().toLocaleLowerCase("ar");
    return userGroups
      .map(group => ({
        ...group,
        users: group.users.filter(user => matchesUserSearch(user, query)),
      }))
      .filter(group => group.users.length > 0 || !query);
  }, [userGroups, userSearch]);

  const selectedOrganization = organizationById.get(selectedOrganizationId);

  const resetCreateFields = () => {
    setName("");
    setUsername("");
    setPassword("");
    setBadgeNumber("");
    setPhone("");
    setRank("");
    setUnit("");
  };

  const openCreateForm = (organizationId = "") => {
    resetCreateFields();
    setSelectedOrganizationId(organizationId);
    setShowCreateForm(true);
  };

  const createUser = trpc.userManagement.create.useMutation({
    onSuccess: async (_result, variables) => {
      toast.success("تم إنشاء الحساب وربطه بالجهة المحددة");
      resetCreateFields();
      setSelectedOrganizationId(variables.organizationId);
      await utils.userManagement.list.invalidate();
    },
    onError: error => toast.error(error.message || "تعذر إنشاء الحساب"),
  });
  const updateUser = trpc.userManagement.update.useMutation({
    onSuccess: async () => {
      toast.success("تم تحديث بيانات الحساب");
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
  const deleteUser = trpc.userManagement.delete.useMutation({
    onSuccess: async () => {
      toast.success("تم حذف الحساب نهائيًا");
      await utils.userManagement.list.invalidate();
    },
    onError: error => toast.error(error.message || "تعذر حذف الحساب"),
  });

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("open-owner-user-management", show);
    return () => window.removeEventListener("open-owner-user-management", show);
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedOrganizationId) {
      toast.error("اختر الجهة التي سينتمي إليها الحساب قبل الإنشاء");
      return;
    }
    createUser.mutate({
      organizationId: selectedOrganizationId,
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
        className="app-modal-shell max-w-6xl p-4 sm:p-7"
      >
        <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#10233f] text-[#d8c38e]">
                <Users className="h-5 w-5" />
              </span>
              <div>
                <h2 id="owner-users-title" className="text-xl font-bold">
                  حسابات الجهات
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  لكل جهة مساحة مستقلة تعرض حساباتها وصلاحياتها التشغيلية.
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              className="gap-2 bg-[#10233f] text-white hover:bg-[#18375f]"
              onClick={() => openCreateForm()}
              aria-expanded={showCreateForm}
            >
              <UserPlus className="h-4 w-4" />
              إضافة حساب
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="إغلاق"
              onClick={() => setOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </header>

        {showCreateForm && (
          <form
            onSubmit={submit}
            className="mt-5 space-y-4 rounded-2xl border border-[#b49a55]/45 bg-[#fffaf0]/70 p-4 shadow-sm dark:bg-[#2d281b]/40 sm:p-5"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="flex items-center gap-2 font-bold">
                  <UserPlus className="h-4 w-4 text-[#9b7c3d]" />
                  إنشاء حساب ضمن جهة محددة
                </h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  سيشاهد الحساب جميع البرقيات والسجلات الخاصة بالجهة المختارة،
                  وليس سجلات جهات أخرى.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowCreateForm(false)}
              >
                إخفاء النموذج
              </Button>
            </div>

            <div className="rounded-xl border border-[#b4945a]/30 bg-background/70 p-3">
              <label className="grid gap-1.5 text-sm font-semibold">
                جهة الحساب
                <OrganizationTreePicker
                  options={managedOrganizations.map(organization => ({
                    ...organization,
                    isSelectable: organization.isActive,
                  }))}
                  value={selectedOrganizationId}
                  onValueChange={setSelectedOrganizationId}
                  placeholder="اختر الجهة التي سيعمل فيها الحساب"
                  ariaLabel="اختيار جهة الحساب"
                  emptyMessage="لا توجد جهات مفعلة متاحة لإنشاء حسابات."
                />
              </label>
              <p className="mt-2 text-xs text-muted-foreground">
                {selectedOrganization
                  ? `الحساب الجديد سيُربط بـ ${selectedOrganization.name}.`
                  : "الاختيار إلزامي لضمان ظهور سجلات الجهة للحساب الجديد."}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
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
              <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
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
                  سيُطلب تغييرها عند أول دخول.
                </span>
              </label>
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
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                القسم أو المخفر
                <Input
                  value={unit}
                  onChange={event => setUnit(event.target.value)}
                  maxLength={255}
                  placeholder="اختياري"
                />
              </label>
            </div>
            <div className="flex items-start gap-2 rounded-xl bg-emerald-500/10 p-3 text-xs leading-5 text-emerald-900 dark:text-emerald-200">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              يُنشأ الحساب بصلاحيات تشغيلية داخل جهة واحدة؛ تُسجّل جميع عملياته
              بهويته الرقمية وتبقى البرقيات مشتركة بين أفراد الجهة.
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                className="min-w-48 bg-[#10233f] text-white hover:bg-[#18375f]"
                disabled={
                  createUser.isPending ||
                  !selectedOrganizationId ||
                  name.trim().length < 2 ||
                  username.trim().length < 3 ||
                  password.length < 12
                }
              >
                {createUser.isPending ? "جارٍ إنشاء الحساب..." : "إنشاء الحساب"}
              </Button>
            </div>
          </form>
        )}

        <section className="mt-5 min-w-0">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-bold">الحسابات بحسب الجهة</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                تظهر الجهات الفارغة أيضًا لتتمكن من إضافة حساب مباشرةً إليها.
              </p>
            </div>
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={userSearch}
                onChange={event => setUserSearch(event.target.value)}
                placeholder="بحث داخل حسابات جميع الجهات"
                aria-label="البحث في حسابات المستخدمين"
                className="pr-9"
              />
            </div>
          </div>

          {users.isLoading || organizations.isLoading ? (
            <p className="rounded-2xl border py-12 text-center text-sm text-muted-foreground">
              جارٍ تحميل حسابات الجهات...
            </p>
          ) : users.isError || organizations.isError ? (
            <div
              role="alert"
              className="rounded-2xl border border-destructive/30 py-8 text-center text-sm text-destructive"
            >
              {users.error?.message ||
                organizations.error?.message ||
                "تعذر تحميل حسابات الجهات"}
              <div className="mt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void users.refetch();
                    void organizations.refetch();
                  }}
                >
                  إعادة المحاولة
                </Button>
              </div>
            </div>
          ) : visibleGroups.length === 0 ? (
            <p className="rounded-2xl border border-dashed py-12 text-center text-sm text-muted-foreground">
              لا توجد حسابات مطابقة لعبارة البحث.
            </p>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {visibleGroups.map(group => {
                const organization = group.organization;
                return (
                  <article
                    key={group.id}
                    className="overflow-hidden rounded-2xl border bg-card shadow-sm"
                  >
                    <header className="flex items-start justify-between gap-3 border-b bg-muted/25 p-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#10233f]/10 text-[#9b7c3d]">
                          <Building2 className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <h4 className="truncate font-bold">
                            {organization?.name ?? "حسابات بحاجة إلى مراجعة"}
                          </h4>
                          <p className="mt-1 truncate text-[11px] text-muted-foreground">
                            {organization
                              ? `${organizationTypeLabels[organization.type] ?? organization.type} · ${organization.code}`
                              : "هذه الحسابات لا تملك جهة مرتبطة"}
                          </p>
                          {organization && (
                            <p className="mt-1 truncate text-[10px] text-muted-foreground">
                              {group.path}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <span className="rounded-full bg-background px-2 py-1 text-[11px] font-semibold tabular-nums">
                          {group.users.length} حساب
                        </span>
                        {organization ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            disabled={!organization.isActive}
                            onClick={() => openCreateForm(organization.id)}
                          >
                            <UserPlus className="ml-1 h-3.5 w-3.5" />
                            إضافة حساب
                          </Button>
                        ) : null}
                      </div>
                    </header>

                    {organization && !organization.isActive && (
                      <p className="border-b bg-amber-500/10 px-4 py-2 text-xs text-amber-800 dark:text-amber-200">
                        الجهة غير مفعّلة؛ لا يمكن إنشاء حسابات جديدة لها حتى
                        تفعيلها.
                      </p>
                    )}

                    <div className="divide-y">
                      {group.users.length === 0 ? (
                        <div className="p-8 text-center text-sm text-muted-foreground">
                          <p>لا توجد حسابات لهذه الجهة بعد.</p>
                          {organization?.isActive && (
                            <Button
                              type="button"
                              variant="link"
                              className="mt-2 h-auto p-0 text-[#7a5c1e]"
                              onClick={() => openCreateForm(organization.id)}
                            >
                              أنشئ أول حساب لهذه الجهة
                            </Button>
                          )}
                        </div>
                      ) : (
                        group.users.map(user => (
                          <div key={user.id} className="p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="truncate text-sm font-semibold">
                                    {user.name ?? "حساب بلا اسم"}
                                  </p>
                                  {user.loginMethod !== "disabled" ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                                      <CheckCircle2 className="h-3 w-3" />
                                      مفعّل
                                    </span>
                                  ) : (
                                    <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-300">
                                      معطّل
                                    </span>
                                  )}
                                </div>
                                <p
                                  dir="ltr"
                                  className="mt-1 truncate text-right font-mono text-xs text-muted-foreground"
                                >
                                  @{user.username ?? "—"}
                                </p>
                                <p className="mt-2 text-xs leading-5 text-muted-foreground">
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
                                      : "rounded-md bg-sky-500/10 px-2 py-1 text-[10px] font-semibold text-sky-700 dark:text-sky-300"
                                  }
                                >
                                  {user.role === "admin" ? "مالك" : "حساب جهة"}
                                </span>
                                {user.role !== "admin" && (
                                  <div className="flex items-center gap-1">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-emerald-700 hover:bg-emerald-500/10"
                                      title="تعديل الحساب"
                                      aria-label={`تعديل حساب ${user.name ?? user.username ?? "المستخدم"}`}
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
                                          aria-label={`كلمة مرور جديدة لـ ${user.name ?? user.username ?? "الحساب"}`}
                                          type="password"
                                          className="h-8 w-32"
                                          placeholder="كلمة مرور (12+)"
                                          minLength={12}
                                          value={enablePassword[user.id] ?? ""}
                                          onChange={event =>
                                            setEnablePassword(current => ({
                                              ...current,
                                              [user.id]: event.target.value,
                                            }))
                                          }
                                        />
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 text-blue-700 hover:bg-blue-500/10"
                                          title="إعادة تفعيل الحساب"
                                          aria-label={`إعادة تفعيل ${user.name ?? user.username ?? "الحساب"}`}
                                          disabled={
                                            (enablePassword[user.id] ?? "")
                                              .length < 12 ||
                                            enableUser.isPending
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
                                      <>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 text-red-700 hover:bg-red-500/10"
                                          title="تعطيل الحساب"
                                          aria-label={`تعطيل حساب ${user.name ?? user.username ?? "المستخدم"}`}
                                          onClick={() => {
                                            const label =
                                              user.name ??
                                              user.username ??
                                              "هذا الحساب";
                                            if (
                                              window.confirm(
                                                `هل تريد تعطيل حساب ${label}؟ لن تُحذف البرقيات أو السجلات المرتبطة به، ويمكن إعادة تفعيله لاحقًا.`
                                              )
                                            ) {
                                              disableUser.mutate({
                                                id: user.id,
                                              });
                                            }
                                          }}
                                          disabled={
                                            disableUser.isPending ||
                                            deleteUser.isPending
                                          }
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 text-red-900 hover:bg-red-900/10 dark:text-red-300"
                                          title="حذف نهائي"
                                          aria-label={`حذف حساب ${user.name ?? user.username ?? "المستخدم"} نهائيًا`}
                                          onClick={() => {
                                            const label =
                                              user.name ??
                                              user.username ??
                                              "هذا الحساب";
                                            if (
                                              window.confirm(
                                                `سيتم حذف حساب ${label} نهائيًا. إذا كان مرتبطًا ببرقيات أو سجل تدقيق سيُرفض الحذف حفاظًا على السجلات. هل تريد المتابعة؟`
                                              )
                                            ) {
                                              deleteUser.mutate({
                                                id: user.id,
                                              });
                                            }
                                          }}
                                          disabled={
                                            deleteUser.isPending ||
                                            disableUser.isPending
                                          }
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {editing && (
          <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4">
            <form
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-user-title"
              dir="rtl"
              onSubmit={event => {
                event.preventDefault();
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
              className="max-h-[calc(100dvh-2rem)] w-full max-w-lg space-y-3 overflow-y-auto rounded-2xl bg-background p-5 shadow-xl"
            >
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <h3 id="edit-user-title" className="text-lg font-bold">
                    تعديل بيانات الحساب
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    التعديل لا يغيّر جهة الحساب أو سجلات البرقيات المرتبطة بها.
                  </p>
                </div>
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
                    onChange={event =>
                      setEditForm(current => ({
                        ...current,
                        [key]: event.target.value,
                      }))
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
                  onChange={event =>
                    setEditForm(current => ({
                      ...current,
                      password: event.target.value,
                    }))
                  }
                  minLength={editForm.password ? 12 : undefined}
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
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
      </section>
    </div>
  );
}
