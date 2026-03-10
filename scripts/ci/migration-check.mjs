import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(process.cwd());
const candidateDirs = [
  join(repoRoot, "prisma", "migrations"),
  join(repoRoot, "infra", "migrations"),
  join(repoRoot, "apps", "api", "migrations"),
];

const discovered = candidateDirs.filter((dir) => existsSync(dir));

if (discovered.length === 0) {
  console.log(
    "Migration check passed: no migration directories are present in Sprint 0.",
  );
  process.exit(0);
}

let hasFiles = false;
for (const dir of discovered) {
  const entries = readdirSync(dir);
  if (entries.length > 0) {
    hasFiles = true;
    console.error(
      `Migration directory contains files and needs validation wiring: ${dir.replace(`${repoRoot}/`, "")}`,
    );
  }
}

if (hasFiles) {
  process.exit(1);
}

console.log(
  "Migration check passed: migration directories exist but are empty.",
);
