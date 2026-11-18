"use client";

import { useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Music2, X, ZoomIn, ZoomOut } from "lucide-react";
import { prayerEntryLinks, type PrayerEntry } from "@/lib/prayer-meetings";
import { parseBibleLink } from "@/lib/bible-links";
import { isPrayerImageLink } from "@/lib/prayer-image-link";

export function PrayerEntryLinks({ entry }: { entry: PrayerEntry }) {
  const links = prayerEntryLinks(entry);
  const pages = links.filter(isPrayerImageLink);
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  function move(index: number) { setPage(index); setZoom(100); setFailed(false); setLoaded(false); }
  function close() { dialog.current?.close(); setOpen(false); }
  return <div className="prayer-entry-links">
    {links.filter((url) => !pages.includes(url)).map((url, index) => {
      const bible = parseBibleLink(url);
      return <a key={url} className="prayer-source-link" href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /><span>{entry.sourceLabels?.[url]?.trim() || (bible ? `${bible.label} · 말씀 보기 (개역개정)` : `링크 보기${links.length > 1 ? ` ${index + 1}` : ""}`)}</span></a>;
    })}
    {pages.length ? <>
      <button className="prayer-source-link" type="button" aria-haspopup="dialog" onClick={() => { move(0); setOpen(true); dialog.current?.showModal(); }}><Music2 size={15} /><span>악보 보기{pages.length > 1 ? ` · ${pages.length}장` : ""}</span></button>
      <dialog ref={dialog} className="prayer-score-dialog" aria-labelledby={headingId} onClose={() => setOpen(false)}
        onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
        <div className="prayer-score-content">
          <header><h2 id={headingId}>{entry.detail || "악보"}</h2><button className="prayer-icon-button" type="button" title="닫기" aria-label="악보 닫기" onClick={close}><X size={20} /></button></header>
          <div className="prayer-score-toolbar">
            <button className="prayer-icon-button" type="button" title="이전 장" aria-label="이전 장" disabled={page === 0} onClick={() => move(page - 1)}><ChevronLeft size={18} /></button>
            <span aria-live="polite">{page + 1} / {pages.length}</span>
            <button className="prayer-icon-button" type="button" title="다음 장" aria-label="다음 장" disabled={page === pages.length - 1} onClick={() => move(page + 1)}><ChevronRight size={18} /></button>
            <button className="prayer-icon-button" type="button" title="축소" aria-label="악보 축소" disabled={zoom === 100} onClick={() => setZoom(zoom - 25)}><ZoomOut size={18} /></button>
            <span>{zoom}%</span>
            <button className="prayer-icon-button" type="button" title="확대" aria-label="악보 확대" disabled={zoom === 250} onClick={() => setZoom(zoom + 25)}><ZoomIn size={18} /></button>
          </div>
          <div className="prayer-score-stage" key={page}>
            {open && !failed ? <>
              {!loaded ? <p role="status">악보를 불러오는 중...</p> : null}
              {/* Direct image embedding avoids attachment navigation and arbitrary server-side proxy requests. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pages[page]} alt={`${entry.detail || "악보"} ${page + 1}장`} referrerPolicy="no-referrer" style={{ width: `${zoom}%` }} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
            </> : failed ? <p role="alert">이미지를 표시할 수 없습니다. 원본 사이트가 표시를 제한했거나 이미지 링크가 아닐 수 있습니다. 관리자에게 링크 수정을 요청해주세요.</p> : null}
          </div>
        </div>
      </dialog>
    </> : null}
  </div>;
}
