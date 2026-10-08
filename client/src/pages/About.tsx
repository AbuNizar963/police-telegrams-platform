import { useLocation } from "wouter";
import {
  ArrowRight,
  CheckCircle2,
  Fingerprint,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BrandMark } from "@/components/BrandMark";

const features = [
  {
    icon: ShieldCheck,
    title: "سلامة السجل",
    label: "الهوية الرقمية مفعلة",
    description:
      "كل برقية تُربط بحساب منشئها وتوقيتها وسجل التدقيق. الأرشفة الإدارية متاحة للمالك فقط ويُسجل في سجل التدقيق.",
    tone: "text-[#d8c38e] bg-[#d8c38e]/15",
  },
  {
    icon: CheckCircle2,
    title: "حماية تشغيلية نشطة",
    label: "صلاحيات ومسارات موثقة",
    description:
      "صلاحيات واضحة ومسارات عمل موثقة مع تسجيل الإجراءات الحساسة في سجل التدقيق.",
    tone: "text-emerald-600 bg-emerald-500/10",
  },
  {
    icon: Fingerprint,
    title: "هوية موثوقة",
    label: "تتبع كامل لكل إجراء",
    description:
      "تُحفظ هوية منشئ البرقية وإجراءات الإدارة لتوفير سجل واضح وقابل للمراجعة.",
    tone: "text-sky-600 bg-sky-500/10",
  },
  {
    icon: LockKeyhole,
    title: "جلسة دخول مستمرة",
    label: "30 يومًا لكل مستخدم",
    description:
      "يبقى تسجيل الدخول فعالًا لمدة 30 يومًا، وينتهي فورًا عند اختيار تسجيل الخروج.",
    tone: "text-violet-600 bg-violet-500/10",
  },
];

export default function About() {
  const [, navigate] = useLocation();

  return (
    <main
      dir="rtl"
      className="mx-auto w-full max-w-5xl space-y-6 p-4 pb-12 sm:p-6"
    >
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
            إعدادات النظام
          </p>
          <h1 className="text-2xl font-bold tracking-tight">حول النظام</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ميزات النظام التي تحافظ على موثوقية البرقيات وسلامة التشغيل.
          </p>
        </div>
      </div>

      <Card className="overflow-hidden border-[#203b62] bg-[#10233f] text-white shadow-sm">
        <CardHeader className="border-b border-white/10 bg-white/[0.03]">
          <CardTitle className="text-white">ميزات النظام</CardTitle>
          <CardDescription className="text-slate-300">
            حماية موحدة للهوية والسجل والإجراءات التشغيلية.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
          {features.map(feature => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-4"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${feature.tone}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {feature.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-300">
                      {feature.label}
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-7 text-slate-300">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </main>
  );
}
