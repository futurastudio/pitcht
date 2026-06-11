import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "dist/**",
    "next-env.d.ts",
    // Non-Next-app code: the next/core-web-vitals + typescript rules target the
    // app source. Electron (CommonJS main/preload), build output, Node utility
    // scripts, desktop release artifacts, and the dormant Python service are
    // not part of the web bundle and legitimately use require() / different
    // conventions, so linting them with the app config only produces noise.
    "electron/**",
    "electron-dist/**",
    "release/**",
    "scripts/**",
    "python-services/**",
  ]),
]);

export default eslintConfig;
