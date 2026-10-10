import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

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
