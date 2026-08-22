"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdminSession, requireMutateSession } from "@/lib/auth/guard";
import { requireTrashReauth } from "@/lib/auth/trash-reauth";
import { prisma } from "@/lib/prisma";
import { revalidateTransaction } from "@/lib/cache";
import { BUYER_TYPES, CONFIDENCE_LEVELS, DATA_SOURCES, TRANSACTION_TYPES } from "@/lib/project-meta";
import { logAudit } from "@/lib/audit";
import { friendlyPrismaError, updateManyByRow } from "./errors";

const emptyToUndefined = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : v);

const transactionSchema = z.object({
  projectId: z.preprocess(emptyToUndefined, z.string().optional()),
  localityId: z.string().min(1, "Locality is required"),
  type: z.enum(TRANSACTION_TYPES),
  registrationDate: z.coerce.date({ message: "Registration date is required" }),
  valueRupees: z.coerce.number().positive("Value must be greater than 0"),
  carpetSqft: z.preprocess(emptyToUndefined, z.coerce.number().positive().optional()),
  builtUpSqft: z.preprocess(emptyToUndefined, z.coerce.number().positive().optional()),
  pricePerSqftRupees: z.preprocess(emptyToUndefined, z.coerce.number().positive().optional()),
  bedrooms: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
  floor: z.preprocess(emptyToUndefined, z.coerce.number().int().optional()),
  tower: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  unitLabel: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  buyerType: z.preprocess(emptyToUndefined, z.enum(BUYER_TYPES).optional()),
  dataSource: z.enum(DATA_SOURCES),
  confidence: z.enum(CONFIDENCE_LEVELS),
  sourceRef: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  sourceNote: z.preprocess(emptyToUndefined, z.string().trim().optional()),
});

export interface TransactionFormState {
  error?: string;
}

function parseTransactionForm(formData: FormData) {
  return transactionSchema.safeParse({
    projectId: formData.get("projectId"),
    localityId: formData.get("localityId"),
    type: formData.get("type"),
    registrationDate: formData.get("registrationDate"),
    valueRupees: formData.get("valueRupees"),
    carpetSqft: formData.get("carpetSqft"),
    builtUpSqft: formData.get("builtUpSqft"),
    pricePerSqftRupees: formData.get("pricePerSqftRupees"),
    bedrooms: formData.get("bedrooms"),
    floor: formData.get("floor"),
    tower: formData.get("tower"),
    unitLabel: formData.get("unitLabel"),
    buyerType: formData.get("buyerType"),
    dataSource: formData.get("dataSource"),
    confidence: formData.get("confidence"),
    sourceRef: formData.get("sourceRef"),
    sourceNote: formData.get("sourceNote"),
  });
}

function buildTransactionData(data: z.infer<typeof transactionSchema>) {
  const valuePaise = BigInt(Math.round(data.valueRupees * 100));
  const explicitRate = data.pricePerSqftRupees
    ? BigInt(Math.round(data.pricePerSqftRupees * 100))
    : null;
  // Falls back to builtUpSqft when carpetSqft isn't given — a common case
  // for builder-quoted rate cards, which are usually priced on built-up area.
  const areaForRate = data.carpetSqft ?? data.builtUpSqft;
  const derivedRate =
    !explicitRate && areaForRate
      ? BigInt(Math.round((data.valueRupees / areaForRate) * 100))
      : null;

  return {
    projectId: data.projectId || null,
    localityId: data.localityId,
    type: data.type,
    registrationDate: data.registrationDate,
    valuePaise,
    carpetSqft: data.carpetSqft ?? null,
    builtUpSqft: data.builtUpSqft ?? null,
    pricePerSqftPaise: explicitRate ?? derivedRate,
    bedrooms: data.bedrooms ?? null,
    floor: data.floor ?? null,
    tower: data.tower ?? null,
    unitLabel: data.unitLabel ?? null,
    buyerType: data.buyerType ?? null,
    dataSource: data.dataSource,
    confidence: data.confidence,
    sourceRef: data.sourceRef ?? null,
    sourceNote: data.sourceNote ?? null,
  };
}

