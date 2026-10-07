"use client";

import { useEffect, useState, useTransition } from "react";
import { Download, Save, Trash2, Plus, RefreshCw } from "lucide-react";
import { listPrayerTemplates, savePrayerTemplate, deletePrayerTemplate } from "@/app/prayer/template-actions";
import type { PrayerEntry } from "@/lib/prayer-meetings";
import type { PrayerTemplate } from "@/lib/prayer-templates";

export function PrayerTemplateControls({ entries, disabled, dirty, onLoad }: {
  entries: PrayerEntry[]; disabled: boolean; dirty: boolean; onLoad: (entries: PrayerEntry[]) => void;
}) {
  const [templates, setTemplates] = useState<PrayerTemplate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [clearContents, setClearContents] = useState(true);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const selected = templates.find((template) => template.id === selectedId);
  const busy = disabled || pending || loading;
  useEffect(() => {
    let cancelled = false;
    void listPrayerTemplates().then((result) => {
      if (cancelled) return;
      setTemplates(result.templates); setMessage(result.message); setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);
  function save(replace: boolean) {
    if (replace && (!selected || !window.confirm(`“${selected.name}” 템플릿을 현재 순서로 변경할까요?`))) return;
    startTransition(async () => {
      const result = await savePrayerTemplate({ id: replace ? selected?.id : null, version: replace ? selected?.version : 0, name, entries, clearContents });
      setMessage(result.message);
      if (result.template) {
        const saved = result.template;
        setTemplates((current) => [...current.filter((item) => item.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
        setSelectedId(saved.id); setName(saved.name);
      }
    });
  }
  return <details className="prayer-template-controls">
    <summary>템플릿</summary>
    <div className="prayer-template-fields">
      <label>저장된 템플릿<select value={selectedId} disabled={busy} onChange={(event) => {
        const id = event.target.value; setSelectedId(id); setName(templates.find((item) => item.id === id)?.name ?? ""); setMessage("");
      }}><option value="">{loading ? "불러오는 중" : "템플릿 선택"}</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="prayer-template-buttons">
        <button type="button" className="secondary-button" disabled={busy || !selected} onClick={() => {
          if (!selected || (dirty && !window.confirm("현재 작성한 순서를 템플릿으로 바꿀까요?"))) return;
          onLoad(selected.entries); setMessage("템플릿을 불러왔습니다.");
        }}><Download size={16} />불러오기</button>
        <button type="button" className="secondary-button" disabled={busy || !selected} aria-label="선택한 템플릿 삭제" title="템플릿 삭제" onClick={() => {
          if (!selected || !window.confirm(`“${selected.name}” 템플릿을 삭제할까요? 기존 기도회는 유지됩니다.`)) return;
          startTransition(async () => {
            const result = await deletePrayerTemplate({ id: selected.id, version: selected.version }); setMessage(result.message);
            if (result.ok) { setTemplates((current) => current.filter((item) => item.id !== selected.id)); setSelectedId(""); setName(""); }
          });
        }}><Trash2 size={16} /></button>
        <button type="button" className="secondary-button" disabled={busy} title="템플릿 목록 새로고침" aria-label="템플릿 목록 새로고침" onClick={() => startTransition(async () => {
          const result = await listPrayerTemplates(); setTemplates(result.templates); setMessage(result.message);
        })}><RefreshCw size={16} /></button>
      </div>
      <label>템플릿 이름<input value={name} maxLength={80} disabled={busy} onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} /></label>
      <div className="prayer-template-buttons">
        <button type="button" className="secondary-button" disabled={busy || !name.trim()} onClick={() => save(false)}><Plus size={16} />새 템플릿 저장</button>
        <button type="button" className="secondary-button" disabled={busy || !selected || !name.trim()} onClick={() => save(true)}><Save size={16} />선택 템플릿 변경</button>
      </div>
    </div>
    <label className="prayer-template-reset"><input type="checkbox" checked={clearContents} disabled={busy} onChange={(event) => setClearContents(event.target.checked)} /><span>저장 시 찬양·묵상 내용과 마무리 기도 뒷부분 비우기</span></label>
    {message ? <p className="prayer-message" role="status">{message}</p> : null}
  </details>;
}
