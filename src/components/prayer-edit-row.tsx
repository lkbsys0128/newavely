"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, Plus } from "lucide-react";
import { changePrayerItemType, prayerItemTypes, selectPrayerSource, type PrayerEditEntry } from "@/lib/prayer-editor";
import { PrayerLinkEditor } from "@/components/prayer-link-editor";
import { parseBibleLink } from "@/lib/bible-links";

type Props = { entry: PrayerEditEntry; index: number; pending: boolean; onlyRow: boolean;
  onChange: (entry: PrayerEditEntry) => void; onDelete: () => void };

export function PrayerEditRow({ entry, index, pending, onlyRow, onChange, onDelete }: Props) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: entry.key, disabled: pending });
  return <div ref={setNodeRef} className={`prayer-edit-row${isDragging ? " is-dragging" : ""}`}
    style={{ transform: CSS.Transform.toString(transform), transition }}>
    <div className="prayer-row-position">
      <button ref={setActivatorNodeRef} {...attributes} {...listeners} className="prayer-icon-button prayer-drag-handle" type="button"
        title="순서 이동" aria-label={`${index + 1}번 순서 이동`} disabled={pending}><GripVertical size={20} /></button>
      <span className="prayer-number">{String(index + 1).padStart(2, "0")}</span>
    </div>
    <div className="prayer-item-fields">
      <label><span className="prayer-mobile-label">항목</span><select aria-label={`${index + 1}번 항목`} value={entry.kind} disabled={pending}
        onChange={(event) => onChange(changePrayerItemType(entry, event.target.value))}>
        {prayerItemTypes.map((type) => <option key={type} value={type}>{type}</option>)}<option value="custom">직접 입력</option>
      </select></label>
      {entry.kind === "custom" ? <label><span>직접 입력</span><input aria-label={`${index + 1}번 직접 입력`} value={entry.title} required maxLength={120} disabled={pending}
        onChange={(event) => onChange({ ...entry, title: event.target.value, customTitle: event.target.value })} /></label> : null}
    </div>
    <div className="prayer-item-content"><label><span className="prayer-mobile-label">찬양 제목 · 내용</span><textarea aria-label={`${index + 1}번 내용`} rows={2} value={entry.detail} maxLength={500} disabled={pending}
      onChange={(event) => onChange({ ...entry, detail: event.target.value })} /></label>
      {entry.kind === "묵상/나눔" || entry.kind === "찬양" || entry.sourceUrl ? <PrayerLinkEditor url={entry.sourceUrl} text={entry.sourceLabels?.[entry.sourceUrl ?? ""]}
        bible={entry.kind === "묵상/나눔" || Boolean(parseBibleLink(entry.sourceUrl))} disabled={pending} label={`${index + 1}번`}
        onChange={(sourceUrl, text, songTitle) => onChange({ ...selectPrayerSource(entry, sourceUrl, songTitle), sourceLabels: { ...entry.sourceLabels, [sourceUrl]: text } })} /> : null}
      {(entry.additionalSourceUrls ?? []).map((url, linkIndex) => {
        const label = `${index + 1}번 추가 링크 ${linkIndex + 1}`;
        const update = (value: string, text: string) => onChange({ ...entry, additionalSourceUrls: entry.additionalSourceUrls?.map((item, i) => i === linkIndex ? value : item), sourceLabels: { ...entry.sourceLabels, [value]: text } });
        return <div className="prayer-extra-link" key={entry.linkKeys?.[linkIndex] ?? linkIndex}>
          <div className="prayer-extra-link-heading"><span>링크 {linkIndex + 2}</span>
            <button type="button" className="prayer-icon-button" title="추가 링크 삭제" aria-label={`${label} 삭제`} disabled={pending}
              onClick={() => onChange({ ...entry, additionalSourceUrls: entry.additionalSourceUrls?.filter((_, i) => i !== linkIndex), linkKeys: entry.linkKeys?.filter((_, i) => i !== linkIndex) })}><Trash2 size={16} /></button></div>
          <PrayerLinkEditor url={url} text={entry.sourceLabels?.[url]} bible={entry.kind === "묵상/나눔" || Boolean(parseBibleLink(url))} disabled={pending} label={label} onChange={update} />
        </div>;
      })}
      {entry.kind === "찬양" || entry.kind === "묵상/나눔" || entry.sourceUrl || entry.additionalSourceUrls?.length ?
        <button type="button" className="secondary-button prayer-add-link" disabled={pending || (entry.additionalSourceUrls?.length ?? 0) >= 9}
          onClick={() => onChange({ ...entry, additionalSourceUrls: [...(entry.additionalSourceUrls ?? []), ""], linkKeys: [...(entry.linkKeys ?? []), crypto.randomUUID()] })}><Plus size={16} />링크 추가</button> : null}
    </div>
    <div className="prayer-row-tools"><button className="prayer-icon-button" type="button" title="행 삭제" aria-label={`${index + 1}번 행 삭제`}
      disabled={pending || onlyRow} onClick={onDelete}><Trash2 size={17} /></button></div>
  </div>;
}
