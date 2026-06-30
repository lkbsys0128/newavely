import type { Role } from "@/lib/rbac";

export type Group = {
  id: string;
  name: string;
  leaderMemberId: string | null;
  leaderName: string;
};

export type Member = {
  id: string;
  authUserId: string | null;
  name: string;
  displayName: string;
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
  careFollowups: CareFollowup[];
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

export type AttendanceExtraCount = {
  eventDate: string;
  clergyCount: number;
  teamLeaderCount: number;
  visitorCount: number;
  newFamilyCount: number;
  updatedByMemberId: string | null;
  updatedAt: string;
};

export type CustomFieldDefinition = {
  id: string;
  key: string;
  label: string;
  fieldType: "text" | "number" | "date" | "boolean";
  isSensitive: boolean;
};

export type CareFollowup = {
  id: string;
  status: "needed" | "contacted" | "prayer" | "resolved";
  note: string;
  assignedToMemberId: string | null;
  assignedToName: string;
  createdAt: string;
  completedAt: string | null;
};

export type MemberLinkRequest = {
  id: string;
  requesterMemberId: string;
  requesterName: string;
  requesterEmail: string;
  requesterStatus: "active" | "new" | "care" | "inactive" | null;
  targetMemberId: string | null;
  targetName: string;
  targetEmail: string;
  status: "pending" | "approved" | "rejected";
  note: string;
  createdAt: string;
  resolvedAt: string | null;
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
  eventSummaries: string[];
  memberSummaries: string[];
  createdAt: string;
};

export type DeletedAuthUser = {
  authUserId: string;
  deletedMemberId: string | null;
  deletedMemberName: string;
  deletedMemberEmail: string;
  deletedAt: string;
  restoreRequestedAt: string | null;
  restoreRequestNote: string;
  restoreData: Record<string, unknown> | null;
};

export type ImportantLink = {
  id: string;
  title: string;
  description: string;
  url: string;
  iconKey: "website" | "links" | "youtube" | "instagram" | "default";
  createdByName: string;
  createdAt: string;
};

export type MemberStatusMessage = {
  memberId: string;
  memberName: string;
  groupName: string;
  message: string;
  updatedAt: string;
};

export type AdminFeedbackMessage = {
  id: string;
  reporterMemberId: string;
  reporterName: string;
  reporterGroupName: string;
  category: "feature" | "bug" | "question" | "other";
  title: string;
  message: string;
  status: "open" | "reviewing" | "resolved" | "closed";
  adminNote: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export type NewFamilyApplicant = {
  id: string;
  sourceRowNumber: number;
  submittedAt: string | null;
  name: string;
  email: string;
  phone: string;
  groupInterest: string;
  expectedGroup: string;
  memo: string;
  status: "new" | "contacted" | "week_1" | "week_2" | "week_3" | "completed" | "archived";
  sourceData: Record<string, unknown>;
  convertedMemberId: string | null;
  convertedAt: string | null;
  lastSyncedAt: string;
  createdAt: string;
  updatedAt: string;
};
