"use client";

import { useEffect, useRef, useState } from "react";
import type { DailyAttendancePoint } from "@/lib/attendance-trend";

const series = [
  { key: "combined", label: "전체 출석", color: "#158475" },
  { key: "worship", label: "예배", color: "#3289cf" },
  { key: "meeting", label: "순모임", color: "#bc7622" },
] as const;

export function AttendanceLineChart({ points, eventType = "all" }: { points: DailyAttendancePoint[]; eventType?: string }) {
  const [selectedDate, setSelectedDate] = useState("");
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [points.length > 0, eventType]);
  const visible = series.filter((item) => eventType === "all" || (eventType === "주일 예배" ? item.key === "worship" : eventType === "순모임" && item.key === "meeting"));
  const selected = points.find((point) => point.date === selectedDate) ?? points.at(-1);
  if (!points.length || !visible.length) return <p className="empty-table-state">선택 기간에 표시할 출석 기록이 없습니다.</p>;
  const max = Math.max(5, ...points.flatMap((point) => visible.map(({ key }) => point[key] ?? 0)));
  const ceiling = Math.ceil(max / 4) * 4;
  const plotWidth = width - 62;
  const x = (index: number) => points.length === 1 ? width / 2 : 44 + index / (points.length - 1) * plotWidth;
  const y = (value: number) => 218 - value / ceiling * 192;
  const timeStart = Date.parse(points[0].date);
  const timeEnd = Date.parse(points[points.length - 1].date);
  const dateX = (index: number) => timeEnd === timeStart ? x(index) : 44 + (Date.parse(points[index].date) - timeStart) / (timeEnd - timeStart) * plotWidth;
  return <div className="attendance-line-chart" ref={container}>
    <div className="attendance-line-legend">{visible.map((item) => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}</div>
    <svg viewBox={`0 0 ${width} 258`} role="img" aria-label="선택 기간 날짜별 출석 인원 추이">
      {[0, 1, 2, 3, 4].map((step) => { const value = ceiling * step / 4; return <g key={step}><line x1="44" x2={width - 18} y1={y(value)} y2={y(value)} stroke="var(--line)" /><text x="36" y={y(value) + 4} textAnchor="end">{value}</text></g>; })}
      {visible.map(({ key, color }) => <g key={key}>
        <path d={points.map((point, index) => point[key] === null ? "" : `${index === 0 || points[index - 1][key] === null ? "M" : "L"}${dateX(index)},${y(point[key]!)}`).join(" ")} fill="none" stroke={color} strokeWidth="2.5" />
        {points.map((point, index) => point[key] === null ? null : <circle key={point.date} cx={dateX(index)} cy={y(point[key]!)} r={point.date === selected?.date ? 5 : 3} fill={color}><title>{`${point.date} ${key === "combined" ? "전체 출석" : key === "worship" ? "예배" : "순모임"} ${point[key]}명`}</title></circle>)}
      </g>)}
      {points.map((point, index) => <rect key={point.date} x={dateX(index) - Math.min(20, plotWidth / points.length / 2)} y="15" width={Math.min(40, plotWidth / points.length)} height="210" fill="transparent" onMouseEnter={() => setSelectedDate(point.date)} onClick={() => setSelectedDate(point.date)} />)}
      {[...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])].map((index) => <text key={index} x={dateX(index)} y="244" textAnchor="middle">{points[index].date.slice(5).replace("-", "/")}</text>)}
    </svg>
    <div className="attendance-line-detail"><label>날짜<select aria-label="그래프 상세 날짜" value={selected?.date ?? ""} onChange={(event) => setSelectedDate(event.target.value)}>{points.map((point) => <option key={point.date}>{point.date}</option>)}</select></label>
      {visible.map(({ key, label }) => <span key={key}>{label}<strong>{selected?.[key] ?? "—"}{selected?.[key] !== null ? "명" : ""}</strong></span>)}
    </div>
  </div>;
}
