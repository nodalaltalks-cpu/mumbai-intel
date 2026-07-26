"use client";

import { useActionState } from "react";
import { updateUserAction, type UserFormState } from "@/lib/actions/users";
import { USER_ROLES } from "@/lib/project-meta";
import { CheckboxField, Field, FieldGroup, FormError, SelectField } from "./FormField";
import SubmitButton from "./SubmitButton";

export interface UserEditData {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
}

const initialState: UserFormState = {};

export default function UserEditForm({ user, isSelf }: { user: UserEditData; isSelf: boolean }) {
  const action = updateUserAction.bind(null, user.id);
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormError message={state.error} />
      <Field label="Email" name="email" defaultValue={user.email} disabled hint="Email cannot be changed" />
      <FieldGroup>
        <Field label="Name" name="name" defaultValue={user.name ?? ""} />
        <SelectField label="Role" name="role" defaultValue={user.role} disabled={isSelf}>
          {USER_ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </SelectField>
      </FieldGroup>
      <CheckboxField
        label="Active"
        name="isActive"
        defaultChecked={user.isActive}
        disabled={isSelf}
        hint={isSelf ? "You cannot deactivate your own account" : "Inactive users cannot log in"}
      />
      <Field label="Reset password (optional)" name="newPassword" type="password" hint="Leave blank to keep the current password" />
      <div>
        <SubmitButton>Save changes</SubmitButton>
      </div>
    </form>
  );
}
