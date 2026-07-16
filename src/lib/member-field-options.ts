export const genderOptions = ["남", "여"] as const;
export const jobOptions = ["학생", "직장인", "기타"] as const;
export const baptismStatusOptions = ["세례/입교", "유아세례", "교회 처음"] as const;
export const ministryOptions = ["찬양팀", "예배운영팀", "웰컴팀", "순팀", "행정팀"] as const;

const legacyJobLabels: Record<string, string> = {
  사회인: "직장인",
};

const legacyBaptismLabels: Record<string, string> = {
  X: "교회 처음",
  "세례 X": "교회 처음",
  세례받지않음: "교회 처음",
};

const legacyMinistryLabels: Record<string, string> = {
  "예배 진행팀": "예배운영팀",
};

export function calculateKoreanAge(birthdate: unknown, today = new Date()) {
  if (typeof birthdate !== "string" || !birthdate) return "";

  const [year, month, day] = birthdate.split("-").map(Number);
  if (!year || !month || !day) return "";

  let age = today.getFullYear() - year;
  const birthdayThisYear = new Date(today.getFullYear(), month - 1, day);
  if (today < birthdayThisYear) age -= 1;

  return age >= 0 ? String(age) : "";
}

export function normalizeJobValue(value: unknown) {
  const normalized = String(value ?? "").trim();
  return legacyJobLabels[normalized] ?? normalized;
}

export function normalizeBaptismStatus(value: unknown) {
  const normalized = String(value ?? "").trim();
  return legacyBaptismLabels[normalized] ?? normalized;
}

export function normalizeMinistryValue(value: unknown) {
  const normalized = String(value ?? "").trim();
  return legacyMinistryLabels[normalized] ?? normalized;
}

export function normalizeMinistryList(value: unknown) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.map((item) => normalizeMinistryValue(item)).filter(Boolean))];
}

export function getMemberMinistryValues(customFields: Record<string, unknown>) {
  return normalizeMinistryList([
    ...normalizeMinistryList(customFields.ministries),
    customFields.ministry_1,
    customFields.ministry_2,
  ]);
}

export function appendCurrentOption(options: readonly string[], value: unknown) {
  const normalized = String(value ?? "").trim();
  if (!normalized || options.includes(normalized)) return [...options];
  return [...options, normalized];
}
