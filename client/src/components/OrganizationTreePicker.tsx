import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Check,
  ChevronDown,
  ChevronsUpDown,
  Search,
  X,
} from "lucide-react";
import { getOrganizationTreeVisibleIds } from "@shared/organizationHierarchy";
import { organizationTypeLabels } from "@/lib/uiLabels";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type OrganizationTreeOption = {
  id: string;
  name: string;
  code: string;
  type: string;
  parentOrganizationId: string | null;
  isSelectable?: boolean;
  isConfiguredDestination?: boolean;
};

type OrganizationTreePickerProps = {
  options: OrganizationTreeOption[];
  value: string;
  onValueChange: (id: string) => void;
  placeholder: string;
  ariaLabel: string;
  disabled?: boolean;
  allowClear?: boolean;
  clearLabel?: string;
  emptyMessage?: string;
  className?: string;
};

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase("ar");
}

export function OrganizationTreePicker({
  options,
  value,
  onValueChange,
  placeholder,
  ariaLabel,
  disabled = false,
  allowClear = false,
  clearLabel = "إلغاء الاختيار",
  emptyMessage = "لا توجد جهات متاحة ضمن هذا المسار.",
  className,
}: OrganizationTreePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const optionsById = useMemo(
    () => new Map(options.map(option => [option.id, option])),
    [options]
  );
  const selectableIds = useMemo(
    () =>
      options
        .filter(option => option.isSelectable !== false)
        .map(option => option.id),
    [options]
  );
  const visibleIds = useMemo(
    () => getOrganizationTreeVisibleIds(options, selectableIds),
    [options, selectableIds]
  );
  const visibleOptions = useMemo(
    () => options.filter(option => visibleIds.has(option.id)),
    [options, visibleIds]
  );
  const childrenByParentId = useMemo(() => {
    const children = new Map<string | null, OrganizationTreeOption[]>();
    for (const option of visibleOptions) {
      const parentId =
        option.parentOrganizationId &&
        visibleIds.has(option.parentOrganizationId)
          ? option.parentOrganizationId
          : null;
      const siblings = children.get(parentId) ?? [];
      siblings.push(option);
      children.set(parentId, siblings);
    }
    for (const siblings of Array.from(children.values())) {
      siblings.sort((left, right) =>
        left.name.localeCompare(right.name, "ar", { sensitivity: "base" })
      );
    }
    return children;
  }, [visibleIds, visibleOptions]);
  const selectedOption = value ? optionsById.get(value) : undefined;
  const query = normalizeSearch(search);
  const matchingOptions = useMemo(() => {
    if (!query) return [];
    return visibleOptions.filter(option => {
      const typeLabel = organizationTypeLabels[option.type] ?? option.type;
      return `${option.name} ${option.code} ${typeLabel}`
        .toLocaleLowerCase("ar")
        .includes(query);
    });
  }, [query, visibleOptions]);

  const getPath = (option: OrganizationTreeOption) => {
    const parts = [option.name];
    const visited = new Set([option.id]);
    let parentId = option.parentOrganizationId ?? null;
    while (parentId && !visited.has(parentId)) {
      const parent = optionsById.get(parentId);
      if (!parent) break;
      parts.unshift(parent.name);
      visited.add(parent.id);
      parentId = parent.parentOrganizationId ?? null;
    }
    return parts.join(" ← ");
  };

  const expandToOption = (optionId: string) => {
    const next = new Set(expandedIds);
    const visited = new Set<string>();
    let currentId = optionId;
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const current = optionsById.get(currentId);
      const parentId = current?.parentOrganizationId ?? null;
      if (!parentId || !optionsById.has(parentId)) break;
      next.add(parentId);
      currentId = parentId;
    }
    setExpandedIds(next);
  };

  useEffect(() => {
    if (open && value) expandToOption(value);
    // Expanding the selected lineage is a convenience only when the picker opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value]);

  const selectOption = (option: OrganizationTreeOption) => {
    if (option.isSelectable === false) return;
    onValueChange(option.id);
    setOpen(false);
    setSearch("");
  };
  const toggleOption = (optionId: string) => {
    setExpandedIds(current => {
      const next = new Set(current);
      if (next.has(optionId)) next.delete(optionId);
      else next.add(optionId);
      return next;
    });
  };

  const renderTree = (parentId: string | null, depth = 0): React.ReactNode => {
    const children = childrenByParentId.get(parentId) ?? [];
    return children.map(option => {
      const nested = childrenByParentId.get(option.id) ?? [];
      const hasChildren = nested.length > 0;
      const expanded = expandedIds.has(option.id);
      const selectable = option.isSelectable !== false;
      const selected = option.id === value;
      return (
        <li key={option.id} className="min-w-0">
          <div
            className="flex min-w-0 items-stretch gap-1"
            style={{ marginRight: `${Math.min(depth * 14, 70)}px` }}
          >
            <button
              type="button"
              disabled={!selectable}
              onClick={() => selectOption(option)}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-2.5 py-2 text-right transition-colors",
                selectable
                  ? "hover:border-[#b4945a] hover:bg-[#fff8e8] dark:hover:bg-[#3c301a]"
                  : "cursor-default border-transparent text-muted-foreground opacity-75",
                selected &&
                  "border-[#b4945a] bg-[#fff8e8] text-[#6f5117] dark:bg-[#3c301a] dark:text-[#f2d694]"
              )}
              title={
                selectable
                  ? "اختيار هذه الجهة"
                  : "استخدم السهم لعرض الجهات التابعة المتاحة"
              }
            >
              <Building2 className="h-4 w-4 shrink-0 text-[#9b7c3d]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold">
                  {option.name}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {organizationTypeLabels[option.type] ?? option.type}
                  {option.code ? ` · ${option.code}` : ""}
                  {option.isConfiguredDestination ? " · الوجهة الافتراضية" : ""}
                </span>
              </span>
              {selected && <Check className="h-4 w-4 shrink-0" />}
            </button>
            {hasChildren && (
              <button
                type="button"
                onClick={() => toggleOption(option.id)}
                className="flex w-9 shrink-0 items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:border-[#b4945a] hover:bg-muted"
                aria-label={`${expanded ? "إخفاء" : "عرض"} الجهات التابعة لـ${option.name}`}
                aria-expanded={expanded}
                title={expanded ? "إخفاء الجهات التابعة" : "عرض الجهات التابعة"}
              >
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform",
                    !expanded && "-rotate-90"
                  )}
                />
              </button>
            )}
          </div>
          {hasChildren && expanded && (
            <ul className="mt-1 space-y-1">
              {renderTree(option.id, depth + 1)}
            </ul>
          )}
        </li>
      );
    });
  };

  return (
    <Popover
      open={open}
      onOpenChange={nextOpen => {
        setOpen(nextOpen);
        if (!nextOpen) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-haspopup="dialog"
          className={cn(
            "h-11 w-full justify-between gap-3 rounded-lg bg-background px-3 text-right font-normal",
            className
          )}
        >
          <span className="min-w-0 flex-1 truncate">
            {selectedOption?.name ?? placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        dir="rtl"
        align="start"
        className="z-[90] w-[min(32rem,calc(100vw-1.5rem))] p-0"
      >
        <div className="border-b p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold">اختيار من الهيكل التنظيمي</p>
              <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
                استخدم السهم بجانب القيادة أو الجهة لعرض الجهات التابعة، ثم اختر
                الجهة المطلوبة.
              </p>
            </div>
            {allowClear && value && (
              <button
                type="button"
                onClick={() => {
                  onValueChange("");
                  setOpen(false);
                }}
                className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={clearLabel}
                title={clearLabel}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={search}
              onChange={event => setSearch(event.target.value)}
              aria-label="البحث في الهيكل التنظيمي"
              placeholder="ابحث بالاسم أو الرمز أو المستوى..."
              className="h-10 pr-9 text-xs"
            />
          </div>
        </div>
        <div className="max-h-[min(22rem,55vh)] overflow-y-auto p-3">
          {query ? (
            matchingOptions.length > 0 ? (
              <ul className="space-y-1.5">
                {matchingOptions.map(option => {
                  const selectable = option.isSelectable !== false;
                  return (
                    <li key={option.id}>
                      <button
                        type="button"
                        disabled={!selectable}
                        onClick={() => selectOption(option)}
                        className={cn(
                          "w-full rounded-lg border px-3 py-2 text-right transition-colors",
                          selectable
                            ? "hover:border-[#b4945a] hover:bg-[#fff8e8] dark:hover:bg-[#3c301a]"
                            : "cursor-default border-transparent text-muted-foreground opacity-75",
                          option.id === value &&
                            "border-[#b4945a] bg-[#fff8e8] dark:bg-[#3c301a]"
                        )}
                      >
                        <span className="block text-xs font-bold">
                          {option.name}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-muted-foreground">
                          {getPath(option)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-8 text-center text-xs text-muted-foreground">
                لا توجد جهة مطابقة للبحث.
              </p>
            )
          ) : visibleOptions.length > 0 ? (
            <ul className="space-y-1">{renderTree(null)}</ul>
          ) : (
            <p className="py-8 text-center text-xs text-muted-foreground">
              {emptyMessage}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
