import "dotenv/config";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const ZONES = [
  { slug: "south-mumbai", name: "South Mumbai" },
  { slug: "south-central-mumbai", name: "South Central Mumbai" },
  { slug: "central-mumbai", name: "Central Mumbai" },
  { slug: "western-suburbs", name: "Western Suburbs" },
  { slug: "eastern-suburbs", name: "Eastern Suburbs" },
];

const LOCALITIES = [
  { zone: "south-mumbai", name: "Colaba", slug: "colaba", pincode: "400001", lat: 18.9067, lng: 72.8147 },
  { zone: "south-mumbai", name: "Malabar Hill", slug: "malabar-hill", pincode: "400006", lat: 18.9548, lng: 72.7986 },
  { zone: "south-mumbai", name: "Marine Lines", slug: "marine-lines", pincode: "400002", lat: 18.9432, lng: 72.8235 },
  { zone: "south-central-mumbai", name: "Lower Parel", slug: "lower-parel", pincode: "400013", lat: 18.996, lng: 72.8302 },
  { zone: "south-central-mumbai", name: "Worli", slug: "worli", pincode: "400018", lat: 19.0176, lng: 72.8162 },
  { zone: "south-central-mumbai", name: "Prabhadevi", slug: "prabhadevi", pincode: "400025", lat: 19.017, lng: 72.8296 },
  { zone: "central-mumbai", name: "Dadar West", slug: "dadar-west", pincode: "400028", lat: 19.0186, lng: 72.842 },
  { zone: "central-mumbai", name: "Sion", slug: "sion", pincode: "400022", lat: 19.0448, lng: 72.8622 },
  { zone: "western-suburbs", name: "Bandra West", slug: "bandra-west", pincode: "400050", lat: 19.0596, lng: 72.8295 },
  { zone: "western-suburbs", name: "Khar West", slug: "khar-west", pincode: "400052", lat: 19.0728, lng: 72.8348 },
  { zone: "western-suburbs", name: "Andheri West", slug: "andheri-west", pincode: "400058", lat: 19.1364, lng: 72.8296 },
  { zone: "western-suburbs", name: "Juhu", slug: "juhu", pincode: "400049", lat: 19.1075, lng: 72.8263 },
  { zone: "western-suburbs", name: "Borivali West", slug: "borivali-west", pincode: "400092", lat: 19.2307, lng: 72.8567 },
  { zone: "western-suburbs", name: "Malad West", slug: "malad-west", pincode: "400064", lat: 19.1874, lng: 72.8484 },
  { zone: "eastern-suburbs", name: "Powai", slug: "powai", pincode: "400076", lat: 19.1176, lng: 72.906 },
  { zone: "eastern-suburbs", name: "Ghatkopar West", slug: "ghatkopar-west", pincode: "400086", lat: 19.0864, lng: 72.9081 },
  { zone: "eastern-suburbs", name: "Chembur", slug: "chembur", pincode: "400071", lat: 19.0522, lng: 72.9005 },
  { zone: "eastern-suburbs", name: "Mulund West", slug: "mulund-west", pincode: "400080", lat: 19.1726, lng: 72.9425 },
];

async function main() {
  const country = await prisma.country.upsert({
    where: { iso2: "IN" },
    update: {},
    create: { name: "India", iso2: "IN", currency: "INR" },
  });
  console.log(`Country: ${country.name}`);

  const state = await prisma.state.upsert({
    where: { countryId_code: { countryId: country.id, code: "MH" } },
    update: {},
    create: {
      countryId: country.id,
      name: "Maharashtra",
      code: "MH",
      reraPortalUrl: "https://maharera.mahaonline.gov.in",
    },
  });
  console.log(`State: ${state.name}`);

  const city = await prisma.city.upsert({
    where: { stateId_name: { stateId: state.id, name: "Mumbai" } },
    update: { isLive: true },
    create: {
      stateId: state.id,
      name: "Mumbai",
      slug: "mumbai",
      isLive: true,
      centroidLat: 19.076,
      centroidLng: 72.8777,
    },
  });
  console.log(`City: ${city.name} (isLive=${city.isLive})`);

  const zoneIdBySlug = {};
  for (const zone of ZONES) {
    const row = await prisma.zone.upsert({
      where: { cityId_slug: { cityId: city.id, slug: zone.slug } },
      update: { name: zone.name },
      create: { cityId: city.id, slug: zone.slug, name: zone.name },
    });
    zoneIdBySlug[zone.slug] = row.id;
  }
  console.log(`Zones: ${ZONES.length}`);

  for (const loc of LOCALITIES) {
    await prisma.locality.upsert({
      where: { cityId_slug: { cityId: city.id, slug: loc.slug } },
      update: {
        name: loc.name,
        zoneId: zoneIdBySlug[loc.zone],
        pincode: loc.pincode,
        centroidLat: loc.lat,
        centroidLng: loc.lng,
      },
      create: {
        cityId: city.id,
        zoneId: zoneIdBySlug[loc.zone],
        name: loc.name,
        slug: loc.slug,
        pincode: loc.pincode,
        centroidLat: loc.lat,
        centroidLng: loc.lng,
      },
    });
  }
  console.log(`Localities: ${LOCALITIES.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
