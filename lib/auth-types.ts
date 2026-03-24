export type AppRole = "admin" | "user";

export type SessionUser = {
  id: string;
  username: string;
  role: AppRole;
};

export type AppUserRecord = {
  id: string;
  username: string;
  passwordHash: string;
  role: AppRole;
  disabled: boolean;
  createdAt: number;
};
