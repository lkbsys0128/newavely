// Match the registered roster states; `new` accounts are still awaiting onboarding.
export function canManagePrayer(member: { status: string } | null | undefined): boolean {
  return member?.status === "active" || member?.status === "care";
}
