"use client";

import { useActionState, useMemo, useState } from "react";
import { updateMyStatusMessage, type ActionState } from "@/app/actions";

const initialActionState: ActionState = { ok: false, message: "" };
const statusMessageLimit = 80;
const quickStatusMessages = ["기도 부탁이 있어요", "오늘 감사한 하루", "이번 주 조금 바빠요", "함께 나누고 싶어요"];

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
      <div className="status-composer-heading">
        <div>
          <p className="eyebrow">My note</p>
          <h2>오늘의 한마디</h2>
          <p className="meta">지금 상태나 짧은 메시지를 80자 이내로 남겨주세요.</p>
        </div>
        <span className={remaining < 12 ? "status-counter urgent" : "status-counter"}>{helperText}</span>
      </div>
      <form action={action} className="status-composer-form">
        <div className="status-input-shell">
          <textarea
            aria-label="오늘의 한마디"
            maxLength={statusMessageLimit}
            name="message"
            onChange={(event) => setMessage(event.target.value)}
            placeholder="예: 오늘은 기도 부탁이 있어요."
            rows={3}
            value={message}
          />
          <div className="status-quick-list" aria-label="빠른 한마디">
            {quickStatusMessages.map((quickMessage) => (
              <button key={quickMessage} type="button" onClick={() => setMessage(quickMessage)}>
                {quickMessage}
              </button>
            ))}
          </div>
        </div>
        <div className="status-composer-actions">
          <button className="secondary-button" type="button" onClick={() => setMessage("")} disabled={isPending || !message}>
            비우기
          </button>
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
