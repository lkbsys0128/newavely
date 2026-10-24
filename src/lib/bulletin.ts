import { isRegisteredMember } from "./registration-access";

export const bulletinBucket = "bulletins";
export const bulletinMaxBytes = 3 * 1024 * 1024;
export type Bulletin = { title: string; event_date: string; image_path: string; version: number };

export function canManageBulletin(member: { role: string; status: string } | null | undefined) {
  return isRegisteredMember(member) && (member?.role === "owner" || member?.role === "admin");
}

export function bulletinImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | null {
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  return null;
}

export function validBulletinDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
