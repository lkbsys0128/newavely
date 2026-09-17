import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { loadTsModule } from "./load-ts-module.mjs";

const { getPublicLinks } = loadTsModule("../src/lib/public-links.ts");
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("public links only expose display fields and accept safe web URLs", async () => {
  const urls = ["https://example.com", "http://example.org", "javascript:alert(1)", "data:text/html,test", "invalid", "https://user:password@example.com"];
  const client = { rpc: async (...args) => {
    assert.deepEqual(args, ["get_public_important_links"]);
    return { data: urls.map((url, id) => ({ id: String(id), url, title: "Link", description: null, icon_key: "website", created_by_member_id: "private", creator: { name: "private" } })), error: null };
  } };
  const links = await getPublicLinks(client);
  assert.equal(links.length, 2);
  assert.deepEqual(Array.from(links, (link) => link.url), urls.slice(0, 2));
  for (const link of links) {
    assert.deepEqual(Object.keys(link).sort(), ["description", "iconKey", "id", "title", "url"]);
    assert.equal(link.description, "");
  }
});

test("public link errors are not silently treated as an empty list", async () => {
  const error = new Error("missing RPC");
  await assert.rejects(getPublicLinks({ rpc: async () => ({ data: null, error }) }), error);
  assert.equal((await getPublicLinks({ rpc: async () => ({ data: null, error: null }) })).length, 0);
});

test("public links RPC grants only function execution and no member or write access", () => {
  const sql = read("../db/043_public_important_links.sql");
  assert.match(sql, /security definer\s+set search_path = ''/);
  assert.match(sql, /returns table \(id uuid, title text, description text, url text, icon_key text\)/);
  assert.match(sql, /order by l.display_order, l.created_at, l.id/);
  assert.match(sql, /revoke all on function public.get_public_important_links\(\) from public/);
  assert.match(sql, /grant execute .* to anon, authenticated/);
  assert.doesNotMatch(sql, /grant (?:select|insert|update|delete)|join public.members|select \*/i);
  assert.ok(read("../db/schema.sql").includes(sql.trim()));
});

test("anonymous link UI has no mutation controls and does not load the roster", () => {
  const page = read("../src/app/links/page.tsx");
  assert.doesNotMatch(page, /getAppPageData|AppPageGate|service-role/);
  assert.match(page, /let user: AppUser \| null = null/);
  assert.match(page, /if \(auth.user\)/);
  assert.match(page, /member.status !== "inactive"/);
  const ui = read("../src/components/dashboard.tsx").split("export function LinksPageContent")[1].split("const newFamilyStatusLabels")[0];
  assert.match(ui, /Boolean\(user && hasPermission\(user.role, "links:write"\)\)/);
  assert.match(ui, /canCreateLinks \? \[\{ href: "#link-create"/);
  assert.match(ui, /canCreateLinks \? \(/);
  assert.match(ui, /canDeleteLinks \? \(/);
  const actions = read("../src/app/actions.ts");
  for (const action of ["createImportantLink", "deleteImportantLink"]) {
    const body = actions.split(`export async function ${action}`)[1].split("export async function")[0];
    assert.match(body, /getAuthorizedCurrentMember\("links:write"\)/);
    assert.match(body, /writeAuditLog/);
  }
});
