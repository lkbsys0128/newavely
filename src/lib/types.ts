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
  status: "active" | "new" | "care" | "inactive";
  email: string;
  address: string;
  baptismStatus: string;
  notes: string;
  customFields: Record<string, unknown>;
  present: boolean;
  attendanceHistory: AttendanceRecordSummary[];
};

export type AttendanceEvent = {
  id: string;
  eventDate: string;
  title: string;
};

export type AttendanceRecordSummary = {
  eventId: string;
  eventDate: string;
  title: string;
  status: "present" | "absent" | "excused";
  note: string;
  excuseStartDate: string;
  excuseEndDate: string;
};

export type CustomFieldDefinition = {
  id: string;
  key: string;
  label: string;
  fieldType: "text" | "number" | "date" | "boolean";
  isSensitive: boolean;
};

export type AuditLog = {
  id: string;
  action: string;
  targetTable: string;
  targetId: string | null;
  actorName: string;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};
