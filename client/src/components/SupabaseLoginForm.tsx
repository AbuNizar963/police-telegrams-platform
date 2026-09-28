import { supabase } from "@/lib/supabase";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useState } from "react";

type SupabaseLoginFormProps = {
  onSuccess?: () => void;
};

export function SupabaseLoginForm({ onSuccess }: SupabaseLoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const client = supabase;
  if (!client) return null;

  const submit = async () => {
    if (!email.trim() || password.length < 6) {
      setMessage("أدخل بريداً إلكترونياً وكلمة مرور من 6 محارف على الأقل.");
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const result = isSignUp
        ? await client.auth.signUp({
            email: email.trim(),
            password,
            options: { data: { full_name: email.trim().split("@")[0] } },
          })
        : await client.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
      if (result.error) throw result.error;
      if (isSignUp && !result.data.session) {
        setMessage("تم إنشاء الحساب. تحقق من بريدك الإلكتروني لتفعيل الدخول.");
      } else {
        setMessage("تم تسجيل الدخول بنجاح.");
        onSuccess?.();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تسجيل الدخول.");
    } finally {
      setPending(false);
    }
  };

  const signInWithGoogle = async () => {
    setPending(true);
    setMessage(null);
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/`,
        queryParams: {
          access_type: "offline",
          prompt: "select_account",
        },
      },
    });
    if (error) {
      setMessage(
        "تعذر بدء الدخول عبر Google. تأكد من تفعيل Google في إعدادات Supabase."
      );
      setPending(false);
    }
  };

  return (
    <div className="grid w-full gap-3 rounded-xl border bg-card p-4 text-right shadow-sm">
      <label className="grid gap-1.5 text-sm font-semibold">
        البريد الإلكتروني
        <Input
          dir="ltr"
          type="email"
          value={email}
          onChange={event => setEmail(event.target.value)}
          placeholder="officer@example.com"
          autoComplete="email"
          disabled={pending}
        />
      </label>
      <label className="grid gap-1.5 text-sm font-semibold">
        كلمة المرور
        <Input
          dir="ltr"
          type="password"
          value={password}
          onChange={event => setPassword(event.target.value)}
          placeholder="••••••••"
          autoComplete={isSignUp ? "new-password" : "current-password"}
          disabled={pending}
        />
      </label>
      <Button type="button" onClick={submit} disabled={pending}>
        {pending ? "جارٍ التحقق..." : isSignUp ? "إنشاء حساب شرطي" : "دخول آمن"}
      </Button>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        أو
        <span className="h-px flex-1 bg-border" />
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={signInWithGoogle}
        disabled={pending}
        className="w-full"
      >
        المتابعة باستخدام Google
      </Button>
      <button
        type="button"
        className="text-xs font-semibold text-primary underline-offset-4 hover:underline"
        onClick={() => {
          setIsSignUp(current => !current);
          setMessage(null);
        }}
        disabled={pending}
      >
        {isSignUp ? "لديك حساب؟ تسجيل الدخول" : "إنشاء حساب جديد"}
      </button>
      {message ? (
        <p className="text-center text-xs text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
