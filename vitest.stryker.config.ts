import { configDefaults, defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config.ts";

// Used only by Stryker (stryker.config.json, vitest.configFile). It leaves out the wall-clock SPEC-014-R6 test, which
// times the serializer and cannot pass reliably under Stryker's instrumentation and parallel runners. The test gate
// still runs it through vitest.config.ts (SPEC-001-R15, SPEC-001-R16).
export default mergeConfig(base, defineConfig({
  test: { exclude: [...configDefaults.exclude, "test/export.performance.test.ts"] },
}));
