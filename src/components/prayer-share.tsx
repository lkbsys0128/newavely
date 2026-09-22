"use client";

import { useRef, useState } from "react";
import { Share2, Copy, QrCode, X, ArrowLeft, Maximize2, Minimize2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { buildPrayerShareLink } from "@/lib/prayer-share-link";
import { formatPrayerDate } from "@/lib/prayer-meetings";

export function PrayerShare({ meetingId, eventDate }: { meetingId: string; eventDate: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState("");
  const [qr, setQr] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  function open() {
    setUrl(buildPrayerShareLink(window.location.origin, meetingId));
    setQr(false); setExpanded(false); setCopyState("idle");
    dialog.current?.showModal();
  }
  async function copyLink() {
    setCopyState("copying");
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }
  return <>
    <button className="secondary-button" type="button" onClick={open} aria-haspopup="dialog"><Share2 size={17} />공유하기</button>
    <dialog ref={dialog} className={`prayer-share-dialog${expanded ? " is-expanded" : ""}`} aria-labelledby="prayer-share-title"
      onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="prayer-share-content">
        <header className="prayer-share-header">
          <h2 id="prayer-share-title">{qr ? "오늘의 기도회" : "기도회 공유"}</h2>
          <button className="prayer-icon-button" type="button" aria-label="공유 닫기" title="닫기" onClick={() => dialog.current?.close()}><X size={20} /></button>
        </header>
        <p className="meta">{formatPrayerDate(eventDate)}</p>
        {qr ? <>
          <div className="prayer-share-qr"><QRCodeSVG value={url} size={640} level="M" marginSize={4} bgColor="#ffffff" fgColor="#000000" title="기도회 링크 QR코드" /></div>
          <div className="prayer-share-actions">
            <button className="secondary-button" type="button" onClick={() => { setQr(false); setExpanded(false); }}><ArrowLeft size={17} />뒤로</button>
            <button className="secondary-button" type="button" onClick={() => setExpanded(!expanded)}>{expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}{expanded ? "작게 보기" : "크게 보기"}</button>
          </div>
        </> : <div className="prayer-share-options">
          <button className="secondary-button" type="button" disabled={copyState === "copying"} onClick={copyLink}><Copy size={20} />링크 복사</button>
          <button className="secondary-button" type="button" onClick={() => { setQr(true); setCopyState("idle"); }}><QrCode size={20} />QR코드 보기</button>
        </div>}
        {copyState === "copied" ? <p className="meta" role="status">기도회 링크를 복사했습니다.</p> : null}
        {copyState === "failed" ? <p className="prayer-message" role="alert">자동 복사를 사용할 수 없습니다. 아래 링크를 선택해 복사해주세요.</p> : null}
        {qr || copyState === "failed" ? <div className="management-form"><label>기도회 링크<input readOnly value={url} onFocus={(event) => event.currentTarget.select()} /></label></div> : null}
      </div>
    </dialog>
  </>;
}
