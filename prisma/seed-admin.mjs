import "dotenv/config";
import crypto from "crypto";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const ADMIN_EMAIL = "nodalaltalks02@gmail.com";

function generatePassword(length = 16) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (existing) {
    console.log(`Admin user already exists: ${ADMIN_EMAIL} (role: ${existing.role}). No changes made.`);
    console.log("To reset the password, delete this user and re-run the seed, or update passwordHash manually.");
    return;
  }

  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      name: "Founder",
      passwordHash,
      role: "ADMIN",
      isActive: true,
    },
  });

  console.log("Founder admin account created.");
  console.log(`Email:    ${ADMIN_EMAIL}`);
  console.log(`Password: ${password}`);
  console.log("Store this password now — it will not be shown again.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
