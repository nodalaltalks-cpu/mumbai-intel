import type { Metadata } from "next";
import Link from "next/link";
import AuthCard from "@/app/components/auth/AuthCard";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Sign in - NoDalalTalks" };
export const dynamic = "force-dynamic";

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  google_not_configured: "Google sign-in isn't set up yet. Use email and password, or try again later.",
  google_auth_failed: "We couldn't sign you in with Google. Please try again.",
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
