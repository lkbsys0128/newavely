"use client";

import { useActionState, useMemo, useState } from "react";
import { updateMyStatusMessage, type ActionState } from "@/app/actions";

const initialActionState: ActionState = { ok: false, message: "" };
const statusMessageLimit = 80;

export function MemberStatusComposer({ initialMessage = "" }: { initialMessage?: string }) {
  const [state, action, isPending] = useActionState(updateMyStatusMessage, initialActionState);
  const [message, setMessage] = useState(initialMessage);
  const remaining = statusMessageLimit - message.length;
  const helperText = useMemo(() => {
    if (remaining < 0) return `${Math.abs(remaining)}자 줄여주세요`;
    return `${remaining}자 남음`;
  }, [remaining]);

  return (
    <section className="panel status-composer-panel" id="today-message">
      <div className="panel-heading">
        <div>
          <h2>오늘의 한마디</h2>
          <p className="meta">지금 상태나 짧은 메시지를 80자 이내로 남겨주세요.</p>
        </div>
      </div>
      <form action={action} className="status-composer-form">
        <label>
          한마디
          <input
            maxLength={statusMessageLimit}
            name="message"
            onChange={(event) => setMessage(event.target.value)}
            placeholder="예: 오늘은 기도 부탁이 있어요"
            value={message}
          />
        </label>
        <div className="status-composer-actions">
          <span className={remaining < 0 ? "status-counter over" : "status-counter"}>{helperText}</span>
          <button className="primary-button" type="submit" disabled={isPending || remaining < 0}>
            {isPending ? "저장 중" : "저장"}
          </button>
        </div>
      </form>
      {state.message ? (
        <p className={`action-message ${state.ok ? "success" : "error"}`} role="status">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
