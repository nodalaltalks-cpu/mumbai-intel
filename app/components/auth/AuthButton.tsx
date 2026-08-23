"use client";

import { forwardRef } from "react";
import { useFormStatus } from "react-dom";
import Button from "@/app/components/ui/Button";

const AuthButton = forwardRef<HTMLButtonElement, { children: React.ReactNode; pendingText?: string }>(function AuthButton(
  { children, pendingText = "Please wait…" },
  ref
) {
  const { pending } = useFormStatus();
  return (
    <Button ref={ref} type="submit" disabled={pending} fullWidth>
      {pending ? pendingText : children}
    </Button>
  );
});

export default AuthButton;
