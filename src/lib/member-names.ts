import type { Member } from "@/lib/types";

const englishNamePattern = /\s*\(([A-Za-z][A-Za-z .'-]*)\)\s*$/;

export function getMemberEnglishName(member: Pick<Member, "customFields">) {
  const value = member.customFields.english_name;
  return typeof value === "string" ? value.trim() : "";
}

export function formatMemberDisplayName(member: Pick<Member, "name" | "customFields">) {
  const englishName = getMemberEnglishName(member);
  return englishName ? `${member.name} (${englishName})` : member.name;
}

export function splitCompositeMemberName(name: string) {
  const normalized = name.trim();
  const match = normalized.match(englishNamePattern);
  if (!match) return { koreanName: normalized, englishName: "" };

  return {
    koreanName: normalized.replace(englishNamePattern, "").trim(),
    englishName: match[1]?.trim() ?? "",
  };
}
