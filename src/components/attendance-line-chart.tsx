"use client";

import { useEffect, useRef, useState } from "react";
import type { DailyAttendancePoint } from "@/lib/attendance-trend";

const lineColor = "#158475";

export function AttendanceLineChart({ points }: { points: DailyAttendancePoint[] }) {
  const [selectedDate, setSelectedDate] = useState("");
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [points.length > 0]);
  const selected = points.find((point) => point.date === selectedDate) ?? points.at(-1);
  if (!points.length) return <p className="empty-table-state">선택 기간에 표시할 출석 기록이 없습니다.</p>;
  const max = Math.max(5, ...points.map((point) => point.combined));
  const ceiling = Math.ceil(max / 4) * 4;
  const plotWidth = width - 62;
  const x = (index: number) => points.length === 1 ? width / 2 : 44 + index / (points.length - 1) * plotWidth;
  const y = (value: number) => 218 - value / ceiling * 192;
  const timeStart = Date.parse(points[0].date);
  const timeEnd = Date.parse(points[points.length - 1].date);
  const dateX = (index: number) => timeEnd === timeStart ? x(index) : 44 + (Date.parse(points[index].date) - timeStart) / (timeEnd - timeStart) * plotWidth;
  return <div className="attendance-line-chart" ref={container}>
    <div className="attendance-line-legend"><span><i style={{ background: lineColor }} />전체 출석</span></div>
    <svg viewBox={`0 0 ${width} 258`} role="img" aria-label="선택 기간 날짜별 출석 인원 추이">
      {[0, 1, 2, 3, 4].map((step) => { const value = ceiling * step / 4; return <g key={step}><line x1="44" x2={width - 18} y1={y(value)} y2={y(value)} stroke="var(--line)" /><text x="36" y={y(value) + 4} textAnchor="end">{value}</text></g>; })}
      <path d={points.map((point, index) => `${index === 0 ? "M" : "L"}${dateX(index)},${y(point.combined)}`).join(" ")} fill="none" stroke={lineColor} strokeWidth="2.5" />
      {points.map((point, index) => <circle key={point.date} cx={dateX(index)} cy={y(point.combined)} r={point.date === selected?.date ? 5 : 3} fill={lineColor}><title>{`${point.date} 전체 출석 ${point.combined}명`}</title></circle>)}
      {points.map((point, index) => <rect key={point.date} x={dateX(index) - Math.min(20, plotWidth / points.length / 2)} y="15" width={Math.min(40, plotWidth / points.length)} height="210" fill="transparent" onMouseEnter={() => setSelectedDate(point.date)} onClick={() => setSelectedDate(point.date)} />)}
      {[...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])].map((index) => <text key={index} x={dateX(index)} y="244" textAnchor="middle">{points[index].date.slice(5).replace("-", "/")}</text>)}
    </svg>
    <div className="attendance-line-detail"><label>날짜<select aria-label="그래프 상세 날짜" value={selected?.date ?? ""} onChange={(event) => setSelectedDate(event.target.value)}>{points.map((point) => <option key={point.date}>{point.date}</option>)}</select></label>
      <span>전체 출석<strong>{selected?.combined ?? 0}명</strong></span>
    </div>
  </div>;
}
