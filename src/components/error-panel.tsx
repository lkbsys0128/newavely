"use client";

import { useActionState } from "react";
import { requestDeletedAuthUserRestore, type ActionState } from "@/app/actions";

const initialActionState: ActionState = { ok: false, message: "" };

export function ErrorPanel({
  title,
  message,
  eyebrow = "서버 설정 확인 필요",
  label = "오류 메시지",
  context,
  allowRestoreRequest = false,
}: {
  title: string;
  message: string;
  eyebrow?: string;
  label?: string;
  context?: string;
  allowRestoreRequest?: boolean;
}) {
  const [restoreRequestState, restoreRequestAction, isRequestingRestore] = useActionState(
    requestDeletedAuthUserRestore,
    initialActionState,
  );

  return (
    <main className="main-content">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
          </div>
          <span>Supabase</span>
        </div>
        <article className="care-item">
          <div className="person-block">
            <strong>{label}</strong>
            <span>{message}</span>
            {context ? <span>{context}</span> : null}
          </div>
        </article>
        {allowRestoreRequest ? (
          <form action={restoreRequestAction} className="member-form compact-form">
            <label className="full-width">
              관리자에게 남길 메모
              <textarea
                name="note"
                placeholder="예: 다시 Newavely 계정을 사용하고 싶습니다."
                rows={3}
              />
            </label>
            <div className="form-actions full-width">
              {restoreRequestState.message ? (
                <p className={`action-message ${restoreRequestState.ok ? "success" : "error"}`} role="status">
                  {restoreRequestState.message}
                </p>
              ) : null}
              <button className="primary-button" type="submit" disabled={isRequestingRestore || restoreRequestState.ok}>
                복구 요청 보내기
              </button>
            </div>
          </form>
        ) : null}
      </section>
    </main>
  );
}
