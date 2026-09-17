"use client";

import { useRef, useState } from "react";
import { ExternalLink, Search, X, Link2 } from "lucide-react";
import { searchPrayerSources } from "@/app/prayer/search-actions";
import { safeSourceUrl, type PrayerSourceResult } from "@/lib/prayer-source-search";

type Props = { sourceUrl?: string; disabled: boolean; label: string; onSelect: (url: string) => void };

export function PrayerSourcePicker({ sourceUrl, disabled, label, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PrayerSourceResult[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  async function search() {
    const id = ++requestId.current;
    setLoading(true); setMessage(""); setResults([]);
    try {
      const result = await searchPrayerSources(query);
      if (id !== requestId.current) return;
      setResults(result.results);
      setMessage(result.error ?? (result.results.length ? "" : "검색 결과가 없습니다. 곡명과 가수명을 함께 입력해보세요."));
    } catch { if (id === requestId.current) setMessage("검색에 실패했습니다. 다시 시도해주세요."); }
    finally { if (id === requestId.current) setLoading(false); }
  }
  return <div className="prayer-source-picker">
    <div className="prayer-source-query"><label>가사 원문 검색<input aria-label={`${label} 가사 원문 검색`} value={query} maxLength={120} placeholder="곡명 · 가수명" disabled={disabled}
      onChange={(event) => { ++requestId.current; setQuery(event.target.value); setResults([]); setMessage(""); setLoading(false); }}
      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (!loading && query.trim().length >= 2) void search(); } }} /></label>
      <button className="prayer-icon-button" type="button" title="원문 검색" aria-label={`${label} 원문 검색 실행`} disabled={disabled || loading || query.trim().length < 2} onClick={() => void search()}><Search size={18} /></button></div>
    {loading ? <p className="meta" role="status">검색 중...</p> : null}
    {message ? <p className="meta" role="status">{message}</p> : null}
    {results.length ? <ul className="prayer-source-results" aria-label={`${label} 검색 결과`}>{results.map((result) => <li key={result.url}>
      <button type="button" disabled={disabled} onClick={() => { onSelect(result.url); setResults([]); setMessage("원문 링크를 첨부했습니다."); }}><Link2 size={16} /><span>{result.title}<small>{result.domain}</small></span></button>
      <a href={result.url} target="_blank" rel="noopener noreferrer" aria-label={`${result.title} 미리보기`} title="새 탭에서 미리보기"><ExternalLink size={16} /></a>
    </li>)}</ul> : null}
    {sourceUrl && safeSourceUrl(sourceUrl) ? <div className="prayer-attached-source"><a href={sourceUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} />가사 원문 · {new URL(sourceUrl).hostname}</a>
      <button className="prayer-icon-button" type="button" aria-label={`${label} 원문 링크 제거`} title="링크 제거" disabled={disabled} onClick={() => onSelect("")}><X size={16} /></button></div> : null}
  </div>;
}
