"use client";

import { useFormStatus } from "react-dom";
import Button from "@/app/components/ui/Button";

export default function AuthButton({ children, pendingText = "Please wait…" }: { children: React.ReactNode; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} fullWidth>
      {pending ? pendingText : children}
    </Button>
  );
}
