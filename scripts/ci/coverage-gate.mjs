import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const mode = process.argv[2] ?? "all";
const repoWideMinimums = {
  lines: 80,
  statements: 80,
};

const coverageRuns = [
  {
    command: "pnpm --filter @smart-schedule/frontend run test:cov",
    summaryPath: "apps/frontend/coverage/coverage-summary.json",
    targets: [
      {
        file: "apps/frontend/src/app/auth-state.service.ts",
        minimums: { functions: 90, lines: 90, statements: 90 },
      },
      {
        file: "apps/frontend/src/app/shell/shell.component.ts",
        minimums: { functions: 90, lines: 90, statements: 90 },
      },
    ],
  },
  {
    command: "pnpm --filter @smart-schedule/api run test:cov",
    summaryPath: "apps/api/coverage/coverage-summary.json",
    targets: [
      {
        file: "apps/api/src/identity/oauth.service.ts",
        minimums: { functions: 90, lines: 90, statements: 90 },
      },
      {
        file: "apps/api/src/time/holiday-provider.service.ts",
        minimums: { functions: 90, lines: 90, statements: 90 },
      },
    ],
  },
  {
    command: "pnpm --filter @smart-schedule/worker run test:cov",
    summaryPath: "apps/worker/coverage/coverage-summary.json",
    targets: [
      {
        file: "apps/worker/src/mail/mail-delivery.service.ts",
        minimums: { functions: 90, lines: 90, statements: 90 },
      },
    ],
  },
  {
    command: "pnpm --filter @smart-schedule/config run test:cov",
    summaryPath: "packages/config/coverage/coverage-summary.json",
    targets: [
      {
        file: "packages/config/src/env.schema.ts",
        minimums: { lines: 90, statements: 90 },
      },
    ],
  },
];

function loadCoverageSummary(summaryPath) {
  return JSON.parse(readFileSync(resolve(repoRoot, summaryPath), "utf8"));
}

function collectRepoWideTotals(summary) {
  return {
    lines: {
      covered: Number(summary.total?.lines?.covered ?? 0),
      total: Number(summary.total?.lines?.total ?? 0),
    },
    statements: {
      covered: Number(summary.total?.statements?.covered ?? 0),
      total: Number(summary.total?.statements?.total ?? 0),
    },
  };
}

const failures = [];
const repoWideTotals = {
  lines: { covered: 0, total: 0 },
  statements: { covered: 0, total: 0 },
};

for (const run of coverageRuns) {
  const summaryDir = resolve(repoRoot, dirname(run.summaryPath));
  mkdirSync(summaryDir, { recursive: true });
  mkdirSync(resolve(summaryDir, ".tmp"), { recursive: true });

  console.log(`Running coverage gate command: ${run.command}`);
  execFileSync("bash", ["-lc", run.command], {
    cwd: repoRoot,
    stdio: "inherit",
  });

  const summary = loadCoverageSummary(run.summaryPath);
  const totals = collectRepoWideTotals(summary);
  repoWideTotals.lines.covered += totals.lines.covered;
  repoWideTotals.lines.total += totals.lines.total;
  repoWideTotals.statements.covered += totals.statements.covered;
  repoWideTotals.statements.total += totals.statements.total;

  if (mode === "all" || mode === "critical") {
    for (const target of run.targets) {
      const absoluteFile = resolve(repoRoot, target.file);
      const metrics = summary[absoluteFile];

      if (!metrics) {
        failures.push(`Missing coverage data for ${target.file}.`);
        continue;
      }

      for (const [metric, minimum] of Object.entries(target.minimums)) {
        const actual = Number(metrics[metric]?.pct ?? 0);
        if (actual < minimum) {
          failures.push(
            `${target.file} ${metric} coverage ${actual.toFixed(2)}% is below ${minimum}%.`,
          );
        }
      }
    }
  }
}

if (mode === "all" || mode === "repo") {
  for (const [metric, minimum] of Object.entries(repoWideMinimums)) {
    const totals = repoWideTotals[metric];
    const actual = totals.total > 0 ? (totals.covered / totals.total) * 100 : 0;

    if (actual < minimum) {
      failures.push(
        `Repo-wide ${metric} coverage ${actual.toFixed(2)}% is below ${minimum}%.`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error("Coverage gate failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

const repoWideLines =
  repoWideTotals.lines.total > 0
    ? (repoWideTotals.lines.covered / repoWideTotals.lines.total) * 100
    : 0;
const repoWideStatements =
  repoWideTotals.statements.total > 0
    ? (repoWideTotals.statements.covered / repoWideTotals.statements.total) *
      100
    : 0;

if (mode === "all" || mode === "repo") {
  console.log(
    `Repo-wide coverage passed: ${repoWideLines.toFixed(2)}% lines, ${repoWideStatements.toFixed(2)}% statements.`,
  );
}

if (mode === "all" || mode === "critical") {
  console.log("Critical coverage gate passed.");
}
