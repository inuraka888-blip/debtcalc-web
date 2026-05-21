import { validateExpense } from "./expenseValidation";
import type { Event, Expense, ExpenseCategory, ExpenseSplit, ExpenseSplitMode } from "./models";

export class CSVImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CSVImportError";
  }
}

interface EventCSVBundle {
  event: Event;
  categories: ExpenseCategory[];
}

type SectionName = "Event" | "Participants" | "ParticipantGroups" | "Categories" | "Expenses";

const sectionNames = new Set<SectionName>([
  "Event",
  "Participants",
  "ParticipantGroups",
  "Categories",
  "Expenses",
]);

export function exportEventToCSV(event: Event, categories: ExpenseCategory[]): string {
  const rows: string[][] = [
    ["[Event]"],
    ["id", "name"],
    [event.id, event.name],
    [],
    ["[Participants]"],
    ["id", "name"],
    ...event.users.map((participant) => [participant.id, participant.name]),
    [],
    ["[ParticipantGroups]"],
    ["id", "name", "participantIds"],
    ...event.participantGroups.map((group) => [group.id, group.name, group.participantIds.join(";")]),
    [],
    ["[Categories]"],
    ["id", "name", "icon"],
    ...categories.map((category) => [category.id, category.name, category.icon]),
    [],
    ["[Expenses]"],
    ["id", "title", "amountCents", "paidBySplits", "splits", "categoryId", "date", "note", "splitMode"],
    ...event.expenses.map((expense) => [
      expense.id,
      expense.title,
      String(expense.amountCents),
      formatSplitList(expense.paidBySplits),
      formatSplitList(expense.splits),
      expense.categoryId ?? "",
      expense.date,
      expense.note ?? "",
      expense.splitMode,
    ]),
  ];

  return rows.map(formatCSVRow).join("\n");
}

export function importEventFromCSV(csvText: string): Event {
  return importEventBundleFromCSV(csvText).event;
}

export function importEventBundleFromCSV(csvText: string): EventCSVBundle {
  const sections = parseSections(csvText);
  const eventRows = rowsForSection(sections, "Event");
  const participantRows = rowsForSection(sections, "Participants");
  const participantGroupRows = rowsForSection(sections, "ParticipantGroups");
  const categoryRows = rowsForSection(sections, "Categories");
  const expenseRows = rowsForSection(sections, "Expenses");

  const eventInfo = eventRows[0];
  if (!eventInfo?.id?.trim() || !eventInfo.name?.trim()) {
    throw new CSVImportError("Event section must contain id and name.");
  }

  const users = participantRows.map((row, index) => {
    if (!row.id?.trim() || !row.name?.trim()) {
      throw new CSVImportError(`Participants row ${index + 1} must contain id and name.`);
    }
    return { id: row.id.trim(), name: row.name.trim() };
  });
  const participantIds = new Set(users.map((participant) => participant.id));

  const participantGroups = participantGroupRows.map((row, index) => {
    if (!row.id?.trim() || !row.name?.trim()) {
      throw new CSVImportError(`ParticipantGroups row ${index + 1} must contain id and name.`);
    }

    const groupParticipantIds = parseIdList(row.participantIds);
    for (const participantId of groupParticipantIds) {
      if (!participantIds.has(participantId)) {
        throw new CSVImportError(`ParticipantGroups row ${index + 1} references unknown participant ${participantId}.`);
      }
    }

    return { id: row.id.trim(), name: row.name.trim(), participantIds: groupParticipantIds };
  });

  const categories = categoryRows.map((row, index) => {
    if (!row.id?.trim() || !row.name?.trim()) {
      throw new CSVImportError(`Categories row ${index + 1} must contain id and name.`);
    }
    return { id: row.id.trim(), name: row.name.trim(), icon: row.icon?.trim() || "◼️" };
  });

  const categoryIds = new Set(categories.map((category) => category.id));
  const event: Event = {
    id: eventInfo.id.trim(),
    name: eventInfo.name.trim(),
    users,
    participantGroups,
    expenses: [],
  };

  event.expenses = parseExpenses(expenseRows, event, categoryIds);
  return { event, categories };
}

export function importExpensesFromCSV(
  csvText: string,
  event: Event,
  categories: ExpenseCategory[],
): Expense[] {
  const sections = parseSections(csvText);
  const expenseRows = rowsForSection(sections, "Expenses");
  const categoryIds = new Set(categories.map((category) => category.id));
  return parseExpenses(expenseRows, event, categoryIds);
}

