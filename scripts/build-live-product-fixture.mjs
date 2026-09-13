import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const registryPath = path.join(projectRoot, "scrapers", "supported_sites.json");
const fixturePath = path.join(projectRoot, "tests", "live_product_urls.json");

const reportFlag = process.argv.indexOf("--report");
const reportPath = reportFlag >= 0 ? process.argv[reportFlag + 1] : null;
const checkOnly = process.argv.includes("--check");

if (reportFlag >= 0 && (!reportPath || reportPath.startsWith("--"))) {
  throw new Error("--report requires a JSON file path");
}

const registry = JSON.parse(readFileSync(registryPath, "utf8")).sites;
const overrides = JSON.parse(readFileSync(fixturePath, "utf8"));
const report = reportPath ? JSON.parse(readFileSync(reportPath, "utf8")) : [];
const reportRows = Array.isArray(report) ? report : report.results;

if (!Array.isArray(registry) || !Array.isArray(overrides) || !Array.isArray(reportRows)) {
  throw new Error("Registry, fixture, and report must contain arrays");
}

const normalizeHost = (value) => value.toLowerCase().replace(/^www\./, "");
const hostMatches = (candidate, registered) => {
  const host = normalizeHost(candidate);
  const expected = normalizeHost(registered);
  return host === expected || host.endsWith(`.${expected}`);
};

const registryHosts = registry
  .flatMap((entry) => [entry.hostname, ...(entry.aliases || [])].map((hostname) => ({ entry, hostname })))
  .sort((a, b) => b.hostname.length - a.hostname.length);

const findRegistryEntry = (url) => {
  const hostname = new URL(url).hostname;
  return registryHosts.find(({ hostname: registered }) => hostMatches(hostname, registered))?.entry;
};

const overrideByHostname = new Map();
for (const override of overrides) {
  const entry = findRegistryEntry(override.url);
  if (!entry) {
    throw new Error(`Override URL is outside the registry: ${override.url}`);
  }
  if (overrideByHostname.has(entry.hostname)) {
    throw new Error(`Duplicate override for ${entry.hostname}`);
  }
  overrideByHostname.set(entry.hostname, override.url);
}

const reportByHostname = new Map(reportRows.map((row) => [row.hostname, row]));
const fixture = registry.map((entry) => {
  const reportRow = reportByHostname.get(entry.hostname);
  const url = overrideByHostname.get(entry.hostname) || reportRow?.url || entry.baseUrl;
  const matched = findRegistryEntry(url);
  if (matched?.hostname !== entry.hostname) {
    throw new Error(`${entry.name} URL does not belong to ${entry.hostname}: ${url}`);
  }
  return {
    name: entry.name,
    site: entry.site,
    hostname: entry.hostname,
    url,
  };
});

const uniqueHostnames = new Set(fixture.map(({ hostname }) => hostname));
if (fixture.length !== registry.length || uniqueHostnames.size !== registry.length) {
  throw new Error(`Expected ${registry.length} unique domains, produced ${uniqueHostnames.size}`);
}

const serializedFixture = `${JSON.stringify(fixture, null, 2)}\n`;
if (checkOnly) {
  if (readFileSync(fixturePath, "utf8") !== serializedFixture) {
    throw new Error("Live product fixture is out of date; run this script without --check");
  }
  console.log(`Validated ${fixture.length} live product fixtures in ${fixturePath}`);
} else {
  writeFileSync(fixturePath, serializedFixture);
  console.log(`Wrote ${fixture.length} live product fixtures to ${fixturePath}`);
}
