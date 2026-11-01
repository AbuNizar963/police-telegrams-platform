import { useTheme } from "next-themes";
import { Check, Lightbulb, LoaderCircle, X } from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useEffect } from "react";

function playNotificationChime(type: string | null | undefined) {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (
        window as Window & {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;
    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const isError = type === "error";
    const startTime = context.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(isError ? 440 : 660, startTime);
    oscillator.frequency.setValueAtTime(isError ? 330 : 880, startTime + 0.09);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.045, startTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.19);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + 0.2);
    oscillator.addEventListener("ended", () => {
      void context.close();
    });
  } catch {
    // Browsers may block audio until a user gesture; notifications still work.
  }
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  useEffect(() => {
    const toaster = document.querySelector<HTMLElement>(
      "[data-sonner-toaster]"
    );
    if (!toaster) return;

    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (!(node instanceof HTMLElement)) continue;
          const toast = node.matches("[data-sonner-toast]")
            ? node
            : node.querySelector<HTMLElement>("[data-sonner-toast]");
          if (!toast || toast.dataset.type === "loading") continue;
          playNotificationChime(toast.dataset.type);
        }
      }
    });

    observer.observe(toaster, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="top-center"
      dir="rtl"
      richColors
      closeButton
      icons={{
        success: <Check aria-hidden="true" size={28} strokeWidth={2.8} />,
        error: <X aria-hidden="true" size={25} strokeWidth={2.6} />,
        warning: (
          <span aria-hidden="true" className="toast-warning-mark">
            !
          </span>
        ),
        info: <Lightbulb aria-hidden="true" size={26} strokeWidth={2} />,
        loading: (
          <LoaderCircle
            aria-hidden="true"
            className="animate-spin"
            size={25}
            strokeWidth={2.2}
          />
        ),
        close: <X aria-hidden="true" size={24} strokeWidth={1.8} />,
      }}
      expand={false}
      gap={14}
      visibleToasts={1}
      offset="calc(env(safe-area-inset-top, 0px) + 16px)"
      mobileOffset="calc(env(safe-area-inset-top, 0px) + 16px)"
      className="toaster group"
      toastOptions={{
        duration: 4000,
        closeButton: true,
        closeButtonAriaLabel: "إغلاق الإشعار",
      }}
      style={
        {
          "--width": "min(650px, calc(100vw - 32px))",
          "--border-radius": "20px",
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
