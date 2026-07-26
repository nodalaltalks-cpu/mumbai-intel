import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePublicSession } from "@/lib/public-auth/guard";
import { logoutAction } from "@/lib/actions/public-auth";
import { getSavedProjectsForUser } from "@/lib/queries";
import { formatDate } from "@/lib/format";
import Navbar from "@/app/components/Navbar";
import Footer from "@/app/components/Footer";
import { Fact } from "@/app/components/ui/StatCard";
import ProjectCard from "@/app/components/ProjectCard";
import EmptyState from "@/app/components/ui/EmptyState";
import Button from "@/app/components/ui/Button";

export const metadata: Metadata = { title: "My Profile — Mumbai Intel" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await requirePublicSession("/account");
  const [user, savedProjects] = await Promise.all([
    prisma.publicUser.findUnique({ where: { id: session.userId } }),
    getSavedProjectsForUser(session.userId),
  ]);
  if (!user) notFound();

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <Navbar />

      <main id="main-content" className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-raised text-lg font-mono font-semibold text-foreground">
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              (user.name ?? user.email).slice(0, 2).toUpperCase()
            )}
          </div>
          <div>
            <h1 className="font-mono text-2xl font-bold text-foreground">{user.name ?? "Mumbai Intel user"}</h1>
            <p className="text-sm text-muted">{user.email}</p>
          </div>
        </div>

        <section className="rounded-sm border border-border bg-surface p-4">
          <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Account Details</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Fact label="Name" value={user.name ?? "--"} />
            <Fact label="Email" value={user.email} />
            <Fact label="Phone" value={user.phone ?? "Not added"} />
            <Fact label="Sign-in method" value={user.provider === "GOOGLE" ? "Google" : "Email & password"} />
            <Fact label="Member since" value={formatDate(user.createdAt)} />
            <Fact label="Last sign-in" value={user.lastLoginAt ? formatDate(user.lastLoginAt) : "--"} />
          </div>
        </section>

        <section id="saved-projects" className="scroll-mt-24">
          <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Saved Projects</h2>
          {savedProjects.length > 0 ? (
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {savedProjects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          ) : (
            <EmptyState
              className="mt-3"
              title="No saved projects yet"
              message="Tap Save on any project page to bookmark it here."
            />
          )}
        </section>

        <form action={logoutAction}>
          <Button type="submit" variant="danger" size="sm">
            Logout
          </Button>
        </form>
      </main>

      <Footer />
    </div>
  );
}
