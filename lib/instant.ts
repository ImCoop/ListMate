import { id, init } from "@instantdb/react";

const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID;

export const hasInstantConfig = Boolean(appId);
export const createId = id;
export const db = appId ? init({ appId }) : null;
