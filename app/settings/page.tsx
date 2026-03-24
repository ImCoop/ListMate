import { SettingsApp } from "@/components/settings-app";
import { requireSessionUser } from "@/lib/server-auth";

export default async function SettingsPage() {
  const sessionUser = await requireSessionUser();

  return <SettingsApp sessionUser={sessionUser} />;
}