export async function createTransactionAction(
  _prevState: TransactionFormState,
  formData: FormData
): Promise<TransactionFormState> {
  const session = await requireMutateSession();

  const parsed = parseTransactionForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  let created;
  try {
    created = await prisma.transaction.create({ data: buildTransactionData(parsed.data) });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  await logAudit(session.userId, "transaction.create", "Transaction", created.id);
  revalidateTransaction({ id: created.id });
  redirect("/admin/transactions?created=1");
}

export async function updateTransactionAction(
  transactionId: string,
  _prevState: TransactionFormState,
  formData: FormData
): Promise<TransactionFormState> {
  const session = await requireMutateSession();

  const parsed = parseTransactionForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const existing = await prisma.transaction.findUnique({ where: { id: transactionId } });
  if (!existing) return { error: "Transaction not found" };

  const nextData = buildTransactionData(parsed.data);

  try {
    await prisma.transaction.update({ where: { id: transactionId }, data: nextData });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  await logAudit(session.userId, "transaction.update", "Transaction", transactionId, { before: existing, after: nextData });
  revalidateTransaction({ id: transactionId });
  redirect("/admin/transactions?saved=1");
}

export async function deleteTransactionAction(transactionId: string): Promise<{ error?: string }> {
  const session = await requireAdminSession();

  const existing = await prisma.transaction.findUnique({ where: { id: transactionId }, select: { id: true } });
  if (!existing) return { error: "Transaction not found" };

  await prisma.transaction.update({
    where: { id: transactionId },
    data: { deletedAt: new Date(), deletedByUserId: session.userId },
  });
  await logAudit(session.userId, "transaction.trash", "Transaction", transactionId);
  revalidateTransaction({ id: transactionId });
  return {};
}

export async function restoreTransactionAction(transactionId: string): Promise<{ error?: string }> {
  const session = await requireAdminSession();

  const existing = await prisma.transaction.findUnique({ where: { id: transactionId }, select: { id: true } });
  if (!existing) return { error: "Transaction not found" };

  await prisma.transaction.update({ where: { id: transactionId }, data: { deletedAt: null, deletedByUserId: null } });
  await logAudit(session.userId, "transaction.restore", "Transaction", transactionId);
  revalidateTransaction({ id: transactionId });
  return {};
}

export async function permanentlyDeleteTransactionAction(transactionId: string): Promise<{ error?: string }> {
  const session = await requireAdminSession();
  try {
    await requireTrashReauth(session.userId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Re-authentication required" };
  }

  const existing = await prisma.transaction.findUnique({ where: { id: transactionId }, select: { deletedAt: true } });
  if (!existing) return { error: "Transaction not found" };
  if (!existing.deletedAt) return { error: "Move this transaction to Trash before permanently deleting it" };

  await prisma.transaction.delete({ where: { id: transactionId } });
  await logAudit(session.userId, "transaction.permanent-delete", "Transaction", transactionId);
  revalidateTransaction({ id: transactionId });
  return {};
}

export async function emptyTransactionTrashAction(): Promise<{ error?: string; affected?: number }> {
  const session = await requireAdminSession();
  try {
    await requireTrashReauth(session.userId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Re-authentication required" };
  }
  const result = await prisma.transaction.deleteMany({ where: { deletedAt: { not: null } } });
  await logAudit(session.userId, "transaction.trash.empty", "Transaction", "bulk");
  revalidateTransaction();
  return { affected: result.count };
}

export type BulkTransactionOperation = "delete" | "restore" | "permanent-delete";

export async function bulkTransactionAction(
  transactionIds: string[],
  operation: BulkTransactionOperation
): Promise<{ error?: string; affected?: number }> {
  const session = await requireAdminSession();
  if (transactionIds.length === 0) return { error: "No transactions selected" };
  if (operation === "permanent-delete") {
    try {
      await requireTrashReauth(session.userId);
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Re-authentication required" };
    }
  }

  let affected = 0;
  try {
    if (operation === "delete") {
      affected = await updateManyByRow(transactionIds, (id) =>
        prisma.transaction.update({ where: { id }, data: { deletedAt: new Date(), deletedByUserId: session.userId } })
      );
    } else if (operation === "restore") {
      affected = await updateManyByRow(transactionIds, (id) =>
        prisma.transaction.update({ where: { id }, data: { deletedAt: null, deletedByUserId: null } })
      );
    } else if (operation === "permanent-delete") {
      affected = (
        await prisma.transaction.deleteMany({ where: { id: { in: transactionIds }, deletedAt: { not: null } } })
      ).count;
    }
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  await logAudit(session.userId, `transaction.bulk.${operation}`, "Transaction", transactionIds.join(","));
  revalidateTransaction();
  return { affected };
}
