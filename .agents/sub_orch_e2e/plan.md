# plan.md — E2E Testing Track Implementation Plan

## Overview
Design, implement, and verify the opaque-box requirement-driven E2E test suite for KiranaAI Bot.

## Phase 1: Exploration & Setup
- [ ] Read files and analyze project dependencies.
- [ ] Determine how to run/mock Firestore.
- [ ] Design E2E test infrastructure (runner, environment, mock WhatsApp server/client, helper functions).
- [ ] Write `TEST_INFRA.md` at project root defining the features, test architecture, and test scenarios.

## Phase 2: Implement Milestone E2E.1 (Test Infra & Tier 1)
- [ ] Setup E2E test folder (e.g., `tests/e2e/`) and test runner.
- [ ] Implement E2E test harness and helper utilities.
- [ ] Implement Tier 1 (Feature Coverage, >=5 tests per feature, >=45 cases total).
- [ ] Run and verify Tier 1 tests.
- [ ] Update SCOPE.md.

## Phase 3: Implement Milestone E2E.2 (Tier 2 Boundaries)
- [ ] Implement Tier 2 (Boundary & Corner cases, >=5 tests per feature, >=45 cases total).
- [ ] Run and verify Tier 2 tests.
- [ ] Update SCOPE.md.

## Phase 4: Implement Milestone E2E.3 (Tier 3 Combinations)
- [ ] Implement Tier 3 (Cross-feature combinations, >=9 cases total).
- [ ] Run and verify Tier 3 tests.
- [ ] Update SCOPE.md.

## Phase 5: Implement Milestone E2E.4 (Tier 4 Workloads)
- [ ] Implement Tier 4 (Real-world workloads, >=5 cases total).
- [ ] Run and verify Tier 4 tests.
- [ ] Create and publish `TEST_READY.md` at project root.
- [ ] Run the complete E2E test suite and ensure 100% success.
- [ ] Update SCOPE.md.
- [ ] Prepare handoff report.
