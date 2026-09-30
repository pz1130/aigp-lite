// ESLint 9 flat config for AIGP-Lite
// Uses typescript-eslint (recommended for ESLint 9 + TypeScript)
import tseslint from "typescript-eslint";

export default [
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/exhaustive-deps": "off",
      "@next/next/no-img-element": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // Ignore test files, config, and build output
    ignores: [
      "node_modules/**",
      ".next/**",
      "dist/**",
      "tests/**",
      "*.config.*",
      "prisma/**",
      "src/generated/**",
    ],
  },
];
