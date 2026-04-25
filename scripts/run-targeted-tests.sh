#!/usr/bin/env bash
# Usage: ./scripts/run-targeted-tests.sh docs/tests/AUTH-101-targets.txt
# Runs the tests listed in the targets file — one pattern per line.
# Each line can be a tier prefix (unit:, api:, e2e:, visual:, ux-flow:, component:)
# followed by a path or pattern, e.g.:
#   unit: tests/unit/auth/password-reset.test.ts
#   api: tests/api/auth.test.ts::"POST /auth/reset"
#   e2e: tests/e2e/auth/reset-flow.spec.ts
#   visual: tests/visual/primitives/AppButton.spec.ts
#   ux-flow: tests/ux-flow/password-reset.spec.ts
#
# Returns 0 if ALL targeted tests pass. Non-zero on any failure or missing runner.

TARGETS="$1"
[ -z "$TARGETS" ] && { echo "Usage: $0 <targets-file>"; exit 2; }
[ ! -f "$TARGETS" ] && { echo "Targets file not found: $TARGETS"; exit 2; }

declare -A UNIT API COMPONENT E2E VISUAL UX_FLOW OTHER
while IFS= read -r line || [ -n "$line" ]; do
  [ -z "$line" ] && continue
  case "$line" in \#*) continue ;; esac
  TIER="${line%%:*}"
  SPEC="${line#*: }"
  case "$TIER" in
    unit) UNIT[$SPEC]=1 ;;
    api) API[$SPEC]=1 ;;
    component) COMPONENT[$SPEC]=1 ;;
    e2e) E2E[$SPEC]=1 ;;
    visual) VISUAL[$SPEC]=1 ;;
    ux-flow) UX_FLOW[$SPEC]=1 ;;
    *) OTHER[$line]=1 ;;
  esac
done < "$TARGETS"

FAIL=0

# Unit + Component (Vitest / Jest / Mocha — detect)
if [ ${#UNIT[@]} -gt 0 ] || [ ${#COMPONENT[@]} -gt 0 ]; then
  echo "[run-targeted-tests] unit + component..."
  FILES=("${!UNIT[@]}" "${!COMPONENT[@]}")
  if [ -f "vitest.config.ts" ] || [ -f "vitest.config.js" ]; then
    npx vitest run "${FILES[@]}" || FAIL=1
  elif [ -f "jest.config.js" ] || [ -f "jest.config.ts" ]; then
    npx jest "${FILES[@]}" || FAIL=1
  else
    pnpm test -- "${FILES[@]}" || FAIL=1
  fi
fi

# API (Supertest / Testcontainers harness — typically Vitest-backed)
if [ ${#API[@]} -gt 0 ]; then
  echo "[run-targeted-tests] api..."
  FILES=("${!API[@]}")
  npx vitest run --config vitest.api.config.ts "${FILES[@]}" || FAIL=1
fi

# E2E (Playwright)
if [ ${#E2E[@]} -gt 0 ]; then
  echo "[run-targeted-tests] e2e..."
  FILES=("${!E2E[@]}")
  npx playwright test "${FILES[@]}" || FAIL=1
fi

# Visual (Playwright screenshot)
if [ ${#VISUAL[@]} -gt 0 ]; then
  echo "[run-targeted-tests] visual..."
  FILES=("${!VISUAL[@]}")
  npx playwright test --config playwright.visual.config.ts "${FILES[@]}" || FAIL=1
fi

# UX-flow (Playwright — typically a separate project configuration)
if [ ${#UX_FLOW[@]} -gt 0 ]; then
  echo "[run-targeted-tests] ux-flow..."
  FILES=("${!UX_FLOW[@]}")
  npx playwright test --config playwright.ux-flow.config.ts "${FILES[@]}" || FAIL=1
fi

# Custom / other — each line is a shell command
if [ ${#OTHER[@]} -gt 0 ]; then
  echo "[run-targeted-tests] custom..."
  for cmd in "${!OTHER[@]}"; do eval "$cmd" || FAIL=1; done
fi

if [ "$FAIL" -eq 0 ]; then
  echo "[run-targeted-tests] ALL GREEN across tiers"
  exit 0
else
  echo "[run-targeted-tests] FAILURES — see output above"
  exit 1
fi

