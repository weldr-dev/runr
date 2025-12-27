/**
 * Schema version tests for Phase 7C.
 *
 * These tests verify:
 * 1. Artifacts include schema_version field
 * 2. Schema version is the expected value
 */

import { describe, it, expect } from 'vitest';
import {
  buildWaitResult,
  buildSummaryArtifact,
  buildStopArtifact
} from '../artifacts.js';
import { createInitialOrchestratorState } from '../state-machine.js';
import { ORCHESTRATOR_ARTIFACT_SCHEMA_VERSION } from '../types.js';
import type { OrchestrationConfig } from '../types.js';

const sampleConfig: OrchestrationConfig = {
  tracks: [
    {
      name: 'Test Track',
      steps: [{ task: 'tasks/test.md' }]
    }
  ]
};

describe('Schema Versioning', () => {
  describe('Orchestration Artifacts', () => {
    it('buildWaitResult includes schema_version', () => {
      const state = createInitialOrchestratorState(sampleConfig, '/test/repo', {
        timeBudgetMinutes: 60,
        maxTicks: 25,
        collisionPolicy: 'serialize'
      });
      // Mark as complete for testing
      state.status = 'complete';
      state.ended_at = new Date().toISOString();

      const result = buildWaitResult(state, '/test/repo');

      expect(result.schema_version).toBe(ORCHESTRATOR_ARTIFACT_SCHEMA_VERSION);
      expect(result.schema_version).toBe(1);
    });

    it('buildSummaryArtifact includes schema_version', () => {
      const state = createInitialOrchestratorState(sampleConfig, '/test/repo', {
        timeBudgetMinutes: 60,
        maxTicks: 25,
        collisionPolicy: 'serialize'
      });
      state.status = 'complete';
      state.ended_at = new Date().toISOString();

      const summary = buildSummaryArtifact(state, '/test/repo');

      expect(summary.schema_version).toBe(ORCHESTRATOR_ARTIFACT_SCHEMA_VERSION);
      expect(summary.schema_version).toBe(1);
    });

    it('buildStopArtifact includes schema_version', () => {
      const state = createInitialOrchestratorState(sampleConfig, '/test/repo', {
        timeBudgetMinutes: 60,
        maxTicks: 25,
        collisionPolicy: 'serialize'
      });
      state.status = 'stopped';
      state.ended_at = new Date().toISOString();

      const stopArtifact = buildStopArtifact(state, '/test/repo');

      expect(stopArtifact.schema_version).toBe(ORCHESTRATOR_ARTIFACT_SCHEMA_VERSION);
      expect(stopArtifact.schema_version).toBe(1);
    });
  });

  describe('Schema version constant', () => {
    it('ORCHESTRATOR_ARTIFACT_SCHEMA_VERSION is 1', () => {
      expect(ORCHESTRATOR_ARTIFACT_SCHEMA_VERSION).toBe(1);
    });
  });
});
