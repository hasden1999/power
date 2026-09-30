/**
 * Ampereji Master Autonomous E2E Test Runner
 * Executes all 4 Tiers, measures execution time, and prints Arabic/English report
 */

import { spawn } from 'node:child_process';
import path from 'node:path';

interface SuiteResult {
  tier: string;
  file: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

const TEST_FILES = [
  // Tier 1: Feature Coverage (F1 to F24)
  { tier: 'Tier 1', path: 'tests/e2e/tier1_features/f01_f04_platform.test.ts', name: 'F01-F04: Platform, Install Banner, Browser Protection, COOP/COEP' },
  { tier: 'Tier 1', path: 'tests/e2e/tier1_features/f05_f08_database.test.ts', name: 'F05-F08: SQLite WASM, DDL, Quota, Repositories' },
  { tier: 'Tier 1', path: 'tests/e2e/tier1_features/f09_f12_licensing.test.ts', name: 'F09-F12: License Generator, Verifier, Anti-Tamper Clock, Mutation Guard' },
  { tier: 'Tier 1', path: 'tests/e2e/tier1_features/f13_f16_backup_restore.test.ts', name: 'F13-F16: Rotating Backup, SQLite Export, Safe Restore, CSV' },
  { tier: 'Tier 1', path: 'tests/e2e/tier1_features/f17_f20_business_logic.test.ts', name: 'F17-F20: Subscribers, Billing Engine, Fuel/Expenses, Reports' },
  { tier: 'Tier 1', path: 'tests/e2e/tier1_features/f21_f24_ui_thermal_sw.test.ts', name: 'F21-F24: Vanilla UI Store, RTL System, Thermal Receipt, Zero-CDN' },

  // Tier 2: Boundary & Corner Cases
  { tier: 'Tier 2', path: 'tests/e2e/tier2_boundaries/boundary_platform.test.ts', name: 'Boundary: Platform & User-Agent Edge Cases' },
  { tier: 'Tier 2', path: 'tests/e2e/tier2_boundaries/boundary_database.test.ts', name: 'Boundary: SQL Injection, Huge Strings, Unicode' },
  { tier: 'Tier 2', path: 'tests/e2e/tier2_boundaries/boundary_licensing.test.ts', name: 'Boundary: Bit Flips, 1ms Expiry, Clock Rewind' },
  { tier: 'Tier 2', path: 'tests/e2e/tier2_boundaries/boundary_backup.test.ts', name: 'Boundary: Corrupted Headers, 15-byte File, Integrity Check' },
  { tier: 'Tier 2', path: 'tests/e2e/tier2_boundaries/boundary_financial.test.ts', name: 'Boundary: 0/Negative IQD, Fractional Amps, Overpayment' },
  { tier: 'Tier 2', path: 'tests/e2e/tier2_boundaries/boundary_thermal.test.ts', name: 'Boundary: Arabic Ligatures, Tashkeel, 58mm Overflow' },

  // Tier 3: Cross-Feature Combinations (Pairwise matrix)
  { tier: 'Tier 3', path: 'tests/e2e/tier3_pairwise/pairwise_subscribers_billing.test.ts', name: 'Pairwise: Subscribers CRUD x Billing Cycles x Cumulative Debt' },
  { tier: 'Tier 3', path: 'tests/e2e/tier3_pairwise/pairwise_trial_mutations.test.ts', name: 'Pairwise: Trial Expiry x Mutation Guard x Offline Licensing' },
  { tier: 'Tier 3', path: 'tests/e2e/tier3_pairwise/pairwise_backup_cycle.test.ts', name: 'Pairwise: 50-Mutation Trigger x 7-Snapshot Rotation x Safe Restore' },
  { tier: 'Tier 3', path: 'tests/e2e/tier3_pairwise/pairwise_thermal_export.test.ts', name: 'Pairwise: Arabic BiDi x Thermal Receipt x Excel CSV Export' },

  // Tier 4: Real-World Iraqi Generator Operations Scenarios
  { tier: 'Tier 4', path: 'tests/e2e/tier4_scenarios/scenario_jamia_lifecycle.test.ts', name: 'Scenario 1: Al-Jami\'a Neighborhood 30-Day Complete Launch' },
  { tier: 'Tier 4', path: 'tests/e2e/tier4_scenarios/scenario_trial_to_licensed.test.ts', name: 'Scenario 2: Day 31 Trial Expiry & Permanent License Activation' },
  { tier: 'Tier 4', path: 'tests/e2e/tier4_scenarios/scenario_breakdown_recovery.test.ts', name: 'Scenario 3: Generator Breakdown, OPFS Snapshot & Disaster Recovery' },
  { tier: 'Tier 4', path: 'tests/e2e/tier4_scenarios/scenario_tammuz_peak_summer.test.ts', name: 'Scenario 4: Iraqi Tammuz Peak Summer Heat & Fuel Audit' }
];

async function runTestFile(fileItem: typeof TEST_FILES[0]): Promise<SuiteResult> {
  const startTime = Date.now();
  const filePath = path.resolve(fileItem.path);

  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--test', '--experimental-strip-types', filePath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      resolve({
        tier: fileItem.tier,
        file: fileItem.name,
        exitCode: code ?? 1,
        stdout,
        stderr,
        durationMs: Date.now() - startTime
      });
    });
  });
}

async function main() {
  console.log('================================================================');
  console.log('⚡ AMPEERJI (أمبيرجي) - AUTONOMOUS MASTER E2E TEST SUITE');
  console.log('   Tiers 1-4: Feature Coverage, Boundaries, Pairwise, Scenarios');
  console.log('================================================================\n');

  const results: SuiteResult[] = [];
  let totalPassed = 0;
  let totalFailed = 0;
  const globalStart = Date.now();

  for (const item of TEST_FILES) {
    process.stdout.write(`⏳ Running [${item.tier}] ${item.name}... `);
    const res = await runTestFile(item);
    results.push(res);

    if (res.exitCode === 0) {
      console.log(`✅ PASS (${res.durationMs}ms)`);
      totalPassed++;
    } else {
      console.log(`❌ FAIL (${res.durationMs}ms)`);
      console.error(res.stderr || res.stdout);
      totalFailed++;
    }
  }

  const totalDuration = Date.now() - globalStart;

  console.log('\n================================================================');
  console.log('📊 FINAL TEST EXECUTION SUMMARY (ملخص نتائج الاختبارات)');
  console.log('================================================================');
  console.log(`Total Test Suites Executed: ${TEST_FILES.length}`);
  console.log(`Suites Passed:              ${totalPassed} ✅`);
  console.log(`Suites Failed:              ${totalFailed} ❌`);
  console.log(`Total Duration:             ${totalDuration}ms`);
  console.log('================================================================');

  if (totalFailed > 0) {
    console.error(`\n❌ TEST SUITE FAILED WITH ${totalFailed} FAILING SUITES`);
    process.exit(1);
  } else {
    console.log('\n🎉 ALL 4 TIERS PASSED PERFECTLY WITH ZERO DEFECTS!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error in test runner:', err);
  process.exit(1);
});
