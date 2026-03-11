import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(process.cwd());

const expectations = [
  {
    file: ".github/workflows/ci.yml",
    requiredSnippets: [
      "quality-gate",
      "smoke-gate",
      "pnpm run format:check",
      "pnpm run typecheck",
      "pnpm run design-system:check",
    ],
  },
  {
    file: ".github/workflows/security.yml",
    requiredSnippets: [
      "trivy",
      "dependency-scan",
      "pnpm audit --audit-level high",
    ],
  },
  {
    file: ".github/workflows/release.yml",
    requiredSnippets: [
      "release-validation",
      "pnpm run migration:check",
      "pnpm run design-system:check",
      "docker build",
    ],
  },
];

for (const expectation of expectations) {
  const filePath = join(repoRoot, expectation.file);
  if (!existsSync(filePath)) {
    throw new Error(`Missing workflow file: ${expectation.file}`);
  }

  const contents = readFileSync(filePath, "utf8");
  for (const snippet of expectation.requiredSnippets) {
    if (!contents.includes(snippet)) {
      throw new Error(
        `Workflow ${expectation.file} is missing required snippet: ${snippet}`,
      );
    }
  }
}

console.log("Workflow self-test passed.");
