/**
 * Environment helper.
 *
 * Source of truth: VITE_APP_ENV (set per Amplify branch).
 *  - main branch         → VITE_APP_ENV=production
 *  - develop branch      → VITE_APP_ENV=develop
 *  - Lovable preview /
 *    local dev           → unset → falls back to "preview"
 *
 * No hostname inference. If you need to know the environment, set the var.
 */

export type AppEnv = "production" | "develop" | "preview";

const raw = import.meta.env.VITE_APP_ENV;

export const APP_ENV: AppEnv =
  raw === "production" || raw === "develop" || raw === "preview"
    ? raw
    : "preview";

export const isProduction = (): boolean => APP_ENV === "production";
export const isDevelop = (): boolean => APP_ENV === "develop";
export const isPreview = (): boolean => APP_ENV === "preview";
