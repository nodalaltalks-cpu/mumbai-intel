"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMutateSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { revalidateTransaction } from "@/lib/cache";
import { BUYER_TYPES, CONFIDENCE_LEVELS, DATA_SOURCES, TRANSACTION_TYPES } from "@/lib/project-meta";
import { friendlyPrismaError } from "./errors";

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
  const derivedRate =
    !explicitRate && data.carpetSqft
      ? BigInt(Math.round((data.valueRupees / data.carpetSqft) * 100))
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
  await requireMutateSession();

  const parsed = parseTransactionForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  let created;
  try {
    created = await prisma.transaction.create({ data: buildTransactionData(parsed.data) });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  revalidateTransaction({ id: created.id });
  redirect("/admin/transactions?created=1");
}

export async function updateTransactionAction(
  transactionId: string,
  _prevState: TransactionFormState,
  formData: FormData
): Promise<TransactionFormState> {
  await requireMutateSession();

  const parsed = parseTransactionForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    await prisma.transaction.update({
      where: { id: transactionId },
      data: buildTransactionData(parsed.data),
    });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }

  revalidateTransaction({ id: transactionId });
  redirect("/admin/transactions?saved=1");
}

export async function deleteTransactionAction(transactionId: string): Promise<{ error?: string }> {
  await requireMutateSession();
  try {
    await prisma.transaction.delete({ where: { id: transactionId } });
  } catch (error) {
    return { error: friendlyPrismaError(error) };
  }
  revalidateTransaction({ id: transactionId });
  return {};
}
