# Scope: E2E Testing Track

## Architecture
- The E2E test suite must be opaque-box and requirement-driven.
- It must run independently of the implementation internals.
- Verification mechanism: HTTP requests to the webhook endpoints and checking Firestore state (or mock responses/database states as appropriate).
- Output: Creates E2E test cases in a standard runner (e.g. using a script, Jest, or tsx runner) and publishes `TEST_READY.md` at project root.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E.1 | Test Infra & Tier 1 | Setup test harness, runner, and Tier 1 (Feature Coverage, >=5 tests per feature) | None | PLANNED |
| E2E.2 | Tier 2 Boundaries | Implement Tier 2 (Boundary & Corner cases, >=5 tests per feature) | E2E.1 | PLANNED |
| E2E.3 | Tier 3 Combinations | Implement Tier 3 (Cross-feature combinations) | E2E.2 | PLANNED |
| E2E.4 | Tier 4 Workloads | Implement Tier 4 (Real-world workloads) and publish `TEST_READY.md` | E2E.3 | PLANNED |
