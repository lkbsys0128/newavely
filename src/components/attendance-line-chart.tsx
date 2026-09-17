"use client";

import { useEffect, useRef, useState } from "react";
import type { DailyAttendancePoint, DailyAttendanceTotal } from "@/lib/attendance-trend";

const series = [
  { key: "total", label: "총 출석", color: "#3289cf" },
  { key: "youth", label: "청년 출석", color: "#158475" },
] as const;

export function AttendanceLineChart({ points, totals, youthLabel = "청년 출석" }: { points: DailyAttendancePoint[]; totals?: DailyAttendanceTotal[]; youthLabel?: string }) {
  const data = totals ? totals.map((point) => ({ date: point.date, youth: point.youth, total: point.total })) : points.map((point) => ({ date: point.date, youth: point.combined, total: null }));
  const visible = series.filter((item) => item.key === "youth" || totals !== undefined);
  const [selectedDate, setSelectedDate] = useState("");
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [data.length > 0]);
  const selected = data.find((point) => point.date === selectedDate) ?? data.at(-1);
  if (!data.length) return <p className="empty-table-state">선택 기간에 표시할 출석 기록이 없습니다.</p>;
  const max = Math.max(5, ...data.flatMap((point) => [point.youth, point.total ?? 0]));
  const selectedTotals = totals?.find((point) => point.date === selected?.date);
  const ceiling = Math.ceil(max / 4) * 4;
  const plotWidth = width - 62;
  const x = (index: number) => data.length === 1 ? width / 2 : 44 + index / (data.length - 1) * plotWidth;
  const y = (value: number) => 218 - value / ceiling * 192;
  const timeStart = Date.parse(data[0].date);
  const timeEnd = Date.parse(data[data.length - 1].date);
  const dateX = (index: number) => timeEnd === timeStart ? x(index) : 44 + (Date.parse(data[index].date) - timeStart) / (timeEnd - timeStart) * plotWidth;
  return <div className="attendance-line-chart" ref={container}>
    <div className="attendance-line-legend">{visible.map((item) => <span key={item.key}><i style={{ background: item.color }} />{item.key === "youth" ? youthLabel : item.label}</span>)}</div>
    <svg viewBox={`0 0 ${width} 258`} role="img" aria-label="선택 기간 날짜별 출석 인원 추이">
      {[0, 1, 2, 3, 4].map((step) => { const value = ceiling * step / 4; return <g key={step}><line x1="44" x2={width - 18} y1={y(value)} y2={y(value)} stroke="var(--line)" /><text x="36" y={y(value) + 4} textAnchor="end">{value}</text></g>; })}
      {visible.map(({ key, color, label }) => <g key={key}>
        <path d={data.map((point, index) => `${index === 0 ? "M" : "L"}${dateX(index)},${y(point[key] ?? 0)}`).join(" ")} fill="none" stroke={color} strokeWidth="2.5" />
        {data.map((point, index) => <circle key={point.date} cx={dateX(index)} cy={y(point[key] ?? 0)} r={point.date === selected?.date ? 5 : 3} fill={color}><title>{`${point.date} ${key === "youth" ? youthLabel : label} ${point[key]}명`}</title></circle>)}
      </g>)}
      {data.map((point, index) => <rect key={point.date} x={dateX(index) - Math.min(20, plotWidth / data.length / 2)} y="15" width={Math.min(40, plotWidth / data.length)} height="210" fill="transparent" onMouseEnter={() => setSelectedDate(point.date)} onClick={() => setSelectedDate(point.date)} />)}
      {[...new Set([0, Math.floor((data.length - 1) / 2), data.length - 1])].map((index) => <text key={index} x={dateX(index)} y="244" textAnchor="middle">{data[index].date.slice(5).replace("-", "/")}</text>)}
    </svg>
    <div className="attendance-line-detail"><label>날짜<select aria-label="그래프 상세 날짜" value={selected?.date ?? ""} onChange={(event) => setSelectedDate(event.target.value)}>{data.map((point) => <option key={point.date}>{point.date}</option>)}</select></label>
      {visible.map(({ key, label }) => <span key={key}>{key === "youth" ? youthLabel : label}<strong>{selected?.[key] ?? 0}명</strong></span>)}
    </div>
    {selectedTotals ? <div className="attendance-line-extras"><span>교역자 <strong>{selectedTotals.clergy}명</strong></span><span>팀장 이상 <strong>{selectedTotals.teamLeaders}명</strong></span><span>방문자 <strong>{selectedTotals.visitors}명</strong></span><span>새가족 <strong>{selectedTotals.newFamily}명</strong></span></div> : null}
  </div>;
}
