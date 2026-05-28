import type { MemberLinkRequest } from "@/lib/types";

export function isActionableLinkRequest(request: MemberLinkRequest) {
  return request.status === "pending" && request.requesterStatus === "new" && request.requesterName !== "알 수 없음";
}
