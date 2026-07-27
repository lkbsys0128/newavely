import { readGoogleSheetValues } from "@/lib/google-sheets";

const defaultNewFamilySheetId = "1T-DD9i7lBoFqK6qHXKSKeEgs-FOsq24c8dWzwLWFGrg";

type NewFamilyApplicantUpsert = {
  source_key: string;
  source_row_number: number;
  submitted_at: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  group_interest: string | null;
  memo: string | null;
  source_data: Record<string, string>;
  last_synced_at: string;
  updated_at: string;
};

type SupabaseLike = {
  from: (table: string) => {
    upsert: (
      values: NewFamilyApplicantUpsert[],
      options: { onConflict: string },
    ) => { select: (columns: string, options?: { count?: "exact" }) => unknown };
  };
};

const newFamilySheetColumnIndexes = {
  submittedAt: 0,
  birthdate: 2,
  gender: 3,
  firstVisitDate: 4,
  residenceArea: 6,
  churchExperience: 7,
  visitPurpose: 9,
  visitPath: 10,
  referrerName: 11,
  preferredLanguage: 12,
  privacyConsent: 13,
  rideNeeded: 14,
} as const;

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()[\]{}:：._-]/g, "");
}

function pickValue(row: Record<string, string>, aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeHeader);
  const entry = Object.entries(row).find(([key]) => {
    const normalizedKey = normalizeHeader(key);
    return normalizedAliases.some((alias) => normalizedKey === alias || normalizedKey.includes(alias));
  });
  return entry?.[1]?.trim() || null;
}

function pickLikelyName(row: Record<string, string>) {
  const directName = pickValue(row, [
    "name",
    "이름",
    "성명",
    "성함",
    "새가족이름",
    "신청자",
    "신청자이름",
    "koreanname",
    "한국이름",
  ]);
  if (directName) return directName;

  const ignoredHeaders = ["timestamp", "타임스탬프", "email", "이메일", "phone", "전화", "연락", "memo", "메모", "주소"];
  const ignored = ignoredHeaders.map(normalizeHeader);
  const fallback = Object.entries(row).find(([key, value]) => {
    const normalizedKey = normalizeHeader(key);
    const normalizedValue = value.trim();
    if (!normalizedValue) return false;
    if (ignored.some((item) => normalizedKey.includes(item))) return false;
    if (normalizedValue.includes("@")) return false;
    if (/^\+?[\d\s().-]{7,}$/.test(normalizedValue)) return false;
    return true;
  });

  return fallback?.[1]?.trim() || "";
}

