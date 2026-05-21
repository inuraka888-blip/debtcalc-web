"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  getCategorySlices,
  getDateSlices,
  getPayerSlices,
  getSplitParticipantSlices,
} from "@/domain/analytics";
import type { AnalyticsDatePeriod, ChartSlice } from "@/domain/analytics";
import { formatMoney } from "@/domain/money";
import { Link } from "@/i18n/routing";
import { useEventsStore } from "@/store/eventsStore";

type AnalyticsMode = "category" | "payer" | "split" | "date";

const chartColors = ["#0f766e", "#2563eb", "#9333ea", "#db2777", "#ea580c", "#65a30d", "#475569"];

export function EventAnalyticsScreen({ eventId }: { eventId: string }) {
  const t = useTranslations("analytics");
  const commonT = useTranslations("common");
  const detailT = useTranslations("eventDetail");
  const locale = useLocale();
  const events = useEventsStore((state) => state.events);
  const categories = useEventsStore((state) => state.categories);
  const loadFromStorage = useEventsStore((state) => state.loadFromStorage);
  const ensureSeedData = useEventsStore((state) => state.ensureSeedData);
  const setActiveEvent = useEventsStore((state) => state.setActiveEvent);
  const [mode, setMode] = useState<AnalyticsMode>("category");
  const [datePeriod, setDatePeriod] = useState<AnalyticsDatePeriod>("month");

  useEffect(() => {
    void loadFromStorage().then(() => {
      ensureSeedData();
      setActiveEvent(eventId);
    });
  }, [ensureSeedData, eventId, loadFromStorage, setActiveEvent]);

  const event = useMemo(
    () => events.find((candidate) => candidate.id === eventId),
    [eventId, events],
  );

  const slices = useMemo(() => {
    if (!event) {
      return [];
    }

    switch (mode) {
      case "category":
        return getCategorySlices(event, categories);
      case "payer":
        return getPayerSlices(event);
      case "split":
        return getSplitParticipantSlices(event);
      case "date":
        return getDateSlices(event, datePeriod);
    }
  }, [categories, datePeriod, event, mode]);

  if (!event) {
    return (
      <main className="min-h-screen px-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:py-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
          <Link href="/events" className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--accent)]">
            {commonT("backToEvents")}
          </Link>
          <section className="rounded-lg border border-[var(--border)] bg-white p-5 sm:p-8">
            <h1 className="text-2xl font-semibold text-zinc-950">{detailT("eventNotFound")}</h1>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:gap-6">
        <header className="flex flex-col gap-3 border-b border-[var(--border)] pb-4 sm:gap-4 sm:pb-5">
          <Link href={`/events/${event.id}`} className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--accent)]">
            {commonT("backToEvent")}
          </Link>
          <div>
            <p className="text-sm font-medium text-[var(--muted)]">{event.name}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal text-zinc-950 sm:mt-2 sm:text-4xl">
              {t("title")}
            </h1>
          </div>
        </header>

        <section className="rounded-lg border border-[var(--border)] bg-white p-4 sm:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {(["category", "payer", "split", "date"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMode(option)}
                  className={`rounded-md border px-3 py-2 text-sm font-medium ${
                    mode === option
                      ? "border-[var(--accent)] bg-teal-50 text-[var(--accent-strong)]"
                      : "border-[var(--border)] text-zinc-800 hover:bg-[var(--surface-subtle)]"
                  }`}
                >
                  {t(option)}
                </button>
              ))}
            </div>

            {mode === "date" ? (
              <div className="grid grid-cols-3 gap-2 sm:flex">
                {(["day", "month", "year"] as const).map((period) => (
                  <button
                    key={period}
                    type="button"
                    onClick={() => setDatePeriod(period)}
                    className={`rounded-md border px-3 py-2 text-sm font-medium ${
                      datePeriod === period
                        ? "border-zinc-950 bg-zinc-950 text-white"
                        : "border-[var(--border)] text-zinc-800 hover:bg-[var(--surface-subtle)]"
                    }`}
                  >
                    {t(period)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {event.expenses.length === 0 ? (
            <p className="mt-8 rounded-md border border-dashed border-[var(--border)] p-6 text-sm text-[var(--muted)]">
              {t("empty")}
            </p>
          ) : (
            <div className="mt-6 grid gap-6 sm:mt-8 lg:grid-cols-[minmax(280px,420px)_1fr] lg:gap-8">
              <div className="h-64 sm:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={slices}
                      dataKey="amountCents"
                      nameKey="title"
                      innerRadius={72}
                      outerRadius={126}
                      paddingAngle={2}
                    >
                      {slices.map((slice, index) => (
                        <Cell key={slice.id} fill={chartColors[index % chartColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip locale={locale} />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="flex flex-col gap-3">
                {slices.map((slice, index) => (
                  <div
                    key={slice.id}
                    className="flex items-center justify-between gap-3 rounded-md bg-[var(--surface-subtle)] px-3 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: chartColors[index % chartColors.length] }}
                      />
                      {slice.icon ? <span className="text-lg">{slice.icon}</span> : null}
                      <span className="truncate text-sm font-medium text-zinc-950">{slice.title}</span>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-zinc-950">{formatMoney(slice.amountCents, locale)}</p>
                      <p className="text-xs text-[var(--muted)]">{slice.percentage.toFixed(1)}%</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function ChartTooltip({
  active,
  payload,
  locale,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartSlice }>;
  locale: string;
}) {
  if (!active || !payload?.[0]) {
    return null;
  }

  const slice = payload[0].payload;
  return (
    <div className="rounded-md border border-[var(--border)] bg-white px-3 py-2 shadow-sm">
      <p className="text-sm font-medium text-zinc-950">{slice.title}</p>
      <p className="text-sm text-[var(--muted)]">
        {formatMoney(slice.amountCents, locale)} / {slice.percentage.toFixed(1)}%
      </p>
    </div>
  );
}
