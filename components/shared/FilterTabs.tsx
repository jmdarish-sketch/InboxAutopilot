"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";

export interface TabDef {
  label:  string;
  value:  string;
  count?: number;
}

interface FilterTabsProps {
  tabs:      TabDef[];
  paramName?: string; // defaults to "filter"
}

export default function FilterTabs({ tabs, paramName = "filter" }: FilterTabsProps) {
  const router      = useRouter();
  const pathname    = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const active = searchParams.get(paramName) ?? tabs[0]?.value ?? "all";

  function navigate(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === tabs[0]?.value) {
      params.delete(paramName);
    } else {
      params.set(paramName, value);
    }
    const query = params.toString();
    startTransition(() => {
      router.push(`${pathname}${query ? `?${query}` : ""}`);
    });
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {tabs.map(tab => {
        const isActive = tab.value === active;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => navigate(tab.value)}
            disabled={isPending}
            className={`
              flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium
              transition-colors disabled:opacity-60
              ${isActive
                ? "bg-gray-900 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50 ring-1 ring-gray-200"}
            `}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
                  isActive ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
