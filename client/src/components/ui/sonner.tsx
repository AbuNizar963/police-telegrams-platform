import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useEffect } from "react";

function playNotificationChime(type: string | null | undefined) {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as Window & {
        webkitAudioContext?: typeof AudioContext;
      }).webkitAudioContext;
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
      expand
      gap={10}
      visibleToasts={4}
      offset="18px"
      mobileOffset="12px"
      className="toaster group"
      toastOptions={{
        duration: 4500,
        closeButton: true,
      }}
      style={
        {
          "--width": "min(420px, calc(100vw - 32px))",
          "--border-radius": "14px",
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
