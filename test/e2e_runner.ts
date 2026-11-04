/**
 * APEX DIRT - CENTRAL E2E TEST RUNNER
 * Executes Tiers 1-4 with categorized reporting and exit code semantics.
 * 
 * Usage:
 *   npx tsx test/e2e_runner.ts
 *   npx tsx test/e2e_runner.ts --tier=1
 *   npx tsx test/e2e_runner.ts --tier=2
 *   npx tsx test/e2e_runner.ts --tier=3
 *   npx tsx test/e2e_runner.ts --tier=4
 *   npx tsx test/e2e_runner.ts --filter=wildlife
 */

import { registry, RegisteredTest, TestResult } from './e2e_test_framework.js';

// Parse command line arguments
const args = process.argv.slice(2);
let targetTier: number | null = null;
let nameFilter: string | null = null;

for (const arg of args) {
  if (arg.startsWith('--tier=')) {
    targetTier = parseInt(arg.split('=')[1], 10);
  } else if (arg.startsWith('--filter=')) {
    nameFilter = arg.split('=')[1].toLowerCase();
  } else if (arg === '--all') {
    targetTier = null;
  }
}

// Dynamically import test suites based on targets
console.log('================================================================');
console.log('            APEX DIRT - END-TO-END VERIFICATION SUITE           ');
console.log('================================================================');

async function loadSuites() {
  if (!targetTier || targetTier === 1) {
    await import('./tier1_features.test.js').catch(async () => {
      await import('./tier1_features.test.ts');
    });
  }
  if (!targetTier || targetTier === 2) {
    await import('./tier2_boundaries.test.js').catch(async () => {
      await import('./tier2_boundaries.test.ts');
    });
  }
  if (!targetTier || targetTier === 3) {
    await import('./tier3_pairwise.test.js').catch(async () => {
      await import('./tier3_pairwise.test.ts');
    });
  }
  if (!targetTier || targetTier === 4) {
    await import('./tier4_scenarios.test.js').catch(async () => {
      await import('./tier4_scenarios.test.ts');
    });
  }
}

async function runRunner() {
  await loadSuites();

  let allTests = registry.getAllTests();
  if (targetTier !== null) {
    allTests = registry.getTestsForTier(targetTier);
  }
  if (nameFilter) {
    allTests = allTests.filter(t => 
      t.id.toLowerCase().includes(nameFilter!) ||
      t.name.toLowerCase().includes(nameFilter!) ||
      t.requirement.toLowerCase().includes(nameFilter!)
    );
  }

  console.log(`Discovered ${allTests.length} test cases matching criteria (Tier: ${targetTier ?? 'ALL'}, Filter: ${nameFilter ?? 'NONE'})`);
  console.log('----------------------------------------------------------------');

  const results: TestResult[] = [];
  let passedCount = 0;
  let failedCount = 0;
  const suiteStartTime = performance.now();

  let currentTier = -1;

  for (const test of allTests) {
    if (test.tier !== currentTier) {
      currentTier = test.tier;
      console.log(`\n--- TIER ${currentTier} EXECUTION ---`);
    }

    const tStart = performance.now();
    try {
      await test.fn();
      const durationMs = Math.round(performance.now() - tStart);
      passedCount++;
      results.push({
        id: test.id,
        tier: test.tier,
        requirement: test.requirement,
        name: test.name,
        passed: true,
        durationMs,
      });
      console.log(`  [PASS] ${test.id.padEnd(12)} | [${test.requirement.padEnd(16)}] | ${test.name} (${durationMs}ms)`);
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - tStart);
      failedCount++;
      const errorMessage = err?.message || String(err);
      results.push({
        id: test.id,
        tier: test.tier,
        requirement: test.requirement,
        name: test.name,
        passed: false,
        durationMs,
        error: errorMessage,
      });
      console.error(`  [FAIL] ${test.id.padEnd(12)} | [${test.requirement.padEnd(16)}] | ${test.name} (${durationMs}ms)`);
      console.error(`         Error: ${errorMessage}`);
    }
  }

  const totalTimeSec = ((performance.now() - suiteStartTime) / 1000).toFixed(2);

  console.log('\n================================================================');
  console.log('                     TEST EXECUTION SUMMARY                     ');
  console.log('================================================================');
  console.log(`Total Executed : ${results.length}`);
  console.log(`Passed         : ${passedCount}`);
  console.log(`Failed         : ${failedCount}`);
  console.log(`Duration       : ${totalTimeSec}s`);
  console.log('----------------------------------------------------------------');

  if (failedCount > 0) {
    console.error(`STATUS: FAILED (${failedCount} test(s) failed)`);
    process.exit(1);
  } else {
    console.log(`STATUS: SUCCESS (100% PASS - All ${passedCount} tests passed)`);
    process.exit(0);
  }
}

runRunner().catch((e) => {
  console.error('Fatal runner execution error:', e);
  process.exit(1);
});
