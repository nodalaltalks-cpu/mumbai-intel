import type { Metadata } from "next";
import Link from "next/link";
import AuthCard from "@/app/components/auth/AuthCard";
import ResetPasswordForm from "./ResetPasswordForm";

export const metadata: Metadata = { title: "Set a new password — Mumbai Intel" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;

  return (
    <AuthCard
      eyebrow="Password reset"
      title="Set a new password"
      subtitle={token ? undefined : "This link is missing its reset token."}
      footer={
        <Link href="/login" className="font-medium text-foreground hover:underline">
          ← Back to sign in
        </Link>
      }
    >
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p className="text-sm text-muted">
          Request a new link from the{" "}
          <Link href="/forgot-password" className="font-medium text-foreground hover:underline">
            forgot password
          </Link>{" "}
          page.
        </p>
      )}
    </AuthCard>
  );
}
