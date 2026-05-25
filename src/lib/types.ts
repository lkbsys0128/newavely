import type { Role } from "@/lib/rbac";

export type Group = {
  id: string;
  name: string;
  leaderName: string;
  targetSize: number;
};

export type Member = {
  id: string;
  name: string;
  phone: string;
  groupName: string;
  role: Role;
  status: "active" | "new" | "care";
  email: string;
  address: string;
  baptismStatus: string;
  notes: string;
  present: boolean;
};
