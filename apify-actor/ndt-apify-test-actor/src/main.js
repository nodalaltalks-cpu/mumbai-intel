import { Actor } from "apify";

/**
 * NDT Apify Test Actor -- integration-test ONLY.
 *
 * Outputs exactly one hardcoded dummy Project record to this run's default
 * dataset. Does not fetch, scrape, or make any network request to any real
 * website -- there is nothing here but a single in-memory object, on
 * purpose, so this Actor cannot be mistaken for (or accidentally become) a
 * real listings scraper.
 *
 * This record is designed to be accepted by the EXISTING, unmodified
 * mumbai-intel importer (lib/ingestion/apifyBridge.ts ->
 * lib/ingestion/fileImportRunner.ts#runProjectFileImport). Field names use
 * the same camelCase the importer's column-mapping already expects from a
 * scraper; "Chembur" is a real, currently-seeded locality name in that
 * project's database (verified read-only before this Actor was written) --
 * required so the row resolves to a real Locality instead of failing.
 */
await Actor.init();

const testProject = {
  name: "NDT APIFY TEST - Do Not Publish",
  localityName: "Chembur",
  status: "Under Construction",
  category: "Residential",
  address: "Test address — not a real project",
  description:
    "Created to verify the Apify webhook -> IngestStagingRecord -> admin review pipeline end-to-end. Safe to reject in the Review Queue once confirmed.",
};

await Actor.pushData(testProject);

console.log("NDT test actor: pushed 1 dummy project record to the default dataset.");

await Actor.exit();
