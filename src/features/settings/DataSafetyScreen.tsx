"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { User } from "@supabase/supabase-js";
import {
  createBackup,
  exportBackupToJSON,
  importBackupFromJSON,
} from "@/domain/backup";
import type { BackupImportError } from "@/domain/backup";
import { Link } from "@/i18n/routing";
import { appStorageAdapter } from "@/lib/storage";
import { SupabaseStorageAdapter } from "@/lib/storage";
import {
  getCurrentUser,
  isSupabaseConfigured,
  signInWithEmail,
  signOut,
  supabase,
} from "@/lib/supabase/client";
import { CURRENT_APP_STATE_VERSION } from "@/domain/migrations";
import { useEventsStore } from "@/store/eventsStore";

export function DataSafetyScreen() {
  const t = useTranslations("dataSafety");
  const commonT = useTranslations("common");
  const events = useEventsStore((state) => state.events);
  const categories = useEventsStore((state) => state.categories);
  const reminders = useEventsStore((state) => state.reminders);
  const activeEventId = useEventsStore((state) => state.activeEventId);
  const syncStatus = useEventsStore((state) => state.syncStatus);
  const syncError = useEventsStore((state) => state.syncError);
  const saveToStorage = useEventsStore((state) => state.saveToStorage);
  const loadFromStorage = useEventsStore((state) => state.loadFromStorage);
  const ensureSeedData = useEventsStore((state) => state.ensureSeedData);
  const replaceLocalData = useEventsStore((state) => state.replaceLocalData);
  const resetStorage = useEventsStore((state) => state.resetStorage);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(isSupabaseConfigured());
  const [isCloudActionRunning, setIsCloudActionRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadFromStorage().then(() => ensureSeedData());
  }, [ensureSeedData, loadFromStorage]);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      return;
    }

    let isMounted = true;
    void getCurrentUser().then((user) => {
      if (isMounted) {
        setUser(user);
        setIsAuthLoading(false);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIsAuthLoading(false);
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const storageStatus = useMemo(() => {
    const expensesCount = events.reduce((sum, event) => sum + event.expenses.length, 0);
    const participantsCount = events.reduce((sum, event) => sum + event.users.length, 0);
    return {
      eventsCount: events.length,
      expensesCount,
      participantsCount,
      categoriesCount: categories.length,
      localStorageSize: approximateLocalStorageSize(),
    };
  }, [categories.length, events]);

  function handleExportBackup() {
    const backup = createBackup({ events, categories, reminders, activeEventId });
    const json = exportBackupToJSON(backup);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `debtcalc-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setError(null);
    setMessage(t("exported"));
  }

  async function handleImportBackup(file: File | undefined) {
    if (!file) {
      return;
    }

    try {
      const jsonText = await file.text();
      const result = importBackupFromJSON(jsonText);
      if (!result.ok) {
        setMessage(null);
        setError(importErrorMessage(result.error, t));
        return;
      }

      if (!window.confirm(t("confirmImport"))) {
        return;
      }

      replaceLocalData({
        events: result.backup.events,
        categories: result.backup.categories,
        reminders: result.backup.reminders,
        activeEventId: result.backup.settings.activeEventId,
      });
      setError(null);
      setMessage(t("imported"));
    } catch {
      setMessage(null);
      setError(t("invalidJson"));
    }
  }

  function handleResetData() {
    if (!window.confirm(t("confirmReset"))) {
      return;
    }

    void resetStorage();
    setError(null);
    setMessage(t("resetDone"));
  }

  async function handleSignIn() {
    if (!isSupabaseConfigured()) {
      setMessage(null);
      setError(t("supabaseNotConfigured"));
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setMessage(null);
      setError(t("emailRequired"));
      return;
    }

    setIsAuthLoading(true);
    const authError = await signInWithEmail(trimmedEmail)
      .then(() => null)
      .catch((error: unknown) => (error instanceof Error ? error : new Error(String(error))));
    setIsAuthLoading(false);

    if (authError) {
      setMessage(null);
      setError(authError.message);
      return;
    }

    setError(null);
    setMessage(t("magicLinkSent"));
  }

  async function handleSignOut() {
    setIsAuthLoading(true);
    const authError = await signOut()
      .then(() => null)
      .catch((error: unknown) => (error instanceof Error ? error : new Error(String(error))));
    setIsAuthLoading(false);

    if (authError) {
      setMessage(null);
      setError(authError.message);
      return;
    }

    setError(null);
    setMessage(t("signedOut"));
  }

  async function handleUploadToCloud() {
    setIsCloudActionRunning(true);
    useEventsStore.setState({ syncStatus: "syncing", syncError: undefined });
    try {
      await new SupabaseStorageAdapter().saveState({
        version: CURRENT_APP_STATE_VERSION,
        events,
        categories,
        reminders,
        settings: { activeEventId },
      });
      useEventsStore.setState({ syncStatus: "synced", syncError: undefined });
      setError(null);
      setMessage(t("uploaded"));
    } catch (error) {
      const syncErrorMessage = error instanceof Error ? error.message : t("cloudSyncFailed");
      useEventsStore.setState({ syncStatus: "error", syncError: syncErrorMessage });
      setMessage(null);
      setError(syncErrorMessage);
    } finally {
      setIsCloudActionRunning(false);
    }
  }

  async function handleDownloadFromCloud() {
    if (!window.confirm(t("confirmDownload"))) {
      return;
    }

    setIsCloudActionRunning(true);
    useEventsStore.setState({ syncStatus: "syncing", syncError: undefined });
    try {
      const appState = await new SupabaseStorageAdapter().loadState();
      if (!appState) {
        useEventsStore.setState({ syncStatus: "synced", syncError: undefined });
        setError(null);
        setMessage(t("cloudEmpty"));
        return;
      }

      replaceLocalData({
        events: appState.events,
        categories: appState.categories,
        reminders: appState.reminders,
        activeEventId: appState.settings.activeEventId,
      });
      await saveToStorage();
      useEventsStore.setState({ syncStatus: "synced", syncError: undefined });
      setError(null);
      setMessage(t("downloaded"));
    } catch (error) {
      const syncErrorMessage = error instanceof Error ? error.message : t("cloudSyncFailed");
      useEventsStore.setState({ syncStatus: "error", syncError: syncErrorMessage });
      setMessage(null);
      setError(syncErrorMessage);
    } finally {
      setIsCloudActionRunning(false);
    }
  }

  return (
    <main className="min-h-screen px-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 sm:gap-6">
        <header className="flex flex-col gap-3 border-b border-[var(--border)] pb-4 sm:gap-4 sm:pb-5">
          <Link href="/settings" className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--accent)]">
            {commonT("settings")}
          </Link>
          <div>
            <p className="text-sm font-medium text-[var(--muted)]">{t("eyebrow")}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal text-zinc-950 sm:mt-2 sm:text-4xl">
              {t("title")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">{t("description")}</p>
          </div>
        </header>

        {message ? (
          <p className="rounded-md bg-teal-50 px-3 py-2 text-sm text-[var(--accent-strong)]">{message}</p>
        ) : null}
        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">{error}</p>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StorageMetric label={t("events")} value={storageStatus.eventsCount.toString()} />
          <StorageMetric label={t("expenses")} value={storageStatus.expensesCount.toString()} />
          <StorageMetric label={t("participants")} value={storageStatus.participantsCount.toString()} />
          <StorageMetric label={t("categories")} value={storageStatus.categoriesCount.toString()} />
        </section>

        <section className="rounded-lg border border-[var(--border)] bg-white p-4 sm:p-5">
          <h2 className="text-base font-semibold text-zinc-950">{t("currentStorage")}</h2>
          <div className="mt-4 grid gap-3">
            <div className="rounded-md bg-[var(--surface-subtle)] px-3 py-3">
              <p className="text-sm font-semibold text-zinc-950">{t("localOnly")}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">{t("localOnlyDescription")}</p>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md bg-[var(--surface-subtle)] px-3 py-3">
              <span className="text-sm text-zinc-900">{t("syncStatus")}</span>
              <span className={`text-sm font-semibold ${syncStatus === "error" ? "text-[var(--danger)]" : "text-[var(--accent-strong)]"}`}>
                {syncStatus === "error" ? t("syncError") : t("storedLocally")}
              </span>
            </div>
            {syncError ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">{syncError}</p>
            ) : null}
            <p className="text-sm text-[var(--muted)]">{t("backupRecommended")}</p>
          </div>
        </section>

        <section className="rounded-lg border border-[var(--border)] bg-white p-4 sm:p-5">
          <h2 className="text-base font-semibold text-zinc-950">{t("cloudSync")}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("cloudSyncDescription")}</p>

          {!isSupabaseConfigured() ? (
            <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {t("supabaseNotConfigured")}
            </p>
          ) : user ? (
            <div className="mt-4 grid gap-3">
              <p className="rounded-md bg-[var(--surface-subtle)] px-3 py-3 text-sm text-zinc-900">
                {t("signedInAs", { email: user.email ?? "" })}
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={handleUploadToCloud}
                  disabled={isCloudActionRunning}
                  className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t("uploadToCloud")}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadFromCloud}
                  disabled={isCloudActionRunning}
                  className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-[var(--surface-subtle)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t("downloadFromCloud")}
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={isAuthLoading}
                  className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-[var(--surface-subtle)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t("signOut")}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t("emailPlaceholder")}
                className="min-w-0 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-100"
              />
              <button
                type="button"
                onClick={handleSignIn}
                disabled={isAuthLoading}
                className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t("sendMagicLink")}
              </button>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-[var(--border)] bg-white p-4 sm:p-5">
          <h2 className="text-base font-semibold text-zinc-950">{t("storageStatus")}</h2>
          <div className="mt-4 flex items-center justify-between gap-4 rounded-md bg-[var(--surface-subtle)] px-3 py-3">
            <span className="text-sm text-zinc-900">{t("localStorageSize")}</span>
            <span className="text-sm font-semibold text-zinc-950">{storageStatus.localStorageSize}</span>
          </div>
        </section>

        <section className="rounded-lg border border-[var(--border)] bg-white p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleExportBackup}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-strong)]"
            >
              {t("exportBackup")}
            </button>
            <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-[var(--border)] px-4 py-2 text-center text-sm font-medium text-zinc-800 transition hover:bg-[var(--surface-subtle)]">
              {t("importBackup")}
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={(event) => {
                  void handleImportBackup(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
        </section>

        <section className="rounded-lg border border-red-200 bg-white p-4 sm:p-5">
          <h2 className="text-base font-semibold text-[var(--danger)]">{t("dangerZone")}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("resetDescription")}</p>
          <button
            type="button"
            onClick={handleResetData}
            className="mt-4 rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-[var(--danger)] transition hover:bg-red-50"
          >
            {t("resetAllData")}
          </button>
        </section>
      </div>
    </main>
  );
}

function StorageMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-white p-4">
      <p className="text-xs font-medium uppercase text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-950">{value}</p>
    </div>
  );
}

function approximateLocalStorageSize(): string {
  return appStorageAdapter.approximateSize();
}

function importErrorMessage(error: BackupImportError, t: (key: string) => string): string {
  switch (error) {
    case "invalidJson":
      return t("invalidJson");
    case "invalidVersion":
      return t("invalidVersion");
    case "invalidStructure":
      return t("invalidStructure");
  }
}
