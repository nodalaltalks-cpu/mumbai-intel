import type { Metadata } from "next";
import Link from "next/link";
import AuthCard from "@/app/components/auth/AuthCard";
import SignupForm from "./SignupForm";

export const metadata: Metadata = { title: "Create your account - NoDalalTalks" };
export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;

  return (
    <AuthCard
      eyebrow="Get started"
      title="Create your account"
      subtitle="Free. Track projects, developers and areas across Mumbai."
      footer={
        <>
          Already have an account?{" "}
          <Link href={sp.next ? `/login?next=${encodeURIComponent(sp.next)}` : "/login"} className="font-medium text-foreground hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm next={sp.next} />
    </AuthCard>
  );
}
