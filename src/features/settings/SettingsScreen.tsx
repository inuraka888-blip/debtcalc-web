"use client";

import { FormEvent, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { ExpenseCategory } from "@/domain/models";
import { Link, usePathname, useRouter } from "@/i18n/routing";
import {
  getNotificationPermission,
  isNotificationSupported,
  requestNotificationPermission,
} from "@/lib/notifications";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type { SyncStatus } from "@/lib/storage";
import { useEventsStore } from "@/store/eventsStore";
import type { CategoryMutationError } from "@/store/eventsStore";

export function SettingsScreen() {
  const t = useTranslations("settings");
  const commonT = useTranslations("common");
  const errorsT = useTranslations("errors");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const categories = useEventsStore((state) => state.categories);
  const loadFromStorage = useEventsStore((state) => state.loadFromStorage);
  const ensureSeedData = useEventsStore((state) => state.ensureSeedData);
  const initializeAuth = useEventsStore((state) => state.initializeAuth);
  const signIn = useEventsStore((state) => state.signIn);
  const signOut = useEventsStore((state) => state.signOut);
  const authUser = useEventsStore((state) => state.authUser);
  const authStatus = useEventsStore((state) => state.authStatus);
  const authError = useEventsStore((state) => state.authError);
  const addCategory = useEventsStore((state) => state.addCategory);
  const updateCategory = useEventsStore((state) => state.updateCategory);
  const deleteCategory = useEventsStore((state) => state.deleteCategory);
  const syncToCloud = useEventsStore((state) => state.syncToCloud);
  const loadFromCloud = useEventsStore((state) => state.loadFromCloud);
  const clearCloudState = useEventsStore((state) => state.clearCloudState);
  const syncStatus = useEventsStore((state) => state.syncStatus);
  const syncError = useEventsStore((state) => state.syncError);
  const lastSyncedAt = useEventsStore((state) => state.lastSyncedAt);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryIcon, setNewCategoryIcon] = useState("◼️");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingIcon, setEditingIcon] = useState("");
  const [notificationPermission, setNotificationPermission] =
    useState<ReturnType<typeof getNotificationPermission>>(() => getNotificationPermission());
  const [cloudEmail, setCloudEmail] = useState("");
  const [isCloudAuthLoading, setIsCloudAuthLoading] = useState(false);
  const [cloudMessage, setCloudMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadFromStorage().then(() => ensureSeedData());
  }, [ensureSeedData, loadFromStorage]);

  useEffect(() => {
    void initializeAuth();
  }, [initializeAuth]);

  function handleAddCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = addCategory(newCategoryName, newCategoryIcon);
    if (!result.ok) {
      setError(categoryErrorMessage(result.error, errorsT));
      return;
    }

    setNewCategoryName("");
    setNewCategoryIcon("◼️");
    setError(null);
  }

  function startEditing(category: ExpenseCategory) {
    setEditingCategoryId(category.id);
    setEditingName(category.name);
    setEditingIcon(category.icon);
    setError(null);
  }

  function cancelEditing() {
    setEditingCategoryId(null);
    setEditingName("");
    setEditingIcon("");
    setError(null);
  }

  function handleUpdateCategory(event: FormEvent<HTMLFormElement>, categoryId: string) {
    event.preventDefault();
    const result = updateCategory(categoryId, { name: editingName, icon: editingIcon });
    if (!result.ok) {
      setError(categoryErrorMessage(result.error, errorsT));
      return;
    }

    cancelEditing();
  }

  function handleDeleteCategory(category: ExpenseCategory) {
    if (!window.confirm(t("confirmDeleteCategory", { name: category.name }))) {
      return;
    }

    const categoryId = category.id;
    const result = deleteCategory(categoryId);
    if (!result.ok) {
      setError(categoryErrorMessage(result.error, errorsT));
      return;
    }

    setError(null);
  }

  async function handleRequestNotifications() {
    const permission = await requestNotificationPermission();
    setNotificationPermission(permission);
  }

  async function handleCloudSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSupabaseConfigured()) {
      setCloudMessage(null);
      setError(t("supabaseNotConfigured"));
      return;
    }

    const trimmedEmail = cloudEmail.trim();
    if (!trimmedEmail) {
      setCloudMessage(null);
      setError(t("emailRequired"));
      return;
    }

    setIsCloudAuthLoading(true);
    try {
      await signIn(trimmedEmail, window.location.href);
      setError(null);
      setCloudMessage(t("magicLinkSent"));
    } catch (authError) {
      setCloudMessage(null);
      setError(authError instanceof Error ? authError.message : String(authError));
    } finally {
      setIsCloudAuthLoading(false);
    }
  }

  async function handleCloudSignOut() {
    setIsCloudAuthLoading(true);
    try {
      await signOut();
      setError(null);
      setCloudMessage(t("signedOut"));
    } catch (authError) {
      setCloudMessage(null);
      setError(authError instanceof Error ? authError.message : String(authError));
    } finally {
      setIsCloudAuthLoading(false);
    }
  }

  async function handleSyncToCloud() {
    setCloudMessage(null);
    await syncToCloud();
    if (useEventsStore.getState().syncStatus === "synced") {
      setCloudMessage(t("uploaded"));
    }
  }

  async function handleLoadFromCloud() {
    if (!window.confirm(t("confirmDownload"))) {
      return;
    }

    setCloudMessage(null);
    const didLoadState = await loadFromCloud();
    if (useEventsStore.getState().syncStatus === "synced") {
      setCloudMessage(didLoadState ? t("downloaded") : t("cloudEmpty"));
    }
  }

  async function handleClearCloudState() {
    if (!window.confirm(t("confirmClearCloud"))) {
      return;
    }

    setCloudMessage(null);
    await clearCloudState();
    if (useEventsStore.getState().syncStatus === "synced") {
      setCloudMessage(t("cloudCleared"));
    }
  }

  return (
    <main className="min-h-screen px-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 sm:gap-6">
        <header className="flex flex-col gap-3 border-b border-[var(--border)] pb-4 sm:gap-4 sm:pb-5">
          <Link href="/events" className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--accent)]">
            {commonT("backToEvents")}
          </Link>
          <div>
            <p className="text-sm font-medium text-[var(--muted)]">{t("title")}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal text-zinc-950 sm:mt-2 sm:text-4xl">
              {t("categories")}
            </h1>
          </div>
        </header>

        <section className="rounded-lg border border-[var(--border)] bg-white p-4 sm:p-5">
          <h2 className="text-base font-semibold text-zinc-950">{t("language")}</h2>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {(["en", "ru"] as const).map((nextLocale) => (
              <button
                key={nextLocale}
                type="button"
                onClick={() => router.replace(pathname, { locale: nextLocale })}
                className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                  locale === nextLocale
                    ? "border-[var(--accent)] bg-teal-50 text-[var(--accent-strong)]"
                    : "border-[var(--border)] text-zinc-800 hover:bg-[var(--surface-subtle)]"
                }`}
              >
                {nextLocale === "en" ? t("english") : t("russian")}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-[var(--border)] bg-white p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-zinc-950">{t("dataSafety")}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{t("dataSafetyDescription")}</p>
            </div>
            <Link
              href="/settings/data-safety"
              className="flex min-h-11 items-center justify-center rounded-md border border-[var(--border)] px-4 py-2 text-center text-sm font-medium text-zinc-800 transition hover:bg-[var(--surface-subtle)]"
            >
              {t("openDataSafety")}
            </Link>
          </div>
        </section>

        <section className="rounded-lg border border-[var(--border)] bg-white p-4 sm:p-5">
          <div>
            <h2 className="text-base font-semibold text-zinc-950">{t("cloudAccount")}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{t("cloudAccountDescription")}</p>
          </div>

          {!isSupabaseConfigured() ? (
            <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {t("supabaseNotConfigured")}
            </p>
          ) : authStatus === "signedIn" && authUser ? (
            <div className="mt-4 grid gap-3">
              <div className="flex flex-col gap-3 rounded-md bg-[var(--surface-subtle)] px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-zinc-900">
                    {t("signedInAs", { email: authUser.email ?? "" })}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {t("syncStatus")}: {syncStatusLabel(syncStatus, t)}
                  </p>
                  {lastSyncedAt ? (
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {t("lastSyncedAt")}: {formatSyncDate(lastSyncedAt, locale)}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={handleCloudSignOut}
                  disabled={isCloudAuthLoading || syncStatus === "syncing"}
                  className="flex min-h-11 items-center justify-center rounded-md border border-[var(--border)] bg-white px-4 py-2 text-center text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t("signOut")}
                </button>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={handleSyncToCloud}
                  disabled={syncStatus === "syncing"}
                  className="flex min-h-11 items-center justify-center rounded-md bg-[var(--accent)] px-4 py-2 text-center text-sm font-medium text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t("uploadToCloud")}
                </button>
                <button
                  type="button"
                  onClick={handleLoadFromCloud}
                  disabled={syncStatus === "syncing"}
                  className="flex min-h-11 items-center justify-center rounded-md border border-[var(--border)] px-4 py-2 text-center text-sm font-medium text-zinc-800 transition hover:bg-[var(--surface-subtle)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t("downloadFromCloud")}
                </button>
                <button
                  type="button"
                  onClick={handleClearCloudState}
                  disabled={syncStatus === "syncing"}
                  className="flex min-h-11 items-center justify-center rounded-md border border-red-200 px-4 py-2 text-center text-sm font-medium text-[var(--danger)] transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t("clearCloudData")}
                </button>
              </div>

              {syncError ? (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">{syncError}</p>
              ) : null}
            </div>
          ) : (
            <form className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]" onSubmit={handleCloudSignIn}>
              <input
                value={cloudEmail}
                onChange={(event) => setCloudEmail(event.target.value)}
                type="email"
                placeholder={t("emailPlaceholder")}
                className="min-w-0 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-100"
              />
              <button
                type="submit"
                disabled={isCloudAuthLoading || authStatus === "unknown"}
                className="flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-4 py-2 text-center text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t("sendMagicLink")}
              </button>
            </form>
          )}

          {cloudMessage ? (
            <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{cloudMessage}</p>
          ) : null}
          {authStatus === "error" && authError ? (
            <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
              {t("authError")}: {authError}
            </p>
          ) : null}
        </section>

        <section className="rounded-lg border border-[var(--border)] bg-white p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-zinc-950">{t("notifications")}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{t("notificationsDescription")}</p>
              <p className="mt-2 text-sm font-medium text-zinc-900">
                {t("notificationStatus")}: {notificationPermissionLabel(notificationPermission, t)}
              </p>
            </div>
            <button
              type="button"
              onClick={handleRequestNotifications}
              disabled={!isNotificationSupported() || notificationPermission === "granted"}
              className="flex min-h-11 items-center justify-center rounded-md border border-[var(--border)] px-4 py-2 text-center text-sm font-medium text-zinc-800 transition hover:bg-[var(--surface-subtle)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("requestNotifications")}
            </button>
          </div>
          {!isNotificationSupported() ? (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {t("notificationsUnsupported")}
            </p>
          ) : null}
        </section>

        <section className="rounded-lg border border-[var(--border)] bg-white p-4 sm:p-5">
          <form className="grid gap-2 sm:grid-cols-[88px_1fr_auto]" onSubmit={handleAddCategory}>
            <input
              value={newCategoryIcon}
              onChange={(event) => setNewCategoryIcon(event.target.value)}
              aria-label={t("categoryIcon")}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-100"
            />
            <input
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              placeholder={t("categoryName")}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-100"
            />
            <button
              type="submit"
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-strong)]"
            >
              {commonT("add")}
            </button>
          </form>

          {error ? (
            <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">{error}</p>
          ) : null}

          <div className="mt-5 divide-y divide-[var(--border)]">
            {categories.map((category) => (
              <div key={category.id} className="py-3">
                {editingCategoryId === category.id ? (
                  <form
                    className="grid gap-2 sm:grid-cols-[88px_1fr_auto_auto]"
                    onSubmit={(event) => handleUpdateCategory(event, category.id)}
                  >
                    <input
                      value={editingIcon}
                      onChange={(event) => setEditingIcon(event.target.value)}
                      aria-label={t("categoryIcon")}
                      className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-100"
                    />
                    <input
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-teal-100"
                    />
                    <button
                      type="submit"
                      className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
                    >
                      {commonT("save")}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditing}
                      className="rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-[var(--surface-subtle)]"
                    >
                      {commonT("cancel")}
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--surface-subtle)] text-lg">
                        {category.icon}
                      </span>
                      <span className="truncate text-sm font-medium text-zinc-950">{category.name}</span>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => startEditing(category)}
                        className="rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-[var(--surface-subtle)]"
                      >
                        {commonT("edit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(category)}
                        className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-[var(--danger)] transition hover:bg-red-50"
                      >
                        {commonT("delete")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function categoryErrorMessage(error: CategoryMutationError, t: (key: string) => string): string {
  switch (error) {
    case "categoryNotFound":
      return t("categoryNotFound");
    case "categoryNameEmpty":
      return t("categoryNameEmpty");
    case "categoryAlreadyExists":
      return t("categoryAlreadyExists");
    case "categoryInUse":
      return t("categoryInUse");
  }
}

function notificationPermissionLabel(
  permission: ReturnType<typeof getNotificationPermission>,
  t: (key: string) => string,
): string {
  switch (permission) {
    case "granted":
      return t("notificationGranted");
    case "denied":
      return t("notificationDenied");
    case "default":
      return t("notificationDefault");
    case "unsupported":
      return t("notificationUnsupported");
  }
}

function syncStatusLabel(syncStatus: SyncStatus, t: (key: string) => string): string {
  switch (syncStatus) {
    case "idle":
      return t("syncIdle");
    case "syncing":
      return t("syncing");
    case "synced":
      return t("synced");
    case "error":
      return t("syncError");
  }
}

function formatSyncDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale.startsWith("ru") ? "ru-RU" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
