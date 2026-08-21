"use client";

import { useActionState, useState } from "react";
import { updateUserAction, type UserFormState } from "@/lib/actions/users";
import { USER_ROLES } from "@/lib/project-meta";
import { PERMISSION_GROUPS } from "@/lib/auth/permission-constants";
import { CheckboxField, Field, FieldGroup, FormError, SelectField } from "./FormField";
import SubmitButton from "./SubmitButton";

export interface UserEditData {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  permissions: string[];
}

const initialState: UserFormState = {};

export default function UserEditForm({ user, isSelf }: { user: UserEditData; isSelf: boolean }) {
  const action = updateUserAction.bind(null, user.id);
  const [state, formAction] = useActionState(action, initialState);
  const [role, setRole] = useState(user.role);
  const [permissions, setPermissions] = useState(new Set(user.permissions));

  function toggle(key: string) {
    const next = new Set(permissions);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setPermissions(next);
  }

  const permissionsApply = role !== "ADMIN";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormError message={state.error} />
      <Field label="Email" name="email" defaultValue={user.email} disabled hint="Email cannot be changed" />
      <FieldGroup>
        <Field label="Name" name="name" defaultValue={user.name ?? ""} />
        <SelectField label="Role" name="role" value={role} onChange={(e) => setRole(e.target.value)} disabled={isSelf}>
          {USER_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
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

      <div className="border-t border-border pt-4">
        <p className="font-mono text-xs uppercase tracking-wide text-foreground">Permissions</p>
        <p className="mt-1 text-[11px] text-muted">
          {permissionsApply
            ? "What this account can do, beyond its role. Admin always has full access regardless of these — permissions only apply to Editor / Viewer accounts."
            : "Admin accounts always have full access — permissions below have no effect until the role is changed to Editor or Viewer."}
        </p>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PERMISSION_GROUPS.map((group) => (
            <div key={group.key} className="rounded-sm border border-border p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{group.label}</p>
              <div className="mt-2 flex flex-col gap-1.5">
                {group.permissions.map((perm) => (
                  <label key={perm.key} className={`flex items-center gap-2 text-xs ${permissionsApply ? "text-foreground" : "text-muted"}`}>
                    <input
                      type="checkbox"
                      name="permissions"
                      value={perm.key}
                      checked={permissions.has(perm.key)}
                      onChange={() => toggle(perm.key)}
                      disabled={!permissionsApply}
                      className="h-3.5 w-3.5 accent-accent"
                    />
                    {perm.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SubmitButton>Save changes</SubmitButton>
      </div>
    </form>
  );
}
