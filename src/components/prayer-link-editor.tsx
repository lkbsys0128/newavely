"use client";

import { useState } from "react";
import { ExternalLink, Link2, Search, X } from "lucide-react";
import { PrayerSourcePicker } from "./prayer-source-picker";
import { PrayerBiblePicker } from "./prayer-bible-picker";
import { safePrayerSourceUrl } from "@/lib/prayer-source-search";
import { parseBibleLink } from "@/lib/bible-links";

type Props = {
  url?: string; text?: string; bible: boolean; label: string; disabled: boolean;
  onChange: (url: string, text: string, songTitle?: string) => void;
  displayMode?: "image" | "external";
  onDisplayModeChange?: (mode: "auto" | "image" | "external") => void;
};

export function PrayerLinkEditor({ url = "", text = "", bible, label, disabled, onChange, displayMode, onDisplayModeChange }: Props) {
  const [mode, setMode] = useState<"search" | "manual">(text || (url && !parseBibleLink(url)) ? "manual" : "search");
  const [draftText, setDraftText] = useState(text);
  const validUrl = safePrayerSourceUrl(url);
  return <div className="prayer-link-editor">
    <div className="prayer-link-modes" role="group" aria-label={`${label} 링크 입력 방식`}>
      <button type="button" aria-pressed={mode === "search"} disabled={disabled} onClick={() => setMode("search")}><Search size={15} />검색</button>
      <button type="button" aria-pressed={mode === "manual"} disabled={disabled} onClick={() => { if (url) setDraftText(text); setMode("manual"); }}><Link2 size={15} />직접 입력</button>
    </div>
    {mode === "search" ? bible
      ? <PrayerBiblePicker sourceUrl={url} label={label} disabled={disabled} onSelect={(value) => onChange(value, "")} />
      : <PrayerSourcePicker sourceUrl={url} label={label} disabled={disabled} onSelect={(value, songTitle) => onChange(value, "", songTitle)} />
      : <div className="prayer-manual-link">
        <label><span>표시할 텍스트</span><input aria-label={`${label} 링크 텍스트`} value={draftText} maxLength={120} placeholder="예: 찬양 영상, 말씀 자료" disabled={disabled}
          onChange={(event) => { setDraftText(event.target.value); onChange(url, event.target.value); }} /></label>
        <label><span>링크 주소</span><input aria-label={`${label} 링크 주소`} type="url" value={url} maxLength={2000} placeholder="https://" disabled={disabled}
          onChange={(event) => onChange(event.target.value.trim(), draftText)} aria-invalid={Boolean(url && !validUrl)} /></label>
        {url && !validUrl ? <p role="status" className="prayer-link-error">올바른 HTTPS 링크를 입력해주세요.</p> : null}
        {validUrl ? <div className="prayer-attached-source"><a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} />{draftText.trim() || "링크 보기"}</a>
          <button type="button" className="prayer-icon-button" disabled={disabled} title="링크 제거" aria-label={`${label} 링크 제거`} onClick={() => { setDraftText(""); onChange("", ""); }}><X size={16} /></button></div> : null}
      </div>}
    {validUrl && onDisplayModeChange ? <div className="prayer-manual-link"><label><span>열기 방식</span>
      <select aria-label={`${label} 열기 방식`} disabled={disabled} value={displayMode ?? "auto"}
        onChange={(event) => onDisplayModeChange(event.target.value as "auto" | "image" | "external")}>
        <option value="auto">자동</option><option value="image">앱 악보 뷰어</option><option value="external">원문 링크 (새 탭)</option>
      </select></label></div> : null}
  </div>;
}
