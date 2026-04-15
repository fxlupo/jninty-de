/**
 * Expense repository — API-backed implementation.
 * Replaces the PouchDB implementation; exports the same function signatures.
 */
import { get, post, patch, del } from "../../api/client.ts";
import { type Expense } from "../../../validation/expense.schema.ts";

const BASE = "/api/expenses";

type CreateExpenseInput = Omit<
  Expense,
  "id" | "version" | "createdAt" | "updatedAt" | "deletedAt"
>;

type UpdateExpenseInput = Partial<CreateExpenseInput>;

export async function create(input: CreateExpenseInput): Promise<Expense> {
  return post<Expense>(BASE, input);
}

export async function update(id: string, changes: UpdateExpenseInput): Promise<Expense> {
  return patch<Expense>(`${BASE}/${id}`, changes);
}

export async function softDelete(id: string): Promise<void> {
  await del(`${BASE}/${id}`);
}

export async function getById(id: string): Promise<Expense | undefined> {
  try {
    return await get<Expense>(`${BASE}/${id}`);
  } catch {
    return undefined;
  }
}

export async function getAll(): Promise<Expense[]> {
  return get<Expense[]>(BASE);
}

export async function getBySeason(seasonId: string): Promise<Expense[]> {
  return get<Expense[]>(`${BASE}?seasonId=${seasonId}`);
}
