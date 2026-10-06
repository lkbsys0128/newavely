export function isRegisteredMember(member: { status: string } | null | undefined): boolean {
  return member?.status === "active" || member?.status === "care";
}

export function assertRegisteredMember(member: { status: string } | null | undefined) {
  if (!isRegisteredMember(member)) throw new Error("멤버 등록 승인 후 이용할 수 있습니다.");
}
