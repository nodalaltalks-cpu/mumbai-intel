import "dotenv/config";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const AMENITIES = [
  { slug: "swimming-pool", name: "Swimming Pool", icon: "waves", category: "RECREATION" },
  { slug: "clubhouse", name: "Clubhouse", icon: "building-2", category: "RECREATION" },
  { slug: "gymnasium", name: "Gymnasium", icon: "dumbbell", category: "WELLNESS" },
  { slug: "kids-play-area", name: "Kids' Play Area", icon: "baby", category: "RECREATION" },
  { slug: "landscaped-garden", name: "Landscaped Garden", icon: "trees", category: "OUTDOOR" },
  { slug: "jogging-track", name: "Jogging Track", icon: "footprints", category: "OUTDOOR" },
  { slug: "sports-court", name: "Sports Court", icon: "circle-dot", category: "RECREATION" },
  { slug: "amphitheatre", name: "Amphitheatre", icon: "drama", category: "RECREATION" },
  { slug: "yoga-deck", name: "Yoga / Meditation Deck", icon: "flower-2", category: "WELLNESS" },
  { slug: "spa", name: "Spa", icon: "sparkles", category: "WELLNESS" },
  { slug: "24x7-security", name: "24x7 Security", icon: "shield-check", category: "SAFETY" },
  { slug: "cctv-surveillance", name: "CCTV Surveillance", icon: "camera", category: "SAFETY" },
  { slug: "fire-safety", name: "Fire Safety System", icon: "flame", category: "SAFETY" },
  { slug: "gated-community", name: "Gated Community", icon: "door-closed", category: "SAFETY" },
  { slug: "power-backup", name: "Power Backup", icon: "zap", category: "UTILITIES" },
  { slug: "rainwater-harvesting", name: "Rainwater Harvesting", icon: "cloud-rain", category: "UTILITIES" },
  { slug: "sewage-treatment", name: "Sewage Treatment Plant", icon: "recycle", category: "UTILITIES" },
  { slug: "high-speed-elevators", name: "High-Speed Elevators", icon: "arrow-up-down", category: "CONVENIENCE" },
  { slug: "covered-parking", name: "Covered Parking", icon: "car", category: "CONVENIENCE" },
  { slug: "ev-charging", name: "EV Charging Points", icon: "battery-charging", category: "CONVENIENCE" },
  { slug: "concierge", name: "Concierge Service", icon: "bell", category: "CONVENIENCE" },
  { slug: "co-working-lounge", name: "Co-working Lounge", icon: "laptop", category: "CONVENIENCE" },
  { slug: "party-hall", name: "Party Hall / Banquet", icon: "party-popper", category: "RECREATION" },
  { slug: "senior-citizen-area", name: "Senior Citizen Sit-out", icon: "armchair", category: "OUTDOOR" },
  { slug: "pet-park", name: "Pet Park", icon: "dog", category: "OUTDOOR" },
];

let created = 0;
let skipped = 0;
for (const amenity of AMENITIES) {
  const existing = await prisma.amenity.findUnique({ where: { slug: amenity.slug } });
  if (existing) {
    skipped++;
    continue;
  }
  await prisma.amenity.create({ data: amenity });
  created++;
}

console.log(`Amenities seeded: ${created} created, ${skipped} already present.`);
await prisma.$disconnect();
