export function buildPrayerShareLink(origin: string, meetingId: string) {
  const url = new URL("/prayer", origin);
  url.searchParams.set("id", meetingId);
  return url.toString();
}
