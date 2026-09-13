import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const sourcePath = path.join(projectRoot, "tests", "live_scraper_results.json");
const outputPath = path.join(projectRoot, "tests", "LIVE_SCRAPER_TIMINGS.md");
const report = JSON.parse(readFileSync(sourcePath, "utf8"));

const cleanCell = (value) => String(value ?? "")
  .replaceAll("|", "\\|")
  .replace(/\s+/g, " ")
  .trim();

const summary = Object.entries(report.summary || {})
  .map(([status, count]) => `${status}: ${count}`)
  .join(", ");

const rows = report.results.map((result) => {
  const label = result.status === "pass" ? "PASS" : result.status.toUpperCase();
  return `| ${cleanCell(result.name)} | ${cleanCell(result.hostname)} | ${label} | ${Number(result.durationSeconds).toFixed(3)} | [Product](${result.url}) |`;
});

const failures = report.results.filter(({ status }) => status !== "pass");
const failureRows = failures.length
  ? failures.map((result) =>
      `| ${cleanCell(result.name)} | ${result.status.toUpperCase()} | ${cleanCell(result.error)} |`
    )
  : ["| — | — | All live checks passed. |"];

const contents = `# Live scraper timing report

Generated: ${report.generatedAt}

Registered/tested domains: ${report.totalTested}/${report.totalRegisteredDomains}. ${summary}.

| Store | Registered domain | Result | Seconds | Tested URL |
| --- | --- | ---: | ---: | --- |
${rows.join("\n")}

## Failures

| Store | Classification | Diagnostic |
| --- | --- | --- |
${failureRows.join("\n")}
`;

writeFileSync(outputPath, contents);
console.log(`Wrote ${report.results.length} timing rows to ${outputPath}`);
