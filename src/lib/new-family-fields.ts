export const newFamilyFieldAliases: Record<string, string[]> = {
  신청일: ["신청일", "타임스탬프", "timestamp", "submitted at", "등록 일자"],
  생년월일: ["생년월일", "생일", "birthdate", "birthday", "date of birth"],
  성별: ["성별", "gender", "sex"],
  "첫 방문일": ["첫 방문일", "방문일자", "방문일", "first visit", "visit date"],
  "거주 지역": ["거주 지역", "거주지", "residence", "city"],
  "세례 유무": ["세례 유무", "교회 경험", "church experience", "baptism"],
  "방문 목적": ["방문 목적", "visit purpose"],
  "방문 경위": ["방문 경위", "how did you hear"],
  "지인 이름": ["지인 이름", "referrer"],
  "사용 언어": ["사용 언어", "language"],
  "개인정보 수집동의": ["개인정보 수집동의", "개인정보 동의", "privacy consent"],
  "라이드 필요여부": ["라이드 필요", "ride"],
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[\s()[\]{}:：._/-]/g, "");
}

export function normalizeNewFamilyGender(value: string) {
  if (/^(여|여성|여자|female|f)(?:\s|\(|$)/i.test(value.trim())) return "여";
  if (/^(남|남성|남자|male|m)(?:\s|\(|$)/i.test(value.trim())) return "남";
  return "";
}

export function normalizeNewFamilyDate(value: string) {
  const raw = value.trim();
  let parts = raw.match(/^(\d{4})[./-]\s*(\d{1,2})[./-]\s*(\d{1,2})\.?$/);
  if (!parts) {
    const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (us) parts = [raw, us[3], us[1], us[2]];
  }
  if (!parts) return "";
  const [year, month, day] = parts.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > 2100 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function readNewFamilyField(source: Record<string, unknown>, keys: string[]) {
  const rawAliases = keys.flatMap((key) => newFamilyFieldAliases[key] ?? [key]);
  const aliases = rawAliases.map(normalize);
  const entries = Object.entries(source).filter(([key]) => rawAliases.some((alias) => {
    if (normalize(key) === normalize(alias)) return true;
    if (/[가-힣]/.test(alias)) return normalize(key).includes(normalize(alias));
    return key.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").includes(alias.toLowerCase())
      || (alias.includes(" ") && key.toLowerCase().includes(alias.toLowerCase()));
  }));
  // Prefer exact headers, but skip invalid old positional values and recover from raw headers.
  entries.sort(([a], [b]) => Number(!aliases.includes(normalize(a))) - Number(!aliases.includes(normalize(b))));
  for (const [, raw] of entries) {
    if (typeof raw !== "string" && typeof raw !== "number") continue;
    const value = String(raw).trim();
    if (!value) continue;
    if (keys.some((key) => (newFamilyFieldAliases.성별).includes(key))) {
      const gender = normalizeNewFamilyGender(value);
      if (gender) return gender;
      continue;
    }
    if (keys.some((key) => [...newFamilyFieldAliases.생년월일, ...newFamilyFieldAliases["첫 방문일"]].includes(key))) {
      const date = normalizeNewFamilyDate(value);
      if (date) return date;
      continue;
    }
    return value;
  }
  return "";
}

export function canonicalizeNewFamilyFields(source: Record<string, string>) {
  const result = { ...source };
  for (const key of Object.keys(newFamilyFieldAliases)) {
    const value = readNewFamilyField(source, [key]);
    if (value) result[key] = value;
  }
  return result;
}

export function getNewFamilyAge(source: Record<string, unknown>, today = new Date()) {
  const birthdate = readNewFamilyField(source, ["생년월일"]);
  if (birthdate) {
    const [year, month, day] = birthdate.split("-").map(Number);
    const current = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "numeric", day: "numeric" }).format(today).split("/").map(Number);
    const age = current[2] - year - Number(current[0] < month || (current[0] === month && current[1] < day));
    return age >= 0 && age <= 120 ? String(age) : "";
  }
  const age = readNewFamilyField(source, ["만 나이", "age"]);
  return /^\d{1,3}$/.test(age) && Number(age) <= 120 ? age : "";
}