function parseSubmittedAt(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function pickCell(cells: string[], index: number) {
  return String(cells[index] ?? "").trim() || null;
}

function applyCanonicalSheetFields(sourceData: Record<string, string>, cells: string[]) {
  const canonicalFields = {
    신청일: pickCell(cells, newFamilySheetColumnIndexes.submittedAt),
    생년월일: pickCell(cells, newFamilySheetColumnIndexes.birthdate),
    성별: pickCell(cells, newFamilySheetColumnIndexes.gender),
    "첫 방문일": pickCell(cells, newFamilySheetColumnIndexes.firstVisitDate),
    "거주 지역": pickCell(cells, newFamilySheetColumnIndexes.residenceArea),
    "세례 유무": pickCell(cells, newFamilySheetColumnIndexes.churchExperience),
    "방문 목적": pickCell(cells, newFamilySheetColumnIndexes.visitPurpose),
    "방문 경위": pickCell(cells, newFamilySheetColumnIndexes.visitPath),
    "지인 이름": pickCell(cells, newFamilySheetColumnIndexes.referrerName),
    "사용 언어": pickCell(cells, newFamilySheetColumnIndexes.preferredLanguage),
    "개인정보 수집동의": pickCell(cells, newFamilySheetColumnIndexes.privacyConsent),
    "라이드 필요여부": pickCell(cells, newFamilySheetColumnIndexes.rideNeeded),
  };

  return Object.entries(canonicalFields).reduce(
    (nextSourceData, [key, value]) => {
      if (value && !nextSourceData[key]) nextSourceData[key] = value;
      return nextSourceData;
    },
    { ...sourceData },
  );
}

function buildRows(values: string[][], spreadsheetId: string, sheetName: string) {
  const [headerRow, ...dataRows] = values;
  if (!headerRow || dataRows.length === 0) return [];

  const headers = headerRow.map((header, index) => header.trim() || `컬럼 ${index + 1}`);
  const now = new Date().toISOString();

  return dataRows
    .map((cells, index) => {
      const sourceRowNumber = index + 2;
      const sourceData = applyCanonicalSheetFields(
        Object.fromEntries(headers.map((header, cellIndex) => [header, String(cells[cellIndex] ?? "").trim()])),
        cells,
      );
      const name = pickLikelyName(sourceData);
      if (!name) return null;

      return {
        source_key: `${spreadsheetId}:${sheetName}:${sourceRowNumber}`,
        source_row_number: sourceRowNumber,
        submitted_at: parseSubmittedAt(
          pickValue(sourceData, [
            "timestamp",
            "타임스탬프",
            "제출시간",
            "제출 시간",
            "신청일시",
            "신청 일시",
            "신청일",
            "신청 일",
            "신청일자",
            "신청 일자",
            "등록일",
            "등록 일자",
            "등록 날짜",
            "방문일",
            "첫방문일",
            "첫 방문일",
          ]),
        ),
        name,
        email: pickValue(sourceData, ["email", "이메일", "메일", "이메일주소", "이메일 주소"]),
        phone: pickValue(sourceData, ["phone", "전화번호", "전화", "연락처", "연락", "휴대폰", "핸드폰"]),
        group_interest: pickValue(sourceData, ["예정 순", "순", "소그룹", "희망순", "관심순", "관심 순", "group", "smallgroup", "소속"]),
        memo: pickValue(sourceData, ["memo", "메모", "비고", "요청사항", "기도제목", "notes", "남기고싶은말"]),
        source_data: sourceData,
        last_synced_at: now,
        updated_at: now,
      };
    })
    .filter((row): row is NewFamilyApplicantUpsert => row !== null);
}

export async function syncNewFamilyApplicantsFromSheet(supabase: SupabaseLike) {
  const spreadsheetId = process.env.NEW_FAMILY_SHEET_ID?.trim() || defaultNewFamilySheetId;
  const sheetName = process.env.NEW_FAMILY_SHEET_NAME?.trim();
  const sheet = await readGoogleSheetValues({ spreadsheetId, sheetName });
  const rows = buildRows(sheet.values, sheet.spreadsheetId, sheet.sheetName);
  const readRows = Math.max(sheet.values.length - 1, 0);

  if (rows.length === 0) {
    return {
      spreadsheetId: sheet.spreadsheetId,
      sheetName: sheet.sheetName,
      spreadsheetUrl: sheet.spreadsheetUrl,
      syncedRows: 0,
      readRows,
      parsedRows: 0,
      skippedRows: readRows,
      scannedSheetNames: sheet.scannedSheetNames,
    };
  }

  const { error, count } = (await supabase
    .from("new_family_applicants")
    .upsert(rows, { onConflict: "source_key" })
    .select("id", { count: "exact" })) as { error: { message: string } | null; count: number | null };

  if (error) throw new Error(error.message);

  return {
    spreadsheetId: sheet.spreadsheetId,
    sheetName: sheet.sheetName,
    spreadsheetUrl: sheet.spreadsheetUrl,
    syncedRows: count ?? rows.length,
    readRows,
    parsedRows: rows.length,
    skippedRows: Math.max(readRows - rows.length, 0),
    scannedSheetNames: sheet.scannedSheetNames,
  };
}
