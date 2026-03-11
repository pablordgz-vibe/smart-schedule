import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(process.cwd());

const requiredFiles = [
  "apps/frontend/tailwind.config.js",
  "apps/frontend/src/tailwind.css",
  "packages/ui/src/styles/tokens.css",
  "packages/ui/src/styles/primitives.css",
];

for (const relativePath of requiredFiles) {
  if (!existsSync(join(repoRoot, relativePath))) {
    throw new Error(`Missing required design-system file: ${relativePath}`);
  }
}

const globalStyles = readFileSync(
  join(repoRoot, "apps/frontend/src/styles.css"),
  "utf8",
);
if (!globalStyles.includes("@import './tailwind.css';")) {
  throw new Error(
    "Global frontend styles must import the Tailwind foundation stylesheet.",
  );
}

const tokens = readFileSync(
  join(repoRoot, "packages/ui/src/styles/tokens.css"),
  "utf8",
);
for (const tokenName of [
  "--state-warning-bg",
  "--state-approval-bg",
  "--state-denied-bg",
  "--state-entitlement-bg",
  "--state-info-bg",
]) {
  if (!tokens.includes(tokenName)) {
    throw new Error(`Missing shared semantic state token: ${tokenName}`);
  }
}

const primitives = readFileSync(
  join(repoRoot, "packages/ui/src/styles/primitives.css"),
  "utf8",
);
for (const requiredPrimitive of [
  ".ui-input",
  ".ui-banner",
  ".ui-banner-warning",
  ".ui-banner-approval",
  ".ui-banner-denied",
  ".ui-banner-entitlement",
]) {
  if (!primitives.includes(requiredPrimitive)) {
    throw new Error(
      `Missing shared primitive required by the sprint shell: ${requiredPrimitive}`,
    );
  }
}

const authState = readFileSync(
  join(repoRoot, "apps/frontend/src/app/auth-state.service.ts"),
  "utf8",
);
const setupState = readFileSync(
  join(repoRoot, "apps/frontend/src/app/setup/setup-state.service.ts"),
  "utf8",
);

for (const forbiddenFallback of [
  "standaloneSessionFallback",
  "standaloneSetupFallback",
]) {
  if (
    authState.includes(forbiddenFallback) ||
    setupState.includes(forbiddenFallback)
  ) {
    throw new Error(
      `Frontend runtime must not ship scaffold fallback state: ${forbiddenFallback}`,
    );
  }
}

console.log("Design-system check passed.");
