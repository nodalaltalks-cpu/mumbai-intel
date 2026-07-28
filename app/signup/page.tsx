import type { Metadata } from "next";
import Link from "next/link";
import AuthCard from "@/app/components/auth/AuthCard";
import SignupForm from "./SignupForm";

export const metadata: Metadata = { title: "Create your account — NoDalalTalks" };
export const dynamic = "force-dynamic";

export default function SignupPage() {
  return (
    <AuthCard
      eyebrow="Get started"
      title="Create your account"
      subtitle="Free — track projects, developers and areas across Mumbai."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthCard>
  );
}
