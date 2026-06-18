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

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()[\]{}:：._-]/g, "");
}

function pickValue(row: Record<string, string>, aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeHeader);
  const entry = Object.entries(row).find(([key]) => normalizedAliases.includes(normalizeHeader(key)));
  return entry?.[1]?.trim() || null;
}

function parseSubmittedAt(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function buildRows(values: string[][], spreadsheetId: string, sheetName: string) {
  const [headerRow, ...dataRows] = values;
  if (!headerRow || dataRows.length === 0) return [];

  const headers = headerRow.map((header, index) => header.trim() || `컬럼 ${index + 1}`);
  const now = new Date().toISOString();

  return dataRows
    .map((cells, index) => {
      const sourceRowNumber = index + 2;
      const sourceData = Object.fromEntries(headers.map((header, cellIndex) => [header, String(cells[cellIndex] ?? "").trim()]));
      const name =
        pickValue(sourceData, ["name", "이름", "성명", "새가족이름", "신청자", "신청자이름"]) ??
        pickValue(sourceData, ["koreanname", "한국이름"]) ??
        "";
      if (!name) return null;

      return {
        source_key: `${spreadsheetId}:${sheetName}:${sourceRowNumber}`,
        source_row_number: sourceRowNumber,
        submitted_at: parseSubmittedAt(pickValue(sourceData, ["timestamp", "타임스탬프", "제출시간", "신청일시"])),
        name,
        email: pickValue(sourceData, ["email", "이메일", "메일", "이메일주소"]),
        phone: pickValue(sourceData, ["phone", "전화번호", "연락처", "휴대폰", "핸드폰"]),
        group_interest: pickValue(sourceData, ["순", "소그룹", "희망순", "관심순", "group", "smallgroup"]),
        memo: pickValue(sourceData, ["memo", "메모", "비고", "요청사항", "기도제목", "notes"]),
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

  if (rows.length === 0) {
    return {
      spreadsheetId: sheet.spreadsheetId,
      sheetName: sheet.sheetName,
      spreadsheetUrl: sheet.spreadsheetUrl,
      syncedRows: 0,
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
  };
}
