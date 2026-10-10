import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Building2, Pencil, Plus, RefreshCw, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { getTelegramDisplayNumber } from "@/lib/telegramDisplay";
import { organizationTypeLabels } from "@/lib/uiLabels";
import { OrganizationTreePicker } from "@/components/OrganizationTreePicker";
import {
  canOrganizationHaveParent,
  getAllowedOrganizationChildTypes,
} from "../../../shared/organizationHierarchy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const typeLabels = organizationTypeLabels;
type OrganizationType =
  | "central"
  | "governorate"
  | "region"
  | "police_department"
  | "station"
  | "command"
  | "department"
  | "unit";
const organizationTypeOptions: OrganizationType[] = [
  "central",
  "governorate",
  "police_department",
  "department",
  "station",
  "unit",
  "region",
  "command",
];
const accountManagedTypes = new Set<OrganizationType>([
  "governorate",
  "region",
  "command",
  "police_department",
  "station",
  "department",
  "unit",
]);

type OrganizationSettingsDraft = {
  departmentName: string;
  unitName: string;
  unitChiefRank: string;
  unitChiefName: string;
  serialPrefix: string;
  incomingSerialPrefix: string;
  serialStart: number;
  incomingSerialStart: number;
  timezone: string;
  dateFormat:
    | "dd/MM/yyyy HH:mm:ss"
    | "yyyy-MM-dd HH:mm:ss"
    | "dd MMM yyyy HH:mm";
  numberSystem: "latin" | "arabic";
  logoUrl: string;
};

const emptyOrganizationSettings = (
  departmentName = ""
): OrganizationSettingsDraft => ({
  departmentName,
  unitName: "وحدة العمليات",
  unitChiefRank: "العقيد",
  unitChiefName: "رئيس الوحدة",
  serialPrefix: "POL",
  incomingSerialPrefix: "POL",
  serialStart: 1,
  incomingSerialStart: 1,
  timezone: "Asia/Damascus",
  dateFormat: "dd/MM/yyyy HH:mm:ss",
  numberSystem: "latin",
  logoUrl: "",
});