export function importCategoriesFromCSV(csvText: string): ExpenseCategory[] {
  const sections = parseSections(csvText);
  return rowsForSection(sections, "Categories").map((row, index) => {
    if (!row.id?.trim() || !row.name?.trim()) {
      throw new CSVImportError(`Categories row ${index + 1} must contain id and name.`);
    }
    return { id: row.id.trim(), name: row.name.trim(), icon: row.icon?.trim() || "◼️" };
  });
}

function parseExpenses(rows: Record<string, string>[], event: Event, categoryIds: Set<string>): Expense[] {
  const participantIds = new Set(event.users.map((participant) => participant.id));

  return rows.map((row, index) => {
    const amountCents = parseAmountCents(row.amountCents, `Expenses row ${index + 1}`);
    const splitMode = parseSplitMode(row.splitMode, index);
    const categoryId = row.categoryId?.trim() || undefined;

    if (categoryId && !categoryIds.has(categoryId)) {
      throw new CSVImportError(`Expenses row ${index + 1} references unknown category ${categoryId}.`);
    }

    const expense: Expense = {
      id: row.id?.trim() || `imported-expense-${index + 1}`,
      title: row.title?.trim() || "",
      amountCents,
      paidBySplits: parseSplitList(row.paidBySplits, participantIds, `Expenses row ${index + 1} paidBySplits`),
      splits: parseSplitList(row.splits, participantIds, `Expenses row ${index + 1} splits`),
      categoryId,
      date: row.date?.trim() || new Date().toISOString(),
      note: row.note?.trim() || undefined,
      splitMode,
    };

    const validation = validateExpense(event, expense);
    if (!validation.ok) {
      throw new CSVImportError(`Expenses row ${index + 1} is invalid: ${validation.error}.`);
    }

    return expense;
  });
}

function parseSections(csvText: string): Map<SectionName, string[][]> {
  const rows = parseCSVRows(csvText).filter((row) => row.some((cell) => cell.trim()));
  const sections = new Map<SectionName, string[][]>();
  let currentSection: SectionName | null = null;

  for (const row of rows) {
    const marker = row.length === 1 ? row[0].trim() : "";
    const sectionName = marker.startsWith("[") && marker.endsWith(")") ? "" : marker.slice(1, -1);
    if (marker.startsWith("[") && marker.endsWith("]") && sectionNames.has(sectionName as SectionName)) {
      currentSection = sectionName as SectionName;
      sections.set(currentSection, []);
      continue;
    }

    if (currentSection) {
      sections.get(currentSection)?.push(row);
    }
  }

  return sections;
}

function rowsForSection(sections: Map<SectionName, string[][]>, sectionName: SectionName): Record<string, string>[] {
  const rows = sections.get(sectionName) ?? [];
  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])),
  );
}

function parseCSVRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];
    const nextCharacter = csvText[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += character;
  }

  row.push(field);
  rows.push(row);
  return rows;
}

function formatCSVRow(row: string[]): string {
  return row.map(formatCSVField).join(",");
}

function formatCSVField(field: string): string {
  if (/[",\n\r]/.test(field)) {
    return `"${field.replaceAll('"', '""')}"`;
  }

  return field;
}

function formatSplitList(splits: ExpenseSplit[]): string {
  return splits.map((split) => `${split.participantId}:${split.amountCents}`).join(";");
}

function parseSplitList(value: string | undefined, participantIds: Set<string>, label: string): ExpenseSplit[] {
  const splitText = value?.trim();
  if (!splitText) {
    return [];
  }

  return splitText.split(";").map((entry) => {
    const [participantId, rawAmountCents] = entry.split(":");
    const normalizedParticipantId = participantId?.trim();
    if (!normalizedParticipantId || !participantIds.has(normalizedParticipantId)) {
      throw new CSVImportError(`${label} references unknown participant ${normalizedParticipantId}.`);
    }

    return {
      participantId: normalizedParticipantId,
      amountCents: parseAmountCents(rawAmountCents, label),
    };
  });
}

function parseIdList(value: string | undefined): string[] {
  return (value ?? "")
    .split(";")
    .map((id) => id.trim())
    .filter(Boolean);
}

function parseAmountCents(value: string | undefined, label: string): number {
  const amountCents = Number(value);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new CSVImportError(`${label} amountCents must be a positive integer.`);
  }

  return amountCents;
}

function parseSplitMode(value: string | undefined, index: number): ExpenseSplitMode {
  const splitMode = value?.trim();
  if (splitMode === "equal" || splitMode === "custom") {
    return splitMode;
  }

  throw new CSVImportError(`Expenses row ${index + 1} splitMode must be equal or custom.`);
}
