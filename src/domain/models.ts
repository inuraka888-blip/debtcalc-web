export type UserId = string;
export type GroupId = string;
export type EventId = GroupId;
export type ParticipantGroupId = string;
export type ExpenseId = string;
export type ExpenseCategoryId = string;

export type ExpenseSplitMode = "equal" | "custom";

export interface User {
  id: UserId;
  name: string;
}

export type Participant = User;

export interface ParticipantGroup {
  id: ParticipantGroupId;
  name: string;
  participantIds: UserId[];
}

export interface ExpenseSplit {
  participantId: UserId;
  amountCents: number;
}

export interface Expense {
  id: ExpenseId;
  title: string;
  amountCents: number;
  paidBySplits: ExpenseSplit[];
  splits: ExpenseSplit[];
  categoryId?: ExpenseCategoryId;
  note?: string;
  splitMode: ExpenseSplitMode;
  date: string;
}

export interface Group {
  id: GroupId;
  name: string;
  users: User[];
  participantGroups: ParticipantGroup[];
  expenses: Expense[];
}

export type Event = Group;

export interface ExpenseCategory {
  id: ExpenseCategoryId;
  name: string;
  icon: string;
}

export type ReminderStatus = "scheduled" | "sent" | "cancelled";

export interface Reminder {
  id: string;
  eventId: EventId;
  expenseId?: ExpenseId;
  title: string;
  message?: string;
  remindAt: string;
  status: ReminderStatus;
  createdAt: string;
}

export interface Debt {
  id: string;
  from: UserId;
  to: UserId;
  amountCents: number;
}
