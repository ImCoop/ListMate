import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { getSessionUser } from "@/lib/server-auth";

export default async function LoginPage() {
  const sessionUser = await getSessionUser();

  if (sessionUser) {
    redirect("/");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-4 py-12 sm:px-6">
      <section className="w-full rounded-[2rem] border border-white/80 bg-white/85 p-6 shadow-card backdrop-blur">
        <p className="text-sm font-medium uppercase tracking-[0.28em] text-clay">ListMate Login</p>
        <h1 className="mt-3 text-3xl font-semibold text-ink">Sign in</h1>
        <p className="mt-3 text-sm leading-6 text-ink/70">
          Use your ListMate username and password stored in InstantDB.
        </p>
        <LoginForm />
        <p className="mt-4 text-xs leading-5 text-ink/55">
          If this is your first launch, ListMate auto-creates a default admin user. Change that password immediately
          after login.
        </p>
      </section>
    </main>
  );
}
