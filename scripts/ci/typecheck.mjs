import { readdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const repoRoot = resolve(process.cwd());

const sharedBuildTargets = [
  join(repoRoot, "packages", "config"),
  join(repoRoot, "packages", "contracts"),
];

for (const cwd of sharedBuildTargets) {
  const relativeCwd = cwd.replace(`${repoRoot}/`, "");
  console.log(`Preparing ${relativeCwd} for downstream typechecks`);

  const buildResult = spawnSync("pnpm", ["run", "build"], {
    cwd,
    stdio: "inherit",
  });

  if (buildResult.status !== 0) {
    process.exit(buildResult.status ?? 1);
  }
}

const targets = [
  { cwd: join(repoRoot, "apps", "api"), project: "tsconfig.json" },
  { cwd: join(repoRoot, "apps", "worker"), project: "tsconfig.json" },
  { cwd: join(repoRoot, "apps", "scheduler"), project: "tsconfig.json" },
  { cwd: join(repoRoot, "apps", "frontend"), project: "tsconfig.app.json" },
];

for (const entry of readdirSync(join(repoRoot, "packages"), {
  withFileTypes: true,
})) {
  if (!entry.isDirectory()) {
    continue;
  }

  const cwd = join(repoRoot, "packages", entry.name);
  if (existsSync(join(cwd, "tsconfig.json"))) {
    targets.push({ cwd, project: "tsconfig.json" });
  }
}

for (const target of targets) {
  const relativeCwd = target.cwd.replace(`${repoRoot}/`, "");
  console.log(`Typechecking ${relativeCwd} (${target.project})`);

  const result = spawnSync(
    "pnpm",
    ["exec", "tsc", "--noEmit", "-p", target.project],
    {
      cwd: target.cwd,
      stdio: "inherit",
    },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
