import { cn } from "@/lib/utils";

type BrandMarkProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
  imageClassName?: string;
  showLabel?: boolean;
  compactLabel?: boolean;
};

const sizeClasses = {
  sm: "h-10 w-10 rounded-xl",
  md: "h-11 w-11 rounded-2xl",
  lg: "h-16 w-16 rounded-[1.35rem]",
} as const;

export function BrandMark({
  size = "md",
  className,
  imageClassName,
  showLabel = false,
  compactLabel = false,
}: BrandMarkProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className={cn(
          "brand-mark shrink-0 overflow-hidden border border-white/15 bg-[#10233f] shadow-[0_8px_24px_rgba(16,35,63,0.18)]",
          sizeClasses[size]
        )}
      >
        <img
          src="/icon-512.png"
          alt=""
          aria-hidden="true"
          className={cn("h-full w-full object-cover", imageClassName)}
        />
      </div>
      {showLabel ? (
        <div className="min-w-0 text-right">
          <p className="truncate text-sm font-bold tracking-tight text-foreground">
            نظام برقيات الشرطة
          </p>
          {!compactLabel ? (
            <p className="truncate text-[11px] text-muted-foreground">
              غرفة العمليات الرقمية
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