export default function OwnerOrganizationManagement() {
  const [open, setOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<
    string | null
  >(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [createdAccount, setCreatedAccount] = useState<{
    organizationName: string;
    username: string;
    password: string;
  } | null>(null);
  const [form, setForm] = useState<{
    code: string;
    name: string;
    type: OrganizationType;
    parentOrganizationId: string;
    telegramDestinationOrganizationId: string;
    isActive: boolean;
    allowHierarchyOverride: boolean;
    createAccount: boolean;
  }>({
    code: "",
    name: "",
    type: "governorate" as OrganizationType,
    parentOrganizationId: "",
    telegramDestinationOrganizationId: "",
    isActive: true,
    allowHierarchyOverride: false,
    createAccount: true,
  });
  const [settingsDraft, setSettingsDraft] = useState<OrganizationSettingsDraft>(
    () => emptyOrganizationSettings()
  );
  const [settingsQueryOrgId, setSettingsQueryOrgId] = useState<string | null>(
    null
  );
  const [accountUsername, setAccountUsername] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [settingsSaveFailedForId, setSettingsSaveFailedForId] = useState<
    string | null
  >(null);
  const organizations = trpc.organizations.all.useQuery(undefined, {
    enabled: open,
  });
  const accounts = trpc.organizations.accounts.useQuery(
    {
      organizationId:
        selectedOrganizationId ?? "00000000-0000-0000-0000-000000000000",
    },
    {
      enabled: open && Boolean(selectedOrganizationId),
    }
  );
  const allAccounts = trpc.organizations.allAccounts.useQuery(undefined, {
    enabled: open,
  });
  const organizationSettings = trpc.organizations.settings.get.useQuery(
    {
      organizationId:
        settingsQueryOrgId ?? "00000000-0000-0000-0000-000000000000",
    },
    {
      enabled: open && Boolean(settingsQueryOrgId),
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    }
  );
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
    onSuccess: result => {
      if (result.account) {
        setCreatedAccount({
          organizationName: result.organization.name,
          username: result.account.username,
          password: result.account.password,
        });
      } else {
        setCreatedAccount(null);
      }
      void utils.organizations.all.invalidate();
      void utils.organizations.allAccounts.invalidate();
    },
  });
  const update = trpc.organizations.update.useMutation({
    onSuccess: () => {
      void utils.organizations.all.invalidate();
      void utils.organizations.accounts.invalidate();
      void utils.organizations.allAccounts.invalidate();
    },
  });
  const saveOrganizationSettings =
    trpc.organizations.settings.update.useMutation();
  const provisionAccount = trpc.organizations.provisionAccount.useMutation({
    onSuccess: async result => {
      setCreatedAccount(result);
      toast.success("تم إنشاء حساب الجهة المفتوحة");
      await accounts.refetch();
    },
    onError: error => toast.error(error.message || "تعذر إنشاء حساب الجهة"),
  });

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("open-owner-organization-management", show);
    return () =>
      window.removeEventListener("open-owner-organization-management", show);
  }, []);
  useEffect(() => {
    if (!editingId || !selectedOrganizationId || !accounts.data?.length) return;
    setAccountUsername(accounts.data[0]?.username ?? "");
  }, [accounts.data, editingId, selectedOrganizationId]);

  useEffect(() => {
    const saved = organizationSettings.data;
    if (!settingsQueryOrgId || !saved) return;
    if (saved.organizationId !== settingsQueryOrgId) return;
    setSettingsDraft({
      departmentName: saved.departmentName,
      unitName: saved.unitName,
      unitChiefRank: saved.unitChiefRank,
      unitChiefName: saved.unitChiefName,
      serialPrefix: saved.serialPrefix,
      incomingSerialPrefix: saved.incomingSerialPrefix,
      serialStart: saved.serialStart,
      incomingSerialStart: saved.incomingSerialStart,
      timezone: saved.timezone,
      dateFormat: [
        "dd/MM/yyyy HH:mm:ss",
        "yyyy-MM-dd HH:mm:ss",
        "dd MMM yyyy HH:mm",
      ].includes(saved.dateFormat as OrganizationSettingsDraft["dateFormat"])
        ? (saved.dateFormat as OrganizationSettingsDraft["dateFormat"])
        : "dd/MM/yyyy HH:mm:ss",
      numberSystem: saved.numberSystem === "arabic" ? "arabic" : "latin",
      logoUrl: saved.logoUrl ?? "",
    });
  }, [organizationSettings.data, settingsQueryOrgId]);

  const resetForm = () => {
    setEditorOpen(false);
    setEditingId(null);
    setSettingsQueryOrgId(null);
    setForm({
      code: "",
      name: "",
      type: "governorate",
      parentOrganizationId: "",
      telegramDestinationOrganizationId: "",
      isActive: true,
      allowHierarchyOverride: false,
      createAccount: true,
    });
    setSettingsDraft(emptyOrganizationSettings());
    setAccountUsername("");
    setAccountPassword("");
  };
  const openEditorForCreate = (
    parentOrganizationId = "",
    type: OrganizationType = "governorate"
  ) => {
    resetForm();
    setEditorOpen(true);
    setForm(current => ({
      ...current,
      type,
      parentOrganizationId,
    }));
  };
  const openEditorForEdit = (
    item: NonNullable<typeof organizations.data>[number]
  ) => {
    const parent = (organizations.data ?? []).find(
      candidate => candidate.id === item.parentOrganizationId
    );
    setEditorOpen(true);
    setSelectedOrganizationId(item.id);
    setEditingId(item.id);
    setSettingsQueryOrgId(item.id);
    setSettingsDraft(emptyOrganizationSettings(item.name));
    setAccountUsername("");
    setAccountPassword("");
    setForm({
      code: item.code,
      name: item.name,
      type: item.type as OrganizationType,
      parentOrganizationId: item.parentOrganizationId ?? "",
      telegramDestinationOrganizationId:
        item.telegramDestinationOrganizationId ?? "",
      isActive: item.isActive,
      allowHierarchyOverride: Boolean(
        parent && !canOrganizationHaveParent(item.type, parent.type)
      ),
      createAccount: true,
    });
  };
  const excludedParentIds = useMemo(() => {
    const excluded = new Set<string>();
    if (!editingId) return excluded;
    const allOrganizations = organizations.data ?? [];
    const frontier = [editingId];
    excluded.add(editingId);
    while (frontier.length > 0) {
      const parentId = frontier.shift();
      for (const item of allOrganizations) {
        if (item.parentOrganizationId === parentId && !excluded.has(item.id)) {
          excluded.add(item.id);
          frontier.push(item.id);
        }
      }
    }
    return excluded;
  }, [organizations.data, editingId]);
  const eligibleParents = useMemo(
    () =>
      (organizations.data ?? []).filter(
        item => item.isActive && !excludedParentIds.has(item.id)
      ),
    [organizations.data, excludedParentIds]
  );
  const defaultParents = useMemo(
    () =>
      eligibleParents.filter(item =>
        canOrganizationHaveParent(form.type, item.type)
      ),
    [eligibleParents, form.type]
  );
  const selectableParentIds = useMemo(
    () =>
      new Set(
        (form.allowHierarchyOverride ? eligibleParents : defaultParents).map(
          item => item.id
        )
      ),
    [defaultParents, eligibleParents, form.allowHierarchyOverride]
  );
  const selectableDestinationIds = useMemo(
    () =>
      new Set(
        (organizations.data ?? [])
          .filter(item => item.isActive && item.id !== editingId)
          .map(item => item.id)
      ),
    [editingId, organizations.data]
  );
  const settingsLoadedForEditor =
    !editingId ||
    settingsQueryOrgId !== editingId ||
    (organizationSettings.isSuccess &&
      organizationSettings.data?.organizationId === editingId);
  const settingsRecordMissing = Boolean(
    editingId &&
      settingsQueryOrgId === editingId &&
      organizationSettings.isSuccess &&
      organizationSettings.data?.settingsExists === false
  );
  const showSettingsNotSavedWarning = Boolean(
    editingId &&
      (settingsSaveFailedForId === editingId || settingsRecordMissing)
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (form.type !== "central" && !form.parentOrganizationId) {
      toast.error("اختر الجهة الأب من الهيكل التنظيمي قبل الحفظ");
      return;
    }
    if (
      (form.type === "police_department" || form.type === "station") &&
      !form.telegramDestinationOrganizationId
    ) {
      toast.error("اختر الجهة المستلمة للبرقيات قبل الحفظ");
      return;
    }
    const input = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      type: form.type,
      parentOrganizationId: form.parentOrganizationId || null,
      telegramDestinationOrganizationId:
        form.telegramDestinationOrganizationId || null,
      allowHierarchyOverride: form.allowHierarchyOverride,
    };
    const settingsInput = {
      departmentName: settingsDraft.departmentName.trim() || form.name.trim(),
      unitName: settingsDraft.unitName.trim(),
      unitChiefRank: settingsDraft.unitChiefRank.trim(),
      unitChiefName: settingsDraft.unitChiefName.trim(),
      serialPrefix: settingsDraft.serialPrefix.trim().toUpperCase(),
      incomingSerialPrefix: settingsDraft.incomingSerialPrefix
        .trim()
        .toUpperCase(),
      serialStart: settingsDraft.serialStart,
      incomingSerialStart: settingsDraft.incomingSerialStart,
      timezone: settingsDraft.timezone.trim(),
      dateFormat: settingsDraft.dateFormat,
      numberSystem: settingsDraft.numberSystem,
      logoUrl: settingsDraft.logoUrl.trim() || null,
    };

    let organizationId = editingId;
    let organizationSaved = false;
    try {
      if (editingId) {
        const result = await update.mutateAsync({
          ...input,
          id: editingId,
          isActive: form.isActive,
          accountUsername,
          accountPassword,
        });
        organizationId = result.organization.id;
      } else {
        const result = await create.mutateAsync({
          ...input,
          createAccount: form.createAccount,
        });
        organizationId = result.organization.id;
        setEditingId(organizationId);
        setSelectedOrganizationId(organizationId);
        setAccountUsername(result.account?.username ?? "");
        setForm(current => ({
          ...current,
          code: result.organization.code,
          name: result.organization.name,
          type: result.organization.type as OrganizationType,
          parentOrganizationId: result.organization.parentOrganizationId ?? "",
          telegramDestinationOrganizationId:
            result.organization.telegramDestinationOrganizationId ?? "",
        }));
      }
      organizationSaved = true;
      if (!organizationId) {
        throw new Error("تعذر تحديد الجهة لحفظ إعداداتها");
      }
      await saveOrganizationSettings.mutateAsync({
        organizationId,
        ...settingsInput,
      });
      await utils.organizations.settings.get.invalidate({ organizationId });
      setSettingsSaveFailedForId(null);
      toast.success(
        editingId
          ? "تم حفظ الجهة وإعداداتها المستقلة"
          : "تمت إضافة الجهة وحفظ إعداداتها المستقلة"
      );
      resetForm();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "حدث خطأ غير متوقع";
      if (organizationSaved && organizationId) {
        setSettingsSaveFailedForId(organizationId);
      }
      toast.error(
        organizationSaved
          ? `تم حفظ بيانات الجهة، لكن تعذر حفظ إعداداتها: ${message}`
          : message
      );
    }
  };

  const selectedOrganization = (organizations.data ?? []).find(
    item => item.id === selectedOrganizationId
  );
  const directChildren = (organizations.data ?? []).filter(
    item => item.parentOrganizationId === selectedOrganizationId
  );
  const selectedAccounts = (allAccounts.data ?? []).filter(
    account => account.organizationId === selectedOrganizationId
  );
  const accountCountByOrganization = useMemo(() => {
    const counts = new Map<string, number>();
    for (const account of allAccounts.data ?? []) {
      counts.set(
        account.organizationId,
        (counts.get(account.organizationId) ?? 0) + 1
      );
    }
    return counts;
  }, [allAccounts.data]);
  const toggleOrganization = (id: string) => {
    setExpandedIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelectedOrganizationId(id);
  };
  const renderOrganizationTree = (
    parentId: string | null,
    depth = 0
  ): React.ReactNode =>
    (organizations.data ?? [])
      .filter(item => (item.parentOrganizationId ?? null) === parentId)
      .map(item => {
        const hasChildren = (organizations.data ?? []).some(
          child => child.parentOrganizationId === item.id
        );
        const expanded = expandedIds.has(item.id);
        const selected = selectedOrganizationId === item.id;
        return (
          <div key={item.id}>
            <div
              className={`flex min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-lg border px-2.5 py-2 sm:px-3 ${selected ? "border-primary bg-primary/5 shadow-sm" : ""}`}
              style={{ marginRight: `${Math.min(depth * 12, 48)}px` }}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-right"
                onClick={() => toggleOrganization(item.id)}
                aria-expanded={hasChildren ? expanded : undefined}
              >
                <span className="w-5 text-center text-xs text-muted-foreground">
                  {hasChildren ? (expanded ? "−" : "+") : "•"}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {item.name}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {typeLabels[item.type as OrganizationType] ?? item.type} ·{" "}
                    {item.code}
                  </span>
                  <span className="block text-[10px] text-emerald-700 dark:text-emerald-300">
                    {allAccounts.isLoading
                      ? "جارٍ تحميل الحسابات..."
                      : accountCountByOrganization.get(item.id)
                        ? `${accountCountByOrganization.get(item.id)} حساب جهة`
                        : "لا يوجد حساب جهة"}
                  </span>
                </span>
              </button>
            </div>
            {expanded && renderOrganizationTree(item.id, depth + 1)}
          </div>
        );
      });

  if (!open) return null;
  return (
    <div className="app-modal-overlay z-[75]">
      <section
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="owner-org-title"
        className="app-modal-shell min-w-0 p-3 sm:p-7"
      >
        <header className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold tracking-wide text-[#9b7c3d]">
              الهيكل التنظيمي للجهات الشرطية
            </p>
            <h2 id="owner-org-title" className="mt-1 text-xl font-bold">
              إدارة المناطق والأقسام والمخافر
            </h2>
            <p className="mt-1 break-words text-sm text-muted-foreground">
              الافتراضي: وزارة الداخلية ← المحافظة ← مديرية الريف أو قسم المدينة
              ← المخفر ← الوحدة. يستطيع المالك تخصيص علاقة الأب لكل جهة.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            className="shrink-0"
            onClick={() => openEditorForCreate()}
          >
            <Plus className="ml-1 h-4 w-4" /> إضافة جهة
          </Button>
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

        <div
          className={`mt-5 grid min-w-0 gap-5 ${editorOpen ? "lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]" : "lg:grid-cols-1"}`}
        >
          {createdAccount && (
            <div className="lg:col-span-2 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold">تم إنشاء حساب الجهة</p>
                  <p className="mt-1 text-xs">
                    {createdAccount.organizationName} — يُنصح بتغيير كلمة المرور
                    بعد أول دخول.
                  </p>
                  <dl className="mt-3 grid gap-1 font-mono text-xs sm:grid-cols-2">
                    <div>اسم المستخدم: {createdAccount.username}</div>
                    <div>كلمة المرور: {createdAccount.password}</div>
                  </dl>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setCreatedAccount(null)}
                >
                  إخفاء
                </Button>
              </div>
            </div>
          )}
          {editorOpen && (
            <form
              onSubmit={submit}
              className="min-w-0 space-y-3 rounded-xl border border-primary/20 bg-primary/[0.025] p-3 shadow-sm sm:p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {editingId ? (
                    <Pencil className="h-4 w-4 text-[#9b7c3d]" />
                  ) : (
                    <Plus className="h-4 w-4 text-[#9b7c3d]" />
                  )}
                  <h3 className="font-bold">
                    {editingId ? "تعديل الجهة" : "إضافة جهة شرطية"}
                  </h3>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="إغلاق نموذج الجهة"
                  onClick={resetForm}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <label className="grid gap-1 text-sm font-medium">
                الرمز
                <Input
                  dir="ltr"
                  value={form.code}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      code: event.target.value,
                    }))
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
                    setForm(current => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  required
                  minLength={2}
                  maxLength={255}
                  placeholder="قيادة الأمن الداخلي في محافظة دمشق"
                />
              </label>
              {editingId &&
                accountManagedTypes.has(form.type) &&
                (accounts.data?.length ?? 0) > 0 && (
                  <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-900 dark:bg-blue-950/20">
                    <p className="text-xs font-semibold text-blue-900 dark:text-blue-100">
                      بيانات حساب الجهة
                    </p>
                    <label className="grid gap-1 text-sm font-medium">
                      اسم المستخدم
                      <Input
                        dir="ltr"
                        value={accountUsername}
                        onChange={event =>
                          setAccountUsername(event.target.value)
                        }
                        required
                        minLength={3}
                        maxLength={120}
                        pattern="[a-zA-Z0-9._-]+"
                      />
                    </label>
                    <label className="grid gap-1 text-sm font-medium">
                      كلمة المرور الجديدة
                      <Input
                        dir="ltr"
                        type="password"
                        value={accountPassword}
                        onChange={event =>
                          setAccountPassword(event.target.value)
                        }
                        minLength={12}
                        maxLength={256}
                        placeholder="اتركها فارغة دون تغيير"
                      />
                      <span className="text-xs font-normal text-muted-foreground">
                        اتركها فارغة للإبقاء على كلمة المرور الحالية. عند
                        تغييرها سيُطلب من الجهة تغييرها عند أول دخول.
                      </span>
                    </label>
                  </div>
                )}
              {editingId &&
                accountManagedTypes.has(form.type) &&
                accounts.isSuccess &&
                (accounts.data?.length ?? 0) === 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs dark:border-amber-900 dark:bg-amber-950/20">
                    <span>لا يوجد حساب دخول مباشر لهذه الجهة.</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={provisionAccount.isPending}
                      onClick={() =>
                        provisionAccount.mutate({ organizationId: editingId })
                      }
                    >
                      {provisionAccount.isPending
                        ? "جارٍ الإنشاء..."
                        : "إنشاء حساب الجهة"}
                    </Button>
                  </div>
                )}
              <label className="grid gap-1 text-sm font-medium">
                المستوى
                <select
                  className="h-10 w-full min-w-0 max-w-full rounded-md border bg-background px-3 text-sm"
                  value={form.type}
                  onChange={event =>
                    setForm(current => {
                      const type = event.target.value as OrganizationType;
                      const currentParentType = (organizations.data ?? []).find(
                        item => item.id === current.parentOrganizationId
                      )?.type;
                      return {
                        ...current,
                        type,
                        parentOrganizationId:
                          type === "central" ||
                          !currentParentType ||
                          (!current.allowHierarchyOverride &&
                            !canOrganizationHaveParent(type, currentParentType))
                            ? ""
                            : current.parentOrganizationId,
                      };
                    })
                  }
                >
                  {organizationTypeOptions.map(value => (
                    <option key={value} value={value}>
                      {typeLabels[value]}
                    </option>
                  ))}
                </select>
              </label>
              {form.type !== "central" && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/20">
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={form.allowHierarchyOverride}
                      onChange={event =>
                        setForm(current => {
                          const parentType = (organizations.data ?? []).find(
                            item => item.id === current.parentOrganizationId
                          )?.type;
                          return {
                            ...current,
                            allowHierarchyOverride: event.target.checked,
                            parentOrganizationId:
                              !event.target.checked &&
                              parentType &&
                              !canOrganizationHaveParent(
                                current.type,
                                parentType
                              )
                                ? ""
                                : current.parentOrganizationId,
                          };
                        })
                      }
                    />
                    تجاوز التسلسل الافتراضي لهذه الجهة
                  </label>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    يتيح اختيار أي جهة أب نشطة. تبقى وزارة الداخلية جذرًا بلا
                    أب، ويمنع النظام ربط الجهة بنفسها أو بأحد أبنائها.
                  </p>
                </div>
              )}
              <div className="grid gap-1 text-sm font-medium">
                <span>
                  الجهة الأب{form.type === "central" ? " (جهة جذرية)" : ""}
                </span>
                <OrganizationTreePicker
                  options={(organizations.data ?? []).map(item => ({
                    ...item,
                    isSelectable: selectableParentIds.has(item.id),
                  }))}
                  value={form.parentOrganizationId}
                  disabled={form.type === "central"}
                  onValueChange={parentOrganizationId =>
                    setForm(current => ({
                      ...current,
                      parentOrganizationId,
                    }))
                  }
                  placeholder={
                    form.type === "central"
                      ? "لا تحتاج وزارة الداخلية إلى جهة أب"
                      : "اختر الجهة الأب من الهيكل التنظيمي"
                  }
                  ariaLabel="اختيار الجهة الأب"
                  emptyMessage="لا توجد جهة أب متاحة لهذا المستوى حاليًا."
                  className="h-10 text-sm"
                />
              </div>
              <div className="grid gap-1 text-sm font-medium">
                <span>الجهة التابع لها (مستلم البرقيات)</span>
                <OrganizationTreePicker
                  options={(organizations.data ?? []).map(item => ({
                    ...item,
                    isSelectable: selectableDestinationIds.has(item.id),
                  }))}
                  value={form.telegramDestinationOrganizationId}
                  onValueChange={telegramDestinationOrganizationId =>
                    setForm(current => ({
                      ...current,
                      telegramDestinationOrganizationId,
                    }))
                  }
                  placeholder={
                    form.type === "police_department" || form.type === "station"
                      ? "اختر الجهة التي تستقبل برقيات هذه الجهة"
                      : "بدون وجهة تلقائية"
                  }
                  ariaLabel="اختيار الجهة المستلمة للبرقيات"
                  allowClear={
                    form.type !== "police_department" && form.type !== "station"
                  }
                  clearLabel="إزالة الوجهة التلقائية"
                  emptyMessage="لا توجد جهة مفعّلة يمكن اختيارها كوجهة."
                  className="h-10 text-sm"
                />
                <span className="text-xs font-normal text-muted-foreground">
                  عند إرسال برقية من هذه الجهة ستنتقل تلقائيًا إلى الاختيار هنا.
                </span>
              </div>
              {editingId && (
                <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={event =>
                      setForm(current => ({
                        ...current,
                        isActive: event.target.checked,
                      }))
                    }
                  />
                  الجهة مفعلة ومتاحة للاستخدام
                </label>
              )}
              {!editingId && accountManagedTypes.has(form.type) && (
                <label className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-sm dark:border-blue-900 dark:bg-blue-950/20">
                  <input
                    type="checkbox"
                    checked={form.createAccount}
                    onChange={event =>
                      setForm(current => ({
                        ...current,
                        createAccount: event.target.checked,
                      }))
                    }
                  />
                  <span>
                    إنشاء حساب دخول لهذه الجهة الآن
                    <span className="mt-1 block text-xs text-muted-foreground">
                      يمكن إنشاء الحساب لاحقًا من بطاقة الجهة إذا أزلت هذا
                      الخيار.
                    </span>
                  </span>
                </label>
              )}
              {editingId &&
                settingsQueryOrgId === editingId &&
                organizationSettings.isError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
                    <p>
                      تعذر تحميل إعدادات هذه الجهة؛ لن يُسمح بالحفظ حتى لا
                      تُستبدل بقيم افتراضية.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => void organizationSettings.refetch()}
                    >
                      إعادة تحميل الإعدادات
                    </Button>
                  </div>
                )}
              {showSettingsNotSavedWarning && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                  {settingsSaveFailedForId === editingId ? (
                    <p>
                      بيانات الجهة محفوظة، لكن حفظ إعداداتها لم يكتمل. لا تعتبر
                      القيم الحالية محفوظة؛ أعد الحفظ وتحقق من رسالة النجاح.
                    </p>
                  ) : (
                    <p>
                      لا يوجد سجل إعدادات محفوظ لهذه الجهة بعد. القيم المعروضة
                      افتراضية مؤقتة، وسيُنشأ سجلها المستقل عند الحفظ.
                    </p>
                  )}
                </div>
              )}
              <section className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/30 p-3 dark:border-emerald-900 dark:bg-emerald-950/10">
                <div>
                  <h4 className="text-sm font-bold">
                    إعدادات مستقلة لهذه الجهة
                  </h4>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    تُحفظ على معرّف الجهة نفسها ولا تتغير بتبديل مكان عمل
                    المالك. البادئة الرقمية تحدد بداية عداد اتجاهها فقط.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs font-semibold">
                    اسم الجهة في رأس البرقية
                    <Input
                      value={settingsDraft.departmentName}
                      onChange={event =>
                        setSettingsDraft(current => ({
                          ...current,
                          departmentName: event.target.value,
                        }))
                      }
                      maxLength={255}
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold">
                    اسم الوحدة
                    <Input
                      value={settingsDraft.unitName}
                      onChange={event =>
                        setSettingsDraft(current => ({
                          ...current,
                          unitName: event.target.value,
                        }))
                      }
                      maxLength={255}
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold">
                    رتبة رئيس الوحدة
                    <Input
                      value={settingsDraft.unitChiefRank}
                      onChange={event =>
                        setSettingsDraft(current => ({
                          ...current,
                          unitChiefRank: event.target.value,
                        }))
                      }
                      maxLength={120}
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold">
                    اسم رئيس الوحدة
                    <Input
                      value={settingsDraft.unitChiefName}
                      onChange={event =>
                        setSettingsDraft(current => ({
                          ...current,
                          unitChiefName: event.target.value,
                        }))
                      }
                      maxLength={255}
                    />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs font-semibold">
                    بادئة البرقية الصادرة
                    <Input
                      dir="ltr"
                      value={settingsDraft.serialPrefix}
                      onChange={event => {
                        const serialPrefix = event.target.value.toUpperCase();
                        setSettingsDraft(current => ({
                          ...current,
                          serialPrefix,
                          serialStart: /^\d+$/.test(serialPrefix)
                            ? Number(serialPrefix)
                            : current.serialStart,
                        }));
                      }}
                      required
                      minLength={1}
                      maxLength={24}
                      pattern="[A-Z0-9-]+"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold">
                    بادئة البرقية الواردة
                    <Input
                      dir="ltr"
                      value={settingsDraft.incomingSerialPrefix}
                      onChange={event => {
                        const incomingSerialPrefix =
                          event.target.value.toUpperCase();
                        setSettingsDraft(current => ({
                          ...current,
                          incomingSerialPrefix,
                          incomingSerialStart: /^\d+$/.test(
                            incomingSerialPrefix
                          )
                            ? Number(incomingSerialPrefix)
                            : current.incomingSerialStart,
                        }));
                      }}
                      required
                      minLength={1}
                      maxLength={24}
                      pattern="[A-Z0-9-]+"
                    />
                  </label>
                </div>
                <p className="text-[11px] leading-5 text-muted-foreground">
                  يمكن ضبط البداية بكتابة رقم فقط في البادئة، مثل 718. بادئتا
                  الصادر والوارد وعدّاداهما مستقلان.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs font-semibold">
                    رقم بداية تسلسل الصادر
                    <Input
                      type="number"
                      min={1}
                      max={999999999}
                      disabled={/^\d+$/.test(settingsDraft.serialPrefix)}
                      value={settingsDraft.serialStart}
                      onChange={event =>
                        setSettingsDraft(current => ({
                          ...current,
                          serialStart: Number(event.target.value),
                        }))
                      }
                      required
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold">
                    رقم بداية تسلسل الوارد
                    <Input
                      type="number"
                      min={1}
                      max={999999999}
                      disabled={/^\d+$/.test(
                        settingsDraft.incomingSerialPrefix
                      )}
                      value={settingsDraft.incomingSerialStart}
                      onChange={event =>
                        setSettingsDraft(current => ({
                          ...current,
                          incomingSerialStart: Number(event.target.value),
                        }))
                      }
                      required
                    />
                  </label>
                </div>
                <p className="text-[11px] leading-5 text-muted-foreground">
                  عند إدخال بادئة رقمية تُستخدم هي كبداية لتسلسل الاتجاه نفسه؛
                  وإلا تُستخدم قيمة رقم البداية هنا.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs font-semibold">
                    المنطقة الزمنية (IANA)
                    <Input
                      dir="ltr"
                      value={settingsDraft.timezone}
                      onChange={event =>
                        setSettingsDraft(current => ({
                          ...current,
                          timezone: event.target.value,
                        }))
                      }
                      required
                      minLength={3}
                      maxLength={64}
                      placeholder="Asia/Damascus"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold">
                    تنسيق التاريخ والوقت
                    <select
                      className="h-10 rounded-md border bg-background px-3 text-sm font-normal"
                      value={settingsDraft.dateFormat}
                      onChange={event =>
                        setSettingsDraft(current => ({
                          ...current,
                          dateFormat: event.target
                            .value as OrganizationSettingsDraft["dateFormat"],
                        }))
                      }
                    >
                      <option value="dd/MM/yyyy HH:mm:ss">
                        22/09/2026 14:30:00
                      </option>
                      <option value="yyyy-MM-dd HH:mm:ss">
                        2026-09-22 14:30:00
                      </option>
                      <option value="dd MMM yyyy HH:mm">
                        22 سبتمبر 2026 14:30
                      </option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-semibold">
                    نظام الأرقام
                    <select
                      className="h-10 rounded-md border bg-background px-3 text-sm font-normal"
                      value={settingsDraft.numberSystem}
                      onChange={event =>
                        setSettingsDraft(current => ({
                          ...current,
                          numberSystem: event.target.value as
                            | "latin"
                            | "arabic",
                        }))
                      }
                    >
                      <option value="latin">لاتينية: 0123456789</option>
                      <option value="arabic">عربية: ٠١٢٣٤٥٦٧٨٩</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-semibold">
                    رابط شعار الجهة
                    <Input
                      dir="ltr"
                      type="url"
                      value={settingsDraft.logoUrl}
                      onChange={event =>
                        setSettingsDraft(current => ({
                          ...current,
                          logoUrl: event.target.value,
                        }))
                      }
                      maxLength={2000}
                      placeholder="https://..."
                    />
                  </label>
                </div>
              </section>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={
                    create.isPending ||
                    update.isPending ||
                    saveOrganizationSettings.isPending ||
                    !settingsLoadedForEditor
                  }
                >
                  {saveOrganizationSettings.isPending
                    ? "جارٍ حفظ الإعدادات..."
                    : editingId
                      ? "حفظ الجهة وإعداداتها"
                      : "إضافة الجهة وإعداداتها"}
                </Button>
                {editingId && (
                  <Button type="button" variant="outline" onClick={resetForm}>
                    إلغاء
                  </Button>
                )}
              </div>
            </form>
          )}

          <section className="min-w-0 rounded-xl border p-3 sm:p-4">
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
            </div>
            {organizations.isLoading && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                جارٍ تحميل الهيكل...
              </p>
            )}
            {organizations.isError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
                <p>تعذر تحميل الجهات حاليًا.</p>
                <p className="mt-1 text-xs opacity-80">
                  {organizations.error.message}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void organizations.refetch()}
                >
                  إعادة المحاولة
                </Button>
              </div>
            )}
            <div className="max-h-[560px] space-y-2 overflow-y-auto">
              {!organizations.isLoading &&
              !organizations.isError &&
              (organizations.data ?? []).length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  لا توجد جهات مسجلة في الهيكل التنظيمي.
                </p>
              ) : (
                renderOrganizationTree(null)
              )}
            </div>
            {selectedOrganization && (
              <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">
                      الجهة المفتوحة
                    </p>
                    <h4 className="text-lg font-bold">
                      {selectedOrganization.name}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      {
                        typeLabels[
                          selectedOrganization.type as OrganizationType
                        ]
                      }{" "}
                      · {selectedOrganization.code}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      openEditorForCreate(
                        selectedOrganization.id,
                        getAllowedOrganizationChildTypes(
                          selectedOrganization.type
                        )[0] ?? "department"
                      )
                    }
                  >
                    <Plus className="ml-1 h-4 w-4" /> إضافة جهة فرعية
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openEditorForEdit(selectedOrganization)}
                  >
                    <Pencil className="ml-1 h-4 w-4" /> تعديل الجهة
                  </Button>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border bg-background p-3">
                    <p className="text-xs font-semibold text-muted-foreground">
                      الأبناء المباشرون
                    </p>
                    <p className="mt-1 text-2xl font-bold">
                      {directChildren.length}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-background p-3">
                    <p className="text-xs font-semibold text-muted-foreground">
                      حسابات هذه الجهة فقط
                    </p>
                    {accounts.isLoading || allAccounts.isLoading ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        جارٍ التحميل...
                      </p>
                    ) : selectedAccounts.length ? (
                      selectedAccounts.map(account => (
                        <p
                          key={account.userId}
                          className="mt-1 font-mono text-xs"
                        >
                          {account.username}
                          {account.mustChangePassword ? " · كلمة مؤقتة" : ""}
                        </p>
                      ))
                    ) : (
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="text-xs text-amber-700">
                          لا يوجد حساب مباشر
                        </p>
                        {accountManagedTypes.has(
                          selectedOrganization.type as OrganizationType
                        ) && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={provisionAccount.isPending}
                            onClick={() =>
                              provisionAccount.mutate({
                                organizationId: selectedOrganization.id,
                              })
                            }
                          >
                            {provisionAccount.isPending
                              ? "جارٍ الإنشاء..."
                              : "إنشاء حساب هذه الجهة"}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {directChildren.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold text-muted-foreground">
                      الأبناء المباشرون
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {directChildren.map(child => (
                        <button
                          type="button"
                          key={child.id}
                          className="rounded-lg border bg-background p-3 text-right hover:border-primary"
                          onClick={() => toggleOrganization(child.id)}
                        >
                          <span className="block text-sm font-semibold">
                            {child.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {typeLabels[child.type as OrganizationType]} · فتح
                            الإدارة
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="mt-5 border-t pt-4">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-bold">
                  طلبات إحالة البرقيات بانتظار السلطة الأعلى
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
                      {getTelegramDisplayNumber(telegram?.serialCode)} —{" "}
                      {telegram?.subject}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      طلب من {from?.name ?? "جهة"} إلى {to?.name ?? "جهة"} — لا
                      ينتقل إلا بعد اعتماد السلطة الأعلى
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
                            reason: "اعتماد السلطة الأعلى",
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
                        onClick={() => {
                          const reason = window
                            .prompt("أدخل سبب رفض الإحالة (إلزامي):")
                            ?.trim();
                          if (!reason) return;
                          approveRoute.mutate({
                            routeId: Number(route.id),
                            approved: false,
                            reason,
                          });
                        }}
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
