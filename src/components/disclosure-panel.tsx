"use client";

import type { ReactNode } from "react";

export function DisclosurePanel({
  children,
  defaultOpen = false,
  id,
  meta,
  title,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  id?: string;
  meta?: string;
  title: string;
}) {
  return (
    <details className="panel disclosure-panel" id={id} open={defaultOpen}>
      <summary>
        <div>
          <h2>{title}</h2>
          {meta ? <span>{meta}</span> : null}
        </div>
        <span className="disclosure-indicator">
          <span className="when-closed">열기</span>
          <span className="when-open">접기</span>
        </span>
      </summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}
