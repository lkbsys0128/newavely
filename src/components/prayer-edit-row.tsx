"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";
import { changePrayerItemType, prayerItemTypes, type PrayerEditEntry } from "@/lib/prayer-editor";

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
    <label><span className="prayer-mobile-label">찬양 제목 · 내용</span><textarea aria-label={`${index + 1}번 내용`} rows={2} value={entry.detail} maxLength={500} disabled={pending}
      onChange={(event) => onChange({ ...entry, detail: event.target.value })} /></label>
    <div className="prayer-row-tools"><button className="prayer-icon-button" type="button" title="행 삭제" aria-label={`${index + 1}번 행 삭제`}
      disabled={pending || onlyRow} onClick={onDelete}><Trash2 size={17} /></button></div>
  </div>;
}
