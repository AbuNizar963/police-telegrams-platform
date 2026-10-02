import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Building2, Database, Plus, RefreshCw, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const typeLabels = {
  central: "المركز الرئيسي",
  governorate: "قيادة المحافظة",
  region: "قيادة المنطقة",
  police_department: "قسم الشرطة",
  station: "مخفر الشرطة",
  command: "قيادة",
  department: "إدارة",
  unit: "وحدة",
} as const;
type OrganizationType = keyof typeof typeLabels;

export default function OwnerOrganizationManagement() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: "",
    name: "",
    type: "governorate" as OrganizationType,
    parentOrganizationId: "",
  });
  const organizations = trpc.organizations.all.useQuery(undefined, {
    enabled: open,
  });
  const pendingApprovals = trpc.organizations.pendingApprovals.useQuery(
    undefined,
    {
      enabled: open,
    }
  );
  const utils = trpc.useUtils();
  const approveRoute = trpc.telegrams.approveRoute.useMutation({
    onSuccess: async (_route, input) => {
      toast.success(
        input.approved ? "تم اعتماد الإحالة ونقل البرقية" : "تم رفض الإحالة"
      );
      await utils.organizations.pendingApprovals.invalidate();
    },
    onError: error => toast.error(error.message || "تعذر تسجيل قرار الإحالة"),
  });
  const create = trpc.organizations.create.useMutation({
    onSuccess: async () => {
      toast.success("تمت إضافة الجهة إلى الهيكل الشرطي");
      resetForm();
      await utils.organizations.all.invalidate();
    },
    onError: error => toast.error(error.message || "تعذر إضافة الجهة"),
  });
  const update = trpc.organizations.update.useMutation({
    onSuccess: async () => {
      toast.success("تم تحديث الجهة");
      resetForm();
      await utils.organizations.all.invalidate();
    },
    onError: error => toast.error(error.message || "تعذر تحديث الجهة"),
  });
  const seed = trpc.organizations.seedSyrianGovernorates.useMutation({
    onSuccess: async result => {
      toast.success(`تم تجهيز ${result.length} قيادة محافظة سورية`);
      await utils.organizations.all.invalidate();
    },
    onError: error => toast.error(error.message || "تعذر تجهيز المحافظات"),
  });

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("open-owner-organization-management", show);
    return () =>
      window.removeEventListener("open-owner-organization-management", show);
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setForm({
      code: "",
      name: "",
      type: "governorate",
      parentOrganizationId: "",
    });
  };
  const parents = useMemo(
    () =>
      (organizations.data ?? []).filter(
        item => item.isActive && item.id !== editingId
      ),
    [organizations.data, editingId]
  );
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const input = {
      id: editingId ?? undefined,
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      type: form.type,
      parentOrganizationId: form.parentOrganizationId || null,
    };
    if (editingId) update.mutate({ ...input, id: editingId, isActive: true });
    else create.mutate(input);
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-5">
      <section
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="owner-org-title"
        className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-t-2xl bg-background p-5 shadow-2xl sm:rounded-2xl sm:p-7"
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-wide text-[#9b7c3d]">
              POLICE ORGANIZATION HIERARCHY
            </p>
            <h2 id="owner-org-title" className="mt-1 text-xl font-bold">
              إدارة المناطق والأقسام والمخافر
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              المركز الرئيسي ← المحافظة ← قيادة المنطقة ← قسم الشرطة ← المخفر.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setOpen(false)}
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" />
          </Button>
        </header>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          <form onSubmit={submit} className="space-y-3 rounded-xl border p-4">
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-[#9b7c3d]" />
              <h3 className="font-bold">
                {editingId ? "تعديل جهة" : "إضافة جهة شرطية"}
              </h3>
            </div>
            <label className="grid gap-1 text-sm font-medium">
              الرمز
              <Input
                dir="ltr"
                value={form.code}
                onChange={event =>
                  setForm(current => ({ ...current, code: event.target.value }))
                }
                required
                minLength={2}
                maxLength={64}
                placeholder="GOV-DAMASCUS"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              اسم الجهة
              <Input
                value={form.name}
                onChange={event =>
                  setForm(current => ({ ...current, name: event.target.value }))
                }
                required
                minLength={2}
                maxLength={255}
                placeholder="قيادة شرطة محافظة دمشق"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              المستوى
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={form.type}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    type: event.target.value as OrganizationType,
                  }))
                }
              >
                {Object.entries(typeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              الجهة الأب
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={form.parentOrganizationId}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    parentOrganizationId: event.target.value,
                  }))
                }
                required
              >
                <option value="">اختر الجهة الأب</option>
                {parents.map(item => (
                  <option key={item.id} value={item.id}>
                    {typeLabels[item.type as OrganizationType] ?? item.type} —{" "}
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="rounded-lg bg-blue-500/10 p-3 text-xs leading-5 text-blue-800 dark:text-blue-200">
              يمنع الخادم اختيار جهة أب غير متوافقة مع المستوى التنظيمي، ولا
              يمكن تجاوز قيادة المحافظة في الإحالات العابرة للمناطق.
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={create.isPending || update.isPending}
              >
                {editingId ? "حفظ التعديل" : "إضافة الجهة"}
              </Button>
              {editingId && (
                <Button type="button" variant="outline" onClick={resetForm}>
                  إلغاء
                </Button>
              )}
            </div>
          </form>

          <section className="rounded-xl border p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Building2 className="h-4 w-4 text-[#9b7c3d]" />
              <h3 className="font-bold">الهيكل التنظيمي</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mr-auto"
                onClick={() => void organizations.refetch()}
              >
                <RefreshCw className="ml-1 h-3.5 w-3.5" /> تحديث
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => seed.mutate()}
                disabled={seed.isPending}
              >
                <Database className="ml-1 h-3.5 w-3.5" /> تجهيز محافظات سوريا
              </Button>
            </div>
            {organizations.isLoading && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                جارٍ تحميل الهيكل...
              </p>
            )}
            <div className="max-h-[560px] space-y-2 overflow-y-auto">
              {(organizations.data ?? []).map(item => {
                const parent = organizations.data?.find(
                  candidate => candidate.id === item.parentOrganizationId
                );
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {item.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {typeLabels[item.type as OrganizationType] ?? item.type}{" "}
                        · {item.code}
                        {parent ? ` · الأب: ${parent.name}` : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingId(item.id);
                        setForm({
                          code: item.code,
                          name: item.name,
                          type: item.type as OrganizationType,
                          parentOrganizationId: item.parentOrganizationId ?? "",
                        });
                      }}
                    >
                      تعديل
                    </Button>
                  </div>
                );
              })}
            </div>
            <div className="mt-5 border-t pt-4">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-bold">
                  طلبات الإحالة العابرة للمناطق
                </h4>
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700">
                  {pendingApprovals.data?.length ?? 0}
                </span>
              </div>
              {pendingApprovals.data?.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  لا توجد طلبات معلقة.
                </p>
              )}
              {pendingApprovals.data?.map(route => {
                const telegram = route.telegrams as {
                  serialCode?: string;
                  subject?: string;
                } | null;
                const from = route.fromOrganization as { name?: string } | null;
                const to = route.toOrganization as { name?: string } | null;
                return (
                  <div
                    key={String(route.id)}
                    className="mb-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/50 dark:bg-amber-950/20"
                  >
                    <p className="text-sm font-semibold">
                      {telegram?.serialCode} — {telegram?.subject}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      من {from?.name ?? "جهة"} إلى {to?.name ?? "جهة"}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={approveRoute.isPending}
                        onClick={() =>
                          approveRoute.mutate({
                            routeId: Number(route.id),
                            approved: true,
                            reason: "اعتماد قيادة المحافظة",
                          })
                        }
                      >
                        اعتماد ونقل
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={approveRoute.isPending}
                        onClick={() =>
                          approveRoute.mutate({
                            routeId: Number(route.id),
                            approved: false,
                            reason: "رفض وفق التسلسل الإداري",
                          })
                        }
                      >
                        رفض
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
