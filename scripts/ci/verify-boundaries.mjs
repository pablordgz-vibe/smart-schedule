import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(process.cwd());
const packagesDir = join(repoRoot, "packages");
const domainDirs = readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("domain-"))
  .map((entry) => entry.name);

const violations = [];

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!entry.name.endsWith(".ts")) {
      continue;
    }

    const fileContents = readFileSync(fullPath, "utf8");
    const currentDomain = domainDirs.find((domainDir) =>
      fullPath.includes(`/packages/${domainDir}/`),
    );

    if (!currentDomain) {
      continue;
    }

    for (const otherDomain of domainDirs) {
      if (otherDomain === currentDomain) {
        continue;
      }

      if (fileContents.includes(`@smart-schedule/${otherDomain}`)) {
        violations.push(
          `${fullPath.replace(`${repoRoot}/`, "")} imports ${otherDomain}`,
        );
      }
    }
  }
}

for (const domainDir of domainDirs) {
  walk(join(packagesDir, domainDir, "src"));
}

if (violations.length > 0) {
  console.error("Cross-domain imports detected:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log(`Boundary check passed for ${domainDirs.length} domain packages.`);
