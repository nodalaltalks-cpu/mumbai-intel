"use client";

import { useActionState, useState } from "react";
import {
  createTransactionAction,
  updateTransactionAction,
  type TransactionFormState,
} from "@/lib/actions/transactions";
import { createLocalityInlineAction } from "@/lib/actions/localities";
import {
  BUYER_TYPE_LABEL,
  BUYER_TYPES,
  CONFIDENCE_LEVELS,
  DATA_SOURCES,
  SOURCE_LABEL,
  TRANSACTION_TYPE_LABEL,
  TRANSACTION_TYPES,
} from "@/lib/project-meta";
import { Field, FieldGroup, FormError, SelectField } from "./FormField";
import InlineEntityCreate from "./InlineEntityCreate";
import SubmitButton from "./SubmitButton";

export interface TransactionFormData {
  id: string;
  projectId: string | null;
  localityId: string;
  type: string;
  registrationDate: Date;
  valuePaise: number;
  carpetSqft: number | null;
  builtUpSqft: number | null;
  pricePerSqftPaise: number | null;
  bedrooms: number | null;
  floor: number | null;
  tower: string | null;
  unitLabel: string | null;
  buyerType: string | null;
  dataSource: string;
  confidence: string;
  sourceRef: string | null;
  sourceNote: string | null;
}

export interface SelectOption {
  id: string;
  name: string;
}

const initialState: TransactionFormState = {};

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default function TransactionForm({
  transaction,
  localities,
  projects,
}: {
  transaction?: TransactionFormData;
  localities: SelectOption[];
  projects: SelectOption[];
}) {
  const action = transaction
    ? updateTransactionAction.bind(null, transaction.id)
    : createTransactionAction;
  const [state, formAction] = useActionState(action, initialState);
  const [localityOptions, setLocalityOptions] = useState(localities);
  const [selectedLocalityId, setSelectedLocalityId] = useState(transaction?.localityId ?? "");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormError message={state.error} />

      <FieldGroup>
        <div>
          <SelectField
            label="Locality"
            name="localityId"
            required
            value={selectedLocalityId}
            onChange={(e) => setSelectedLocalityId(e.target.value)}
          >
            <option value="" disabled>
              Select a locality
            </option>
            {localityOptions.map((locality) => (
              <option key={locality.id} value={locality.id}>
                {locality.name}
              </option>
            ))}
          </SelectField>
          <InlineEntityCreate
            label="Locality"
            action={createLocalityInlineAction}
            onCreated={({ id, name }) => {
              setLocalityOptions((prev) => (prev.some((l) => l.id === id) ? prev : [...prev, { id, name }]));
              setSelectedLocalityId(id);
            }}
          />
        </div>
        <SelectField label="Project (optional)" name="projectId" defaultValue={transaction?.projectId ?? ""}>
          <option value="">Not linked to a project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </SelectField>
      </FieldGroup>

      <FieldGroup>
        <SelectField label="Type" name="type" defaultValue={transaction?.type ?? "SALE"}>
          {TRANSACTION_TYPES.map((type) => (
            <option key={type} value={type}>
              {TRANSACTION_TYPE_LABEL[type]}
            </option>
          ))}
        </SelectField>
        <Field
          label="Registration date"
          name="registrationDate"
          type="date"
          required
          defaultValue={transaction ? toDateInputValue(transaction.registrationDate) : ""}
        />
      </FieldGroup>

      <FieldGroup>
        <Field
          label="Value (₹)"
          name="valueRupees"
          type="number"
          step="any"
          required
          defaultValue={transaction ? Number(transaction.valuePaise) / 100 : ""}
          placeholder="e.g. 25000000 for ₹2.5 Cr"
        />
        <Field
          label="Carpet area (sqft)"
          name="carpetSqft"
          type="number"
          step="any"
          defaultValue={transaction?.carpetSqft ?? ""}
        />
      </FieldGroup>

      <FieldGroup>
        <Field
          label="Built-up area (sqft)"
          name="builtUpSqft"
          type="number"
          step="any"
          defaultValue={transaction?.builtUpSqft ?? ""}
        />
        <Field
          label="Rate ₹/sqft (optional)"
          name="pricePerSqftRupees"
          type="number"
          step="any"
          defaultValue={
            transaction?.pricePerSqftPaise !== null && transaction?.pricePerSqftPaise !== undefined
              ? Number(transaction.pricePerSqftPaise) / 100
              : ""
          }
          hint="Auto-computed from value ÷ carpet area if left blank"
        />
      </FieldGroup>

      <FieldGroup>
        <Field label="Bedrooms" name="bedrooms" type="number" step="0.5" defaultValue={transaction?.bedrooms ?? ""} />
        <SelectField label="Buyer type (optional)" name="buyerType" defaultValue={transaction?.buyerType ?? ""}>
          <option value="">Not specified</option>
          {BUYER_TYPES.map((type) => (
            <option key={type} value={type}>
              {BUYER_TYPE_LABEL[type]}
            </option>
          ))}
        </SelectField>
      </FieldGroup>

      <FieldGroup>
        <Field label="Floor" name="floor" type="number" defaultValue={transaction?.floor ?? ""} />
        <Field label="Tower" name="tower" defaultValue={transaction?.tower ?? ""} />
      </FieldGroup>

      <FieldGroup>
        <Field label="Unit label" name="unitLabel" defaultValue={transaction?.unitLabel ?? ""} placeholder="A-1204" />
        <Field label="Source reference" name="sourceRef" defaultValue={transaction?.sourceRef ?? ""} />
      </FieldGroup>

      <FieldGroup>
        <SelectField label="Data source" name="dataSource" defaultValue={transaction?.dataSource ?? "MANUALLY_VERIFIED"}>
          {DATA_SOURCES.map((source) => (
            <option key={source} value={source}>
              {SOURCE_LABEL[source]}
            </option>
          ))}
        </SelectField>
        <SelectField label="Confidence" name="confidence" defaultValue={transaction?.confidence ?? "MEDIUM"}>
          {CONFIDENCE_LEVELS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </SelectField>
      </FieldGroup>

      <Field label="Source note" name="sourceNote" defaultValue={transaction?.sourceNote ?? ""} />

      <div>
        <SubmitButton>{transaction ? "Save changes" : "Create transaction"}</SubmitButton>
      </div>
    </form>
  );
}
