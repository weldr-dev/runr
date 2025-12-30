/**
 * Policy block tests for Phase 7B.
 *
 * These tests verify:
 * 1. Run creates state.policy correctly from CLI/config
 * 2. Resume without overrides keeps policy unchanged (via getEffectivePolicy)
 * 3. Legacy states (without policy block) are handled correctly
 */

import { describe, it, expect } from 'vitest';
import {
  createInitialOrchestratorState,
  getEffectivePolicy
} from '../state-machine.js';
import type { OrchestratorState, OrchestratorPolicy, OrchestrationConfig } from '../types.js';

// Sample config for testing
const sampleConfig: OrchestrationConfig = {
  tracks: [
    {
      name: 'Track A',
      steps: [{ task: 'tasks/a.md' }]
    },
    {
      name: 'Track B',
      steps: [{ task: 'tasks/b.md' }]
    }
  ]
};

describe('Policy Block', () => {
  describe('createInitialOrchestratorState', () => {
    it('creates state.policy correctly from CLI options', () => {
      const state = createInitialOrchestratorState(sampleConfig, '/test/repo', {
        timeBudgetMinutes: 60,
        maxTicks: 25,
        collisionPolicy: 'serialize',
        fast: true,
        autoResume: true,
        parallel: 1,
        ownershipRequired: true
      });

      // Policy block should exist
      expect(state.policy).toBeDefined();

      // Policy values should match options
      expect(state.policy!.time_budget_minutes).toBe(60);
      expect(state.policy!.max_ticks).toBe(25);
      expect(state.policy!.collision_policy).toBe('serialize');
      expect(state.policy!.fast).toBe(true);
      expect(state.policy!.auto_resume).toBe(true);
      expect(state.policy!.parallel).toBe(1);
      expect(state.policy!.ownership_required).toBe(true);
    });

    it('sets default values for optional policy fields', () => {
      const state = createInitialOrchestratorState(sampleConfig, '/test/repo', {
        timeBudgetMinutes: 120,
        maxTicks: 50,
        collisionPolicy: 'force'
        // fast, autoResume, parallel not provided
      });

      expect(state.policy).toBeDefined();
      expect(state.policy!.fast).toBe(false);
      expect(state.policy!.auto_resume).toBe(false);
      expect(state.policy!.parallel).toBe(2); // Default: track count
      expect(state.policy!.ownership_required).toBe(false);
    });

    it('writes both policy block and legacy fields for backward compatibility', () => {
      const state = createInitialOrchestratorState(sampleConfig, '/test/repo', {
        timeBudgetMinutes: 90,
        maxTicks: 30,
        collisionPolicy: 'fail',
        fast: true
      });

      // Policy block
      expect(state.policy!.time_budget_minutes).toBe(90);
      expect(state.policy!.max_ticks).toBe(30);
      expect(state.policy!.collision_policy).toBe('fail');
      expect(state.policy!.fast).toBe(true);

      // Legacy fields (should match)
      expect(state.time_budget_minutes).toBe(90);
      expect(state.max_ticks).toBe(30);
      expect(state.collision_policy).toBe('fail');
      expect(state.fast).toBe(true);
    });
  });

  describe('getEffectivePolicy', () => {
    it('returns policy block when present', () => {
      const state = createInitialOrchestratorState(sampleConfig, '/test/repo', {
        timeBudgetMinutes: 45,
        maxTicks: 15,
        collisionPolicy: 'serialize',
        fast: true,
        autoResume: true
      });

      const policy = getEffectivePolicy(state);

      expect(policy.time_budget_minutes).toBe(45);
      expect(policy.max_ticks).toBe(15);
      expect(policy.collision_policy).toBe('serialize');
      expect(policy.fast).toBe(true);
      expect(policy.auto_resume).toBe(true);
    });

    it('falls back to legacy fields when policy block is missing (v0 state)', () => {
      // Simulate a legacy v0 state without policy block
      const legacyState: OrchestratorState = {
        orchestrator_id: 'orch20240101120000',
        repo_path: '/test/repo',
        tracks: [
          {
            id: 'track-1',
            name: 'Track A',
            steps: [{ task_path: 'tasks/a.md' }],
            current_step: 0,
            status: 'pending'
          }
        ],
        active_runs: {},
        file_claims: {},
        status: 'running',
        started_at: '2024-01-01T12:00:00Z',
        // No policy block - legacy v0 state
        collision_policy: 'force',
        time_budget_minutes: 180,
        max_ticks: 100,
        fast: true
      };

      const policy = getEffectivePolicy(legacyState);

      // Should extract from legacy fields
      expect(policy.time_budget_minutes).toBe(180);
      expect(policy.max_ticks).toBe(100);
      expect(policy.collision_policy).toBe('force');
      expect(policy.fast).toBe(true);
      // Defaults for fields not in v0
      expect(policy.auto_resume).toBe(false);
      expect(policy.parallel).toBe(1); // track count
    });

    it('handles legacy state with fast=undefined', () => {
      const legacyState: OrchestratorState = {
        orchestrator_id: 'orch20240101120000',
        repo_path: '/test/repo',
        tracks: [],
        active_runs: {},
        file_claims: {},
        status: 'running',
        started_at: '2024-01-01T12:00:00Z',
        collision_policy: 'serialize',
        time_budget_minutes: 60,
        max_ticks: 25
        // fast is undefined (missing in v0)
      };

      const policy = getEffectivePolicy(legacyState);

      expect(policy.fast).toBe(false); // Default when undefined
    });
  });

  describe('Resume policy immutability', () => {
    it('resume without overrides keeps policy unchanged', () => {
      // Create initial state
      const state = createInitialOrchestratorState(sampleConfig, '/test/repo', {
        timeBudgetMinutes: 60,
        maxTicks: 25,
        collisionPolicy: 'serialize',
        fast: true
      });

      // Simulate "resuming" by getting effective policy
      const policyBeforeResume = getEffectivePolicy(state);
      const policyAfterResume = getEffectivePolicy(state);

      // Policy should be identical
      expect(policyAfterResume).toEqual(policyBeforeResume);
    });

    it('policy values remain stable across multiple reads', () => {
      const state = createInitialOrchestratorState(sampleConfig, '/test/repo', {
        timeBudgetMinutes: 42,
        maxTicks: 17,
        collisionPolicy: 'force',
        fast: false,
        autoResume: true
      });

      // Read policy multiple times
      const policy1 = getEffectivePolicy(state);
      const policy2 = getEffectivePolicy(state);
      const policy3 = getEffectivePolicy(state);

      // All reads should return identical values
      expect(policy1).toEqual(policy2);
      expect(policy2).toEqual(policy3);

      // And match original options
      expect(policy1.time_budget_minutes).toBe(42);
      expect(policy1.max_ticks).toBe(17);
      expect(policy1.collision_policy).toBe('force');
      expect(policy1.fast).toBe(false);
      expect(policy1.auto_resume).toBe(true);
    });
  });
});
