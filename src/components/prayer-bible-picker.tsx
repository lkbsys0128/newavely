"use client";

import { ExternalLink, X } from "lucide-react";
import { bibleBooks, buildBibleLink, parseBibleLink } from "@/lib/bible-links";

type Props = { sourceUrl?: string; disabled: boolean; label: string; onSelect: (url: string) => void };

export function PrayerBiblePicker({ sourceUrl, disabled, label, onSelect }: Props) {
  const selected = parseBibleLink(sourceUrl);
  return <div className="prayer-bible-picker">
    <div className="prayer-bible-fields">
      <label><span>성경 · 개역개정</span><select aria-label={`${label} 성경 책`} disabled={disabled} value={selected?.book ?? ""}
        onChange={(event) => onSelect(event.target.value ? buildBibleLink(Number(event.target.value), 1) : "")}>
        <option value="">말씀 선택 안 함</option>
        {bibleBooks.map(([name], index) => <option key={name} value={index + 1}>{name}</option>)}
      </select></label>
      <label><span>장</span><select aria-label={`${label} 성경 장`} disabled={disabled || !selected} value={selected?.chapter ?? ""}
        onChange={(event) => selected && onSelect(buildBibleLink(selected.book, Number(event.target.value)))}>
        {!selected ? <option value="">선택</option> : Array.from({ length: bibleBooks[selected.book - 1][1] }, (_, index) =>
          <option key={index + 1} value={index + 1}>{index + 1}장</option>)}
      </select></label>
    </div>
    {selected ? <div className="prayer-attached-source"><a href={sourceUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} />{selected.label} · 말씀 보기</a>
      <button type="button" className="prayer-icon-button" title="말씀 링크 삭제" aria-label={`${label} 말씀 링크 삭제`} disabled={disabled} onClick={() => onSelect("")}><X size={15} /></button>
    </div> : null}
  </div>;
}
