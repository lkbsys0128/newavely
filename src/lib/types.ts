import type { Role } from "@/lib/rbac";

export type Group = {
  id: string;
  name: string;
  leaderMemberId: string | null;
  leaderName: string;
  targetSize: number;
};

export type Member = {
  id: string;
  name: string;
  phone: string;
  groupId: string | null;
  groupName: string;
  role: Role;
  status: "active" | "new" | "care";
  email: string;
  address: string;
  baptismStatus: string;
  notes: string;
  present: boolean;
};
