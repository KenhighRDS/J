import { Card, Row } from "./ui";
import type { Profile } from "../lib/types";
import { isAndroidNative } from "../lib/platform";

export function NotificationsCard({ profile }: { profile: Profile }) {
  void profile;
  return (
    <Card>
      <Row label="Notifications" value={isAndroidNative ? "Call-style alerts" : "Set up"} />
    </Card>
  );
}
