import { ListMateApp } from "@/components/listmate-app";
import { requireSessionUser } from "@/lib/server-auth";

export default async function HomePage() {
  const sessionUser = await requireSessionUser();

  return <ListMateApp sessionUser={sessionUser} />;
}
