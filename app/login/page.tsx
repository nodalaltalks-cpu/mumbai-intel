import type { Metadata } from "next";
import Link from "next/link";
import AuthCard from "@/app/components/auth/AuthCard";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Sign in - NoDalalTalks" };
export const dynamic = "force-dynamic";

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  google_not_configured: "Google sign-in isn't set up yet. Use email and password, or try again later.",
  google_auth_failed: "We couldn't sign you in with Google. Please try again.",
  // Previously unmapped -- the callback redirected here with this reason but the
  // login page showed no message at all, leaving the user staring at a plain
  // login form with no idea why "Continue with Google" didn't work.
  google_email_unverified: "An account with this email already exists. Sign in with your password, or verify this address with Google first.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;
  const googleError = sp.error ? GOOGLE_ERROR_MESSAGES[sp.error] : undefined;

  return (
    <AuthCard
      eyebrow="Welcome back"
      title="Sign in to your account"
      subtitle="Track projects, save searches and follow the Mumbai market."
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium text-foreground hover:underline">
            Sign up
          </Link>
        </>
      }
    >
      <LoginForm googleError={googleError} next={sp.next} />
    </AuthCard>
  );
}
