import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <main
          className="flex min-h-dvh items-center justify-center bg-background p-6"
          dir="rtl"
          role="alert"
        >
          <div className="flex w-full max-w-xl flex-col items-center text-center">
            <AlertTriangle
              size={48}
              className="mb-6 shrink-0 text-destructive"
              aria-hidden="true"
            />

            <h1 className="mb-3 text-2xl font-bold">حدث خطأ غير متوقع</h1>
            <p className="mb-6 max-w-md leading-7 text-muted-foreground">
              تعذر عرض هذه الصفحة. أعد تحميلها للمتابعة، ولن تؤثر إعادة التحميل
              على البيانات المحفوظة في الخادم.
            </p>

            {import.meta.env.DEV && this.state.error ? (
              <details className="mb-6 w-full rounded-lg bg-muted p-4 text-right">
                <summary className="cursor-pointer font-semibold">
                  تفاصيل تقنية للمطور
                </summary>
                <pre className="mt-3 overflow-auto whitespace-break-spaces text-sm text-muted-foreground">
                  {this.state.error.stack}
                </pre>
              </details>
            ) : null}

            <button
              type="button"
              onClick={() => window.location.reload()}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-lg px-5 py-2",
                "bg-primary text-primary-foreground",
                "cursor-pointer hover:opacity-90"
              )}
            >
              <RotateCcw size={16} aria-hidden="true" />
              إعادة تحميل الصفحة
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
