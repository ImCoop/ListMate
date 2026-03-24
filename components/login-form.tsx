"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setError(payload?.error || "Login failed.");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("Could not reach the login service.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-ink/75">Username</span>
        <input
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-4 text-base text-ink outline-none transition focus:border-clay"
          placeholder="admin"
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-medium text-ink/75">Password</span>
        <input
          required
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-4 text-base text-ink outline-none transition focus:border-clay"
          placeholder="********"
        />
      </label>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-[1.2rem] bg-ink px-4 py-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-ink/40"
      >
        {isSubmitting ? "Signing in..." : "Sign In"}
      </button>

      {error ? <p className="rounded-[1rem] bg-rose/10 px-4 py-3 text-sm text-rose">{error}</p> : null}
    </form>
  );
}
