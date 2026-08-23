import type { Metadata } from "next";
import Link from "next/link";
import AuthCard from "@/app/components/auth/AuthCard";
import VerifyEmailForm from "./VerifyEmailForm";

export const metadata: Metadata = { title: "Verify your email - NoDalalTalks" };
export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;

  return (
    <AuthCard
      eyebrow="Email verification"
      title="Verify your email"
      subtitle={token ? "Confirm this is your email address to complete this step of your profile." : "This link is missing its verification token."}
      footer={
        <Link href="/account?tab=profile" className="font-medium text-foreground hover:underline">
          ← Back to your profile
        </Link>
      }
    >
      {token ? (
        <VerifyEmailForm token={token} />
      ) : (
        <p className="text-sm text-muted">
          Request a new link from{" "}
          <Link href="/account?tab=profile" className="font-medium text-foreground hover:underline">
            your profile
          </Link>
          .
        </p>
      )}
    </AuthCard>
  );
}
