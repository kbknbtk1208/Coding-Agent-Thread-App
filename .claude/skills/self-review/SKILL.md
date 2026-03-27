---
name: self-review
description: This skill provides a structured self-review process for code changes before committing. Use this skill when preparing to commit code, create a pull request, or perform quality checks on implementation work. It guides through comprehensive checks including automated validation (types, lint, build, tests), coding rule compliance, and advanced quality assessments (cohesion, performance, testability).
---

# Self-Review

## Overview

This skill enables systematic self-review of code changes following a unified quality gate process. It ensures consistent review standards across all implementation tasks by providing clear steps, commands, and checkpoints for both human developers and coding agents.

## When to Use This Skill

Use this skill:
- Before committing code changes
- Prior to creating a pull request
- When performing quality checks on completed implementation work
- Before running the pre-commit-reviewer agent (this skill provides the foundation)

## Self-Review Workflow

The self-review process consists of five main steps executed in sequence:

### 1. Understanding Changed Files

**Objective:** Identify all modified files and assess the scope of changes.

**Commands:**
```bash
git status -sb
git diff --stat
```

**For detailed inspection of specific files:**
```bash
git diff path/to/file.ts
```

**Get a clean list of changed files (used in later steps):**
```bash
git diff --name-only --diff-filter=ACM
```

**Note:** When working across multiple agent sessions, share this file list at the start to maintain synchronization.

### 2. Automated Quality Checks

Execute all automated checks and ensure they pass before proceeding:

| Check | Purpose | Command | Pass Criteria |
|-------|---------|---------|---------------|
| Type Check (全体) | Detect type errors across all dependencies | `npx tsc --noEmit` | Zero errors |
| Type Check (差分) | Quick verification of changed files only | **PowerShell:**<br>`git diff --name-only --diff-filter=ACM \| rg '\.tsx?$' \| % { npx tsc --noEmit $_ }`<br>**Bash:**<br>`git diff --name-only --diff-filter=ACM \| rg '\.tsx?$' \| xargs -I{} npx tsc --noEmit {}` | Zero errors per file |
| Lint | Automated coding standard checks | `npm run lint -- --max-warnings=0` | Zero errors and warnings |
| Build | Final build verification | `npm run build` | Success |
| Test | Unit and integration test execution | `npm run test` (or `npm run test:ut` / `npm run test:it` as needed) | Success |

**Important:** Save execution logs or summaries to include in the self-review results.

### 3. Coding Rules Compliance Check

**Process:**
1. Categorize the changed files from Step 1
2. Reference the appropriate documentation for each category
3. Verify compliance with coding standards

**File Category Reference Matrix:**

| File/Domain | Reference Documentation | Key Focus Areas |
|-------------|------------------------|-----------------|
| `app/core/**` domain logic | `documents/coding-rules/use-domain.md` / `validation-schemas.md` | Clean architecture layer placement, DTO/validator separation |
| `components/**`, `app/**/client/**` | `react.md`, `client-service.md` | Presentational/Container separation, hook naming, Zustand usage |
| `app/worker/**`, `app/infrastructure/**` | `calculation-system.md`, `database.md` | Pure functions, IO separation, query optimization |
| Currency/amounts | `currency-standards.md` | 万円 unit normalization, formatter usage |
| State management | `state-management.md`, `zustand-store.md` | Slice division, store initialization |
| API/server | `api-implementation.md` | Handler structure, error handling, DTO validation |
| Test code | `testing.md` | AAA pattern, fixture usage, naming conventions |
| TypeScript general | `typescript.md`, `design-principles.md` | No `any` type, DI/dependency direction, naming |

**Classification:** Record findings as "Compliant", "Needs Improvement", or "Requires Follow-up".

### 4. Advanced Quality Assessment

Evaluate code quality across five dimensions:

#### 4.1 Cohesion & Coupling

- Verify each modified class/function has a single responsibility using `git diff --function-context` for full context
- Confirm dependency direction follows domain layer → infrastructure layer (one-way)
- Document specific improvement plans when needed: "responsibility separation", "dependency injection", "utility extraction"

#### 4.2 Performance

- Estimate algorithmic complexity for new loops, queries, Promise.all usage with large inputs
- For API/Worker changes, measure representative cases using `console.time` or re-run existing benchmarks
- For UI changes with high rendering costs, verify re-render frequency using React DevTools Highlight Updates

#### 4.3 Test Coverage

- Check that added/modified logic is unit-testable
- Add/update tests following `testing.md` guidelines when coverage is missing
- Verify dependencies are injectable (not directly instantiated with `new`)
- Confirm test data (factories, fixtures) is centralized in `test/helpers/factories`

#### 4.4 DRY & YAGNI Principles

- Search for duplicated logic/constants/type definitions using `rg` and document consolidation plans
- Remove unnecessary extension hooks or options not required by specifications
- Follow YAGNI: implement only what is explicitly required now

#### 4.5 Specification Alignment & Breaking Changes

- Verify no unintended behavior changes beyond Issue/requirement scope through UI/CLI testing
- Document migration/compatibility considerations for data structure changes
- Explicitly note any breaking changes for PR description

**Documentation Format:** For each dimension, record at minimum: "Assessment → Evidence → Action Plan" (one line minimum).

### 5. Results Documentation

Use this template to record self-review results:

````markdown
### Self-Review Results
- [ ] All changed files identified and understood
- [ ] `npx tsc --noEmit` (全体) passed
- [ ] Per-file `tsc --noEmit` for changed files passed
- [ ] `npm run lint -- --max-warnings=0` passed
- [ ] `npm run build` passed
- [ ] `npm run test` passed (or `:ut` / `:it` as appropriate)
- [ ] Coding rules reviewed with no violations

#### Advanced Quality Assessment Summary
| Dimension | Status | Evidence / Observations | Next Actions |
|-----------|--------|-------------------------|--------------|
| Cohesion/Coupling | ✅/⚠️ | Example: `IncomeMockWithCommon.tsx` hook separation completed | Example: Split `useIncomeStore` in next PR |
| Performance | ✅/⚠️ | Example: `graphDataProcessor.ts` loop maintained at O(n) | Example: Run benchmark with large dataset separately |
| Testability | ✅/⚠️ | Example: Reused `user.ts` factory | Example: Add unit test for additional cases in next task |
| DRY/YAGNI | ✅/⚠️ | Example: Duplicate handler removed | Example: Remove unused props as planned |
| Spec/Compatibility | ✅/⚠️ | Example: API response maintains backward compatibility | Example: No breaking changes |

#### Execution Logs
- Summary of `tsc` / `lint` / `build` / `test` execution results (command start and final line minimum)
- For any issues: timestamp and fixing commit reference
````

## Agent Integration Notes

**For pre-commit-reviewer agent:**
- Load this skill documentation before execution
- Pre-collect Steps 1-5 information to reduce review time

**For parallel agent execution:**
1. Distribute copies of changed file list and checklist
2. Assign one agent to automated commands (tsc/lint/build/test)
3. Assign another agent to rule compliance and advanced assessments
4. Merge results into the documentation template

## Related Resources

- `documents/workflow/pull-request-guidelines.md` - Final checklist before PR creation
- `documents/workflow/git-workflow.md` - Branch strategy and commit granularity
- `documents/coding-rules/*` - Various standards referenced in Step 3

Maintain this skill with up-to-date procedures and checkpoints to ensure uniform self-review quality across both developers and agents.
