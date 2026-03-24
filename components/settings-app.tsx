"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { LogoutButton } from "@/components/logout-button";
import {
  getAutomationNetworkErrorMessage,
  getDefaultAutomationBaseUrl,
  normalizeAutomationBaseUrl,
  readAutomationBaseUrl,
  writeAutomationBaseUrl,
} from "@/lib/automation";
import type { AppRole, SessionUser } from "@/lib/auth-types";

type HealthState = {
  ok: boolean;
  message: string;
} | null;

type EbayStatus = {
  configured: boolean;
  connected: boolean;
  marketplaceId: string;
  missing: string[];
  callbackPath: string;
  accessTokenExpiresAt: number | null;
} | null;

type UserListItem = {
  id: string;
  username: string;
  role: AppRole;
  disabled: boolean;
  createdAt: number;
};

export function SettingsApp({ sessionUser }: { sessionUser: SessionUser }) {
  const [automationBaseUrl, setAutomationBaseUrl] = useState(readAutomationBaseUrl);
  const [draftBaseUrl, setDraftBaseUrl] = useState(readAutomationBaseUrl);
  const [health, setHealth] = useState<HealthState>(null);
  const [ebayStatus, setEbayStatus] = useState<EbayStatus>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [depopMagicLink, setDepopMagicLink] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<AppRole>("user");

  useEffect(() => {
    const current = readAutomationBaseUrl();
    setAutomationBaseUrl(current);
    setDraftBaseUrl(current);
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const callAutomation = useCallback(async (path: string, init?: RequestInit) => {
    try {
      const response = await fetch(`${automationBaseUrl}${path}`, init);
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error || `Request failed with ${response.status}`);
      }

      return payload;
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(getAutomationNetworkErrorMessage(automationBaseUrl));
      }

      throw error;
    }
  }, [automationBaseUrl]);

  useEffect(() => {
    async function loadEbayStatus() {
      setBusyAction("ebay-status");

      try {
        const payload = (await callAutomation("/ebay/status")) as EbayStatus;
        setEbayStatus(payload);
      } catch (error) {
        setEbayStatus(null);
        setToast(error instanceof Error ? error.message : "Unable to read eBay API status");
      } finally {
        setBusyAction(null);
      }
    }

    void loadEbayStatus();
  }, [callAutomation]);

  useEffect(() => {
    if (sessionUser.role !== "admin") {
      return;
    }

    async function loadUsers() {
      setBusyAction("load-users");
      setUsersError(null);

      try {
        const response = await fetch("/api/users");
        const payload = (await response.json().catch(() => null)) as { users?: UserListItem[]; error?: string } | null;

        if (!response.ok) {
          throw new Error(payload?.error || "Could not load users.");
        }

        setUsers(payload?.users || []);
      } catch (error) {
        setUsersError(error instanceof Error ? error.message : "Could not load users.");
      } finally {
        setBusyAction(null);
      }
    }

    void loadUsers();
  }, [sessionUser.role]);

  async function checkHealth() {
    setBusyAction("health");

    try {
      await callAutomation("/health");
      setHealth({ ok: true, message: `Automation service reachable at ${automationBaseUrl}` });
      setToast("Automation service is reachable");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Health check failed";
      setHealth({ ok: false, message });
      setToast(message);
    } finally {
      setBusyAction(null);
    }
  }

  function saveAutomationBaseUrl() {
    const normalized = normalizeAutomationBaseUrl(draftBaseUrl);
    writeAutomationBaseUrl(normalized);
    setAutomationBaseUrl(normalized);
    setDraftBaseUrl(normalized);
    setHealth(null);
    setToast(`Automation URL saved: ${normalized}`);
  }

  async function startManualLogin(platform: "depop" | "poshmark") {
    setBusyAction(`${platform}-login`);

    try {
      const payload = await callAutomation(`/${platform}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      setToast(payload?.message || `${platform} login completed`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : `${platform} login failed`);
    } finally {
      setBusyAction(null);
    }
  }

  async function checkEbayStatus() {
    setBusyAction("ebay-status");

    try {
      const payload = (await callAutomation("/ebay/status")) as EbayStatus;
      setEbayStatus(payload);
    } catch (error) {
      setEbayStatus(null);
      setToast(error instanceof Error ? error.message : "Unable to read eBay API status");
    } finally {
      setBusyAction(null);
    }
  }

  function connectEbayApi() {
    window.open(`${automationBaseUrl}/ebay/connect`, "_blank", "noopener,noreferrer");
    setToast("Finish eBay consent in the opened tab, then refresh eBay status.");
  }

  async function useDepopMagicLink() {
    if (!depopMagicLink.trim()) {
      setToast("Paste a Depop magic link first");
      return;
    }

    setBusyAction("depop-magic-link");

    try {
      const payload = await callAutomation("/depop/auth-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: depopMagicLink.trim() }),
      });

      setDepopMagicLink("");
      setToast(payload?.message || "Depop authenticated");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Depop authentication failed");
    } finally {
      setBusyAction(null);
    }
  }

  async function createUser() {
    const username = newUsername.trim();
    const password = newPassword;

    if (!username || !password) {
      setToast("Username and password are required.");
      return;
    }

    setBusyAction("create-user");

    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
          role: newRole,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        user?: UserListItem;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Could not create user.");
      }

      const createdUser = payload?.user;

      if (createdUser) {
        setUsers((current) => [createdUser, ...current]);
      }

      setNewUsername("");
      setNewPassword("");
      setNewRole("user");
      setToast("User created");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not create user.");
    } finally {
      setBusyAction(null);
    }
  }

  async function disableUser(userId: string) {
    setBusyAction(`disable-user:${userId}`);

    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        user?: UserListItem;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Could not disable user.");
      }

      setUsers((current) =>
        current.map((user) =>
          user.id === userId
            ? {
                ...user,
                disabled: true,
              }
            : user,
        ),
      );
      setToast("User disabled");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not disable user.");
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteUser(userId: string) {
    const confirmed = window.confirm("Delete this user permanently?");

    if (!confirmed) {
      return;
    }

    setBusyAction(`delete-user:${userId}`);

    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Could not delete user.");
      }

      setUsers((current) => current.filter((user) => user.id !== userId));
      setToast("User deleted");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not delete user.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 pb-20 pt-6 sm:px-6">
      <section className="rounded-[2.2rem] border border-white/80 bg-white/60 p-5 shadow-card backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.32em] text-clay">Settings</p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight text-ink">ListMate settings.</h1>
          </div>
          <div className="flex flex-col items-end gap-2">
            <p className="rounded-full bg-sand px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-ink/70">
              {sessionUser.username} ({sessionUser.role})
            </p>
            <div className="flex gap-2">
              <Link
                href="/"
                className="rounded-full border border-ink/10 bg-white/85 px-4 py-2 text-sm font-semibold text-ink"
              >
                Back
              </Link>
              <LogoutButton className="rounded-full border border-ink/10 bg-white/85 px-4 py-2 text-sm font-semibold text-ink" />
            </div>
          </div>
        </div>
        <p className="mt-3 text-sm leading-6 text-ink/70">
          Keep service setup, manual login, and session bootstrap here so ListMate listing cards stay focused on posting.
        </p>
      </section>

      <section className="mt-5 space-y-4">
        {sessionUser.role === "admin" ? (
          <div className="rounded-[2rem] border border-white/80 bg-white/85 p-5 shadow-card">
            <p className="text-xs font-medium uppercase tracking-[0.28em] text-clay">User management</p>
            <h2 className="mt-2 text-xl font-semibold text-ink">Admin-only access control</h2>
            <p className="mt-2 text-sm leading-6 text-ink/70">
              Add ListMate users and assign roles. This section is hidden from non-admin users.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input
                value={newUsername}
                onChange={(event) => setNewUsername(event.target.value)}
                placeholder="new username"
                className="min-w-0 rounded-[1.2rem] border border-ink/10 bg-white px-4 py-4 text-sm text-ink outline-none transition focus:border-clay"
              />
              <input
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                type="password"
                placeholder="password (min 8 chars)"
                className="min-w-0 rounded-[1.2rem] border border-ink/10 bg-white px-4 py-4 text-sm text-ink outline-none transition focus:border-clay"
              />
              <select
                value={newRole}
                onChange={(event) => setNewRole(event.target.value as AppRole)}
                className="min-w-0 rounded-[1.2rem] border border-ink/10 bg-white px-4 py-4 text-sm text-ink outline-none transition focus:border-clay"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <button
              type="button"
              onClick={createUser}
              disabled={busyAction === "create-user"}
              className="mt-3 rounded-[1.2rem] bg-ink px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-ink/40"
            >
              {busyAction === "create-user" ? "Creating..." : "Create User"}
            </button>

            {usersError ? <p className="mt-3 text-sm text-rose">{usersError}</p> : null}

            <div className="mt-4 space-y-2">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between rounded-[1rem] border border-ink/10 bg-sand/40 px-3 py-2 text-sm text-ink/80"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">
                      {user.username}
                      {user.id === sessionUser.id ? " (you)" : ""}
                    </p>
                    <p className="text-xs uppercase tracking-[0.1em] text-ink/60">
                      {user.role}
                      {user.disabled ? " • disabled" : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => disableUser(user.id)}
                      disabled={
                        user.disabled ||
                        user.id === sessionUser.id ||
                        busyAction === `disable-user:${user.id}` ||
                        busyAction === `delete-user:${user.id}`
                      }
                      className="rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs font-semibold text-ink disabled:cursor-not-allowed disabled:text-ink/40"
                    >
                      {busyAction === `disable-user:${user.id}` ? "Disabling..." : user.disabled ? "Disabled" : "Disable"}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteUser(user.id)}
                      disabled={
                        user.id === sessionUser.id ||
                        busyAction === `disable-user:${user.id}` ||
                        busyAction === `delete-user:${user.id}`
                      }
                      className="rounded-full border border-rose/30 bg-rose/10 px-3 py-1.5 text-xs font-semibold text-rose disabled:cursor-not-allowed disabled:text-rose/40"
                    >
                      {busyAction === `delete-user:${user.id}` ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-[2rem] border border-white/80 bg-white/85 p-5 shadow-card">
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-clay">Automation service</p>
          <h2 className="mt-2 text-xl font-semibold text-ink">Service URL</h2>
          <p className="mt-2 text-sm leading-6 text-ink/70">
            Use your desktop&apos;s LAN IP when the app is open on another phone or computer. Default:{" "}
            <span className="font-mono">{getDefaultAutomationBaseUrl()}</span>
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              value={draftBaseUrl}
              onChange={(event) => setDraftBaseUrl(event.target.value)}
              placeholder="http://192.168.1.25:3001"
              className="min-w-0 flex-1 rounded-[1.2rem] border border-ink/10 bg-white px-4 py-4 text-sm text-ink outline-none transition focus:border-clay"
            />
            <button
              type="button"
              onClick={saveAutomationBaseUrl}
              className="rounded-[1.2rem] bg-ink px-4 py-4 text-sm font-semibold text-white"
            >
              Save URL
            </button>
            <button
              type="button"
              onClick={checkHealth}
              disabled={busyAction === "health"}
              className="rounded-[1.2rem] border border-ink/10 bg-white px-4 py-4 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:text-ink/40"
            >
              {busyAction === "health" ? "Checking..." : "Check Health"}
            </button>
          </div>
          {health ? (
            <div
              className={`mt-4 rounded-[1.2rem] px-4 py-3 text-sm ${health.ok ? "bg-pine/10 text-pine" : "bg-rose/10 text-rose"}`}
            >
              {health.message}
            </div>
          ) : null}
        </div>

        <div className="rounded-[2rem] border border-white/80 bg-white/85 p-5 shadow-card">
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-clay">Manual login</p>
          <h2 className="mt-2 text-xl font-semibold text-ink">Open marketplace sign-in flows</h2>
          <p className="mt-2 text-sm leading-6 text-ink/70">
            These actions open the visible Playwright browser on the machine running the automation service and save
            the session when login finishes.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => startManualLogin("poshmark")}
              disabled={busyAction !== null}
              className="rounded-[1.2rem] bg-ink px-4 py-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-ink/40"
            >
              {busyAction === "poshmark-login" ? "Opening..." : "Open Poshmark Login"}
            </button>
            <button
              type="button"
              onClick={() => startManualLogin("depop")}
              disabled={busyAction !== null}
              className="rounded-[1.2rem] bg-pine px-4 py-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-pine/40"
            >
              {busyAction === "depop-login" ? "Opening..." : "Open Depop Login"}
            </button>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/80 bg-white/85 p-5 shadow-card">
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-clay">eBay API</p>
          <h2 className="mt-2 text-xl font-semibold text-ink">Connect eBay for API listing creation</h2>
          <p className="mt-2 text-sm leading-6 text-ink/70">
            eBay now uses OAuth plus the official listing APIs instead of browser automation. Configure the eBay API
            keys in the automation service, then complete consent here.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={connectEbayApi}
              disabled={busyAction !== null}
              className="rounded-[1.2rem] bg-[#1f4aa8] px-4 py-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#1f4aa8]/40"
            >
              Connect eBay API
            </button>
            <button
              type="button"
              onClick={checkEbayStatus}
              disabled={busyAction !== null}
              className="rounded-[1.2rem] border border-ink/10 bg-white px-4 py-4 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:text-ink/40"
            >
              {busyAction === "ebay-status" ? "Checking..." : "Refresh eBay Status"}
            </button>
          </div>
          <div className="mt-4 rounded-[1.2rem] bg-sand px-4 py-3 text-sm text-ink/75">
            {ebayStatus ? (
              <>
                <p>Configured: {ebayStatus.configured ? "Yes" : "No"}</p>
                <p>Connected: {ebayStatus.connected ? "Yes" : "No"}</p>
                <p>Marketplace: {ebayStatus.marketplaceId}</p>
                <p>Callback path: {ebayStatus.callbackPath}</p>
                {ebayStatus.missing.length > 0 ? <p>Missing env: {ebayStatus.missing.join(", ")}</p> : null}
              </>
            ) : (
              <p>No eBay API status loaded yet.</p>
            )}
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/80 bg-white/85 p-5 shadow-card">
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-clay">Depop magic link</p>
          <h2 className="mt-2 text-xl font-semibold text-ink">Paste the one-time login link</h2>
          <p className="mt-2 text-sm leading-6 text-ink/70">
            If you generate the Depop email link manually, paste it here and the automation browser will open it and
            save the resulting session.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              value={depopMagicLink}
              onChange={(event) => setDepopMagicLink(event.target.value)}
              placeholder="https://www.depop.com/login/..."
              className="min-w-0 flex-1 rounded-[1.2rem] border border-ink/10 bg-white px-4 py-4 text-sm text-ink outline-none transition focus:border-clay"
            />
            <button
              type="button"
              onClick={useDepopMagicLink}
              disabled={busyAction !== null}
              className="rounded-[1.2rem] bg-pine px-4 py-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-pine/40"
            >
              {busyAction === "depop-magic-link" ? "Authenticating..." : "Use Magic Link"}
            </button>
          </div>
        </div>
      </section>

      {toast ? (
        <div className="fixed inset-x-0 bottom-6 z-20 mx-auto w-fit rounded-full bg-ink px-4 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </main>
  );
}
