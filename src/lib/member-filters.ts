import type { Role } from "@/lib/rbac";
import type { Member } from "@/lib/types";

export type MemberFilters = {
  query: string;
  groupId: string;
  role: Role | "all";
  status: Member["status"] | "all";
  account: "all" | "connected" | "unconnected";
};

export type DuplicateMemberCandidate = {
  key: string;
  reasonLabel: string;
  members: Member[];
};

export const defaultMemberFilters: MemberFilters = {
  query: "",
  groupId: "all",
  role: "all",
  status: "all",
  account: "all",
};

export function isMergedPlaceholderMember(member: Pick<Member, "email">) {
  return member.email.trim().toLowerCase().endsWith("@merged.local");
}

export function isTestAccountMember(member: Pick<Member, "customFields">) {
  return member.customFields.test_account === true;
}

export function isStatsExcludedMember(member: Pick<Member, "email" | "customFields">) {
  return isMergedPlaceholderMember(member) || isTestAccountMember(member);
}

export function filterMembers(members: Member[], filters: MemberFilters) {
  const normalizedQuery = filters.query.trim().toLowerCase();

  return members.filter((member) => {
    if (isMergedPlaceholderMember(member)) return false;
    if (filters.groupId === "unassigned" && member.groupId) return false;
    if (filters.groupId !== "all" && filters.groupId !== "unassigned" && member.groupId !== filters.groupId) {
      return false;
    }

    if (filters.role !== "all" && member.role !== filters.role) return false;
    if (filters.status !== "all" && member.status !== filters.status) return false;
    if (filters.account === "connected" && !member.authUserId) return false;
    if (filters.account === "unconnected" && member.authUserId) return false;

    if (!normalizedQuery) return true;

    return [
      member.name,
      member.displayName,
      typeof member.customFields.english_name === "string" ? member.customFields.english_name : "",
      member.email,
      member.phone,
      member.groupName,
      member.role,
      member.status,
      member.address,
      member.baptismStatus,
      member.notes,
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
}

export function findPotentialDuplicateMembers(members: Member[]): DuplicateMemberCandidate[] {
  const candidates = new Map<string, DuplicateMemberCandidate>();

  function addCandidate(key: string, reasonLabel: string, candidateMembers: Member[]) {
    const actionableMembers = candidateMembers.filter((member) => member.status !== "inactive" || member.authUserId);
    const hasLinked = actionableMembers.some((member) => member.authUserId);
    const hasUnlinkedActive = actionableMembers.some((member) => !member.authUserId && member.status !== "inactive");

    if (actionableMembers.length < 2 || !hasLinked || !hasUnlinkedActive) return;
    candidates.set(key, { key, reasonLabel, members: actionableMembers });
  }

  const byPhone = new Map<string, Member[]>();
  const byName = new Map<string, Member[]>();

  for (const member of members) {
    const phoneKey = member.phone.replace(/\D/g, "");
    if (phoneKey.length >= 7) {
      byPhone.set(phoneKey, [...(byPhone.get(phoneKey) ?? []), member]);
    }

    const nameKey = member.name.replace(/\s+/g, "").toLowerCase();
    if (nameKey.length >= 2) {
      byName.set(nameKey, [...(byName.get(nameKey) ?? []), member]);
    }
  }

  for (const [phone, candidateMembers] of byPhone.entries()) {
    addCandidate(`phone:${phone}`, `연락처 중복 ${candidateMembers[0]?.phone ?? ""}`, candidateMembers);
  }

  for (const [name, candidateMembers] of byName.entries()) {
    addCandidate(`name:${name}`, `이름 중복 ${candidateMembers[0]?.name ?? ""}`, candidateMembers);
  }

  return [...candidates.values()].sort((a, b) => a.reasonLabel.localeCompare(b.reasonLabel));
}
