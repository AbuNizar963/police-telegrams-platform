import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import {
  ArrowRight,
  LockKeyhole,
  LogOut,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { BrandMark } from "@/components/BrandMark";

export default function Profile() {
  const [, navigate] = useLocation();
  const { refresh, logout } = useAuth();
  const utils = trpc.useUtils();
  const { data: profile, isLoading, error } = trpc.profile.get.useQuery();
  const [name, setName] = useState("");
  const [badgeNumber, setBadgeNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [rank, setRank] = useState("");
  const [unit, setUnit] = useState("");
  const [bio, setBio] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (!profile) return;
    setName(profile.name ?? "");
    setBadgeNumber(profile.badgeNumber ?? "");
    setPhone(profile.phone ?? "");
    setRank(profile.rank ?? "");
    setUnit(profile.unit ?? "");
    setBio(profile.bio ?? "");
  }, [profile]);

  const saveProfile = trpc.profile.update.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.profile.get.invalidate(), refresh()]);
      toast.success("تم حفظ بيانات الملف الشخصي");
    },
    onError: e => toast.error(e.message || "تعذر حفظ الملف الشخصي"),
  });
  const changePassword = trpc.profile.changePassword.useMutation({
    onSuccess: async () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      await Promise.all([utils.profile.get.invalidate(), refresh()]);
      toast.success("تم تغيير كلمة المرور بنجاح");
    },
    onError: e => toast.error(e.message || "تعذر تغيير كلمة المرور"),
  });

  const submitProfile = (event: FormEvent) => {
    event.preventDefault();
    saveProfile.mutate({
      name: name.trim(),
      badgeNumber: badgeNumber.trim() || null,
      phone: phone.trim() || null,
      rank: rank.trim() || null,
      unit: unit.trim() || null,
      bio: bio.trim() || null,
    });
  };

  const submitPassword = (event: FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("تأكيد كلمة المرور غير مطابق");
      return;
    }
    changePassword.mutate({ currentPassword, newPassword });
  };

  if (isLoading)
    return (
      <div
        dir="rtl"
        className="mx-auto max-w-4xl p-6 text-center text-muted-foreground"
      >
        جارٍ تحميل الملف الشخصي…
      </div>
    );
  if (error || !profile)
    return (
      <div
        dir="rtl"
        className="mx-auto max-w-4xl p-6 text-center text-destructive"
      >
        تعذر تحميل الملف الشخصي. حدّث الصفحة وحاول مجددًا.
      </div>
    );

  return (
    <main
      dir="rtl"
      className="mx-auto w-full max-w-5xl space-y-6 p-4 pb-12 sm:p-6"
    >
      {profile.mustChangePassword && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-7 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          هذه كلمة مرور مؤقتة للحساب الرئيسي للجهة. يجب تغييرها قبل متابعة
          العمل.
        </div>
      )}
      <div className="flex items-center gap-3">
        <BrandMark size="sm" />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="العودة"
          onClick={() => navigate("/")}
        >
          <ArrowRight className="h-5 w-5" />
        </Button>
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground">
            إعدادات الحساب
          </p>
          <h1 className="text-2xl font-bold tracking-tight">الملف الشخصي</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            إدارة بياناتك الشخصية ومعلوماتك الوظيفية وأمان الحساب.
          </p>
        </div>
      </div>

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <UserRound className="h-6 w-6" />
            </div>
            <div>
              <CardTitle>المعلومات الشخصية</CardTitle>
              <CardDescription>
                تُحفظ التعديلات على حسابك فقط ولا تغيّر سجلات البرقيات السابقة.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5 sm:p-6">
          <form onSubmit={submitProfile} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                الاسم الكامل
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  minLength={2}
                  maxLength={255}
                  autoComplete="name"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                الرقم الوظيفي
                <Input
                  value={badgeNumber}
                  onChange={e => setBadgeNumber(e.target.value)}
                  maxLength={80}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                رقم الهاتف
                <Input
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  maxLength={32}
                  type="tel"
                  autoComplete="tel"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                الرتبة
                <Input
                  value={rank}
                  onChange={e => setRank(e.target.value)}
                  maxLength={120}
                  placeholder="مثال: رقيب أول"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium sm:col-span-2">
                القسم أو الوحدة
                <Input
                  value={unit}
                  onChange={e => setUnit(e.target.value)}
                  maxLength={255}
                />
              </label>
            </div>
            <label className="grid gap-2 text-sm font-medium">
              نبذة تعريفية
              <Textarea
                value={bio}
                onChange={e => setBio(e.target.value)}
                maxLength={1000}
                rows={4}
                placeholder="أضف نبذة مختصرة (اختياري)"
              />
            </label>
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={saveProfile.isPending || name.trim().length < 2}
              >
                <Save className="ml-2 h-4 w-4" />
                {saveProfile.isPending ? "جارٍ الحفظ…" : "حفظ البيانات"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <CardTitle>أمان الحساب</CardTitle>
              <CardDescription>
                استخدم كلمة مرور قوية ولا تشاركها مع أي شخص.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5 sm:p-6">
          <form onSubmit={submitPassword} className="space-y-4">
            <label className="grid gap-2 text-sm font-medium">
              كلمة المرور الحالية
              <Input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                required
                maxLength={256}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                كلمة المرور الجديدة
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  minLength={12}
                  maxLength={256}
                />
                <span className="text-xs font-normal text-muted-foreground">
                  12 محرفًا على الأقل.
                </span>
              </label>
              <label className="grid gap-2 text-sm font-medium">
                تأكيد كلمة المرور
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  minLength={12}
                  maxLength={256}
                />
              </label>
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                variant="outline"
                disabled={
                  changePassword.isPending ||
                  !currentPassword ||
                  newPassword.length < 12 ||
                  newPassword !== confirmPassword
                }
              >
                <LockKeyhole className="ml-2 h-4 w-4" />
                {changePassword.isPending
                  ? "جارٍ التحديث…"
                  : "تغيير كلمة المرور"}
              </Button>
            </div>
          </form>
          <div className="mt-6 flex items-center justify-between gap-4 border-t pt-5">
            <div>
              <p className="text-sm font-semibold">إنهاء الجلسة</p>
              <p className="mt-1 text-xs text-muted-foreground">
                يُسجّل خروجك من هذا الجهاز فورًا حتى قبل انتهاء مدة الشهر.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 text-destructive hover:text-destructive"
              onClick={async () => {
                await logout();
                navigate("/");
              }}
            >
              <LogOut className="ml-2 h-4 w-4" />
              تسجيل الخروج
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
