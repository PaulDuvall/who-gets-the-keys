import vitest from "@vitest/eslint-plugin";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/", "build/", "dist/", "reports/", ".stryker-tmp/", "video/record/"] },
  ...tseslint.configs.recommended,
  {
    files: ["test/**/*.ts"],
    plugins: { vitest },
    rules: { ...vitest.configs.recommended.rules, "vitest/expect-expect": "error" },
  },
);
