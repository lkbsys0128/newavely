"use client";

import { ExternalLink, X } from "lucide-react";
import { useState } from "react";
import { bibleBooks, buildBibleLink, parseBibleLink, searchBibleBooks } from "@/lib/bible-links";

type Props = { sourceUrl?: string; disabled: boolean; label: string; onSelect: (url: string) => void };

export function PrayerBiblePicker({ sourceUrl, disabled, label, onSelect }: Props) {
  const selected = parseBibleLink(sourceUrl);
  const [query, setQuery] = useState("");
  const matches = searchBibleBooks(query);
  const selectedOutsideResults = selected && !matches.some(({ book }) => book === selected.book);
  return <div className="prayer-bible-picker">
    <label className="prayer-bible-search"><span>성경 검색</span><input type="search" aria-label={`${label} 성경 검색`}
      placeholder="성경 이름 검색" value={query} disabled={disabled} autoComplete="off"
      onChange={(event) => setQuery(event.target.value)} /></label>
    <div className="prayer-bible-fields">
      <label><span>성경 · 개역개정</span><select aria-label={`${label} 성경 책`} disabled={disabled} value={selected?.book ?? ""}
        onChange={(event) => { onSelect(event.target.value ? buildBibleLink(Number(event.target.value), 1) : ""); setQuery(""); }}>
        <option value="">말씀 선택 안 함</option>
        {selectedOutsideResults ? <option value={selected.book}>{bibleBooks[selected.book - 1][0]} (현재 선택)</option> : null}
        {matches.map(({ name, book }) => <option key={book} value={book}>{name}</option>)}
      </select></label>
      <label><span>장</span><select aria-label={`${label} 성경 장`} disabled={disabled || !selected} value={selected?.chapter ?? ""}
        onChange={(event) => selected && onSelect(buildBibleLink(selected.book, Number(event.target.value)))}>
        {!selected ? <option value="">선택</option> : Array.from({ length: bibleBooks[selected.book - 1][1] }, (_, index) =>
          <option key={index + 1} value={index + 1}>{index + 1}장</option>)}
      </select></label>
    </div>
    {query && matches.length === 0 ? <p role="status">검색 결과가 없습니다.</p> : null}
    {selected ? <div className="prayer-attached-source"><a href={sourceUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} />{selected.label} · 말씀 보기</a>
      <button type="button" className="prayer-icon-button" title="말씀 링크 삭제" aria-label={`${label} 말씀 링크 삭제`} disabled={disabled} onClick={() => { onSelect(""); setQuery(""); }}><X size={15} /></button>
    </div> : null}
  </div>;
}
