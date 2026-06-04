"use client";

import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const transitionKey = `${pathname}?${searchParams.toString()}`;

  return (
    <div className="page-transition" key={transitionKey}>
      {children}
    </div>
  );
}
