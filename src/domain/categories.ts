import type { ExpenseCategory } from "./models";

export const OTHER_CATEGORY_ID = "category-other";

export const defaultCategories: ExpenseCategory[] = [
  { id: "category-food", name: "Food", icon: "🍽️" },
  { id: "category-transport", name: "Transport", icon: "🚗" },
  { id: "category-tickets", name: "Tickets", icon: "🎟️" },
  { id: "category-shopping", name: "Shopping", icon: "🛍️" },
  { id: "category-housing", name: "Housing", icon: "🏠" },
  { id: "category-entertainment", name: "Entertainment", icon: "🎉" },
  { id: OTHER_CATEGORY_ID, name: "Other", icon: "◼️" },
];

export function categoryOrOther(categories: ExpenseCategory[], categoryId?: string): ExpenseCategory {
  return (
    categories.find((category) => category.id === categoryId) ??
    categories.find((category) => category.id === OTHER_CATEGORY_ID) ??
    defaultCategories[defaultCategories.length - 1]
  );
}

export function mergeDefaultCategories(categories: ExpenseCategory[] | undefined): ExpenseCategory[] {
  const existingCategories = categories ?? [];
  const existingIds = new Set(existingCategories.map((category) => category.id));

  return [
    ...existingCategories,
    ...defaultCategories.filter((category) => !existingIds.has(category.id)),
  ];
}
