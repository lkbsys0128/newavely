import { createSign } from "node:crypto";

const tokenUrl = "https://oauth2.googleapis.com/token";
const sheetsScope = "https://www.googleapis.com/auth/spreadsheets";

export type SheetSyncResult = {
  spreadsheetId: string;
  sheetName: string;
  updatedRows: number;
  updatedColumns: number;
};

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} 환경 변수가 필요합니다.`);
  return value;
}

function getPrivateKey() {
  return getRequiredEnv("GOOGLE_PRIVATE_KEY").replace(/^"|"$/g, "").replace(/\\n/g, "\n");
}

async function getGoogleAccessToken() {
  const email = getRequiredEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKey = getPrivateKey();
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64UrlEncode(
    JSON.stringify({
      iss: email,
      scope: sheetsScope,
      aud: tokenUrl,
      exp: now + 3600,
      iat: now,
    }),
  );
  const unsignedToken = `${header}.${claim}`;
  const signature = createSign("RSA-SHA256").update(unsignedToken).sign(privateKey);
  const assertion = `${unsignedToken}.${base64UrlEncode(signature)}`;

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const payload = (await response.json()) as { access_token?: string; error_description?: string; error?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description ?? payload.error ?? "Google access token 발급에 실패했습니다.");
  }

  return payload.access_token;
}

async function callSheetsApi(path: string, accessToken: string, init: RequestInit = {}) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Sheets API 오류: ${response.status} ${body}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

export async function replaceGoogleSheetValues(rows: string[][]): Promise<SheetSyncResult> {
  if (rows.length === 0) throw new Error("내보낼 교적부 행이 없습니다.");

  const spreadsheetId = getRequiredEnv("GOOGLE_SHEET_ID");
  const sheetName = process.env.GOOGLE_SHEET_NAME?.trim() || "Members";
  const accessToken = await getGoogleAccessToken();
  const encodedClearRange = encodeURIComponent(`${sheetName}!A:ZZ`);
  const encodedUpdateRange = encodeURIComponent(`${sheetName}!A1`);

  await callSheetsApi(`${spreadsheetId}/values/${encodedClearRange}:clear`, accessToken, {
    method: "POST",
    body: JSON.stringify({}),
  });

  const result = (await callSheetsApi(`${spreadsheetId}/values/${encodedUpdateRange}?valueInputOption=RAW`, accessToken, {
    method: "PUT",
    body: JSON.stringify({ values: rows }),
  })) as { updatedRows?: number; updatedColumns?: number };

  return {
    spreadsheetId,
    sheetName,
    updatedRows: result.updatedRows ?? rows.length,
    updatedColumns: result.updatedColumns ?? rows[0]?.length ?? 0,
  };
}
