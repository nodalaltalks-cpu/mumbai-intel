"use client";

import { useActionState } from "react";
import { createUserAction, type UserFormState } from "@/lib/actions/users";
import { USER_ROLES } from "@/lib/project-meta";
import { Field, FieldGroup, FormError, SelectField } from "./FormField";
import SubmitButton from "./SubmitButton";

const initialState: UserFormState = {};

export default function UserForm() {
  const [state, formAction] = useActionState(createUserAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormError message={state.error} />
      <FieldGroup>
        <Field label="Email" name="email" type="email" required placeholder="editor@mumbaiintel.com" />
        <Field label="Name" name="name" placeholder="Optional" />
      </FieldGroup>
      <FieldGroup>
        <Field label="Password" name="password" type="password" required hint="Minimum 8 characters" />
        <SelectField label="Role" name="role" defaultValue="EDITOR">
          {USER_ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </SelectField>
      </FieldGroup>
      <div>
        <SubmitButton>Create user</SubmitButton>
      </div>
    </form>
  );
}
