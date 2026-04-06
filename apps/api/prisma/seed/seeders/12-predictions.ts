// =============================================================================
// Seeder 12: ML Predictions — calls the FastAPI ML service for every upcoming
//            match that doesn't yet have a MatchPrediction row, then persists
//            the result to the DB.
//
// Prerequisites:
//   - FastAPI ML service running on ML_SERVICE_URL (default: localhost:3003)
//   - seed:calendar already ran (matches with enrichStatus = SCHEDULED exist)
//   - At least 30 FULLY_ENRICHED matches in DB for the model to train on
//
// Flow:
//   1. Find all matches with statusShort IN ('NS','TBD','PST') and no prediction
//   2. For each, call POST /predict on the FastAPI service
//   3. Persist result to match_predictions table
//   4. Skip if ML service is unavailable (non-fatal — re-run later)
//
// Run: npm run seed:predictions
// =============================================================================

import * as dotenv from 'dotenv';
import * as path   from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

import { PrismaClient } from '@prisma/client';

const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? 'http://localhost:3003';
const UPCOMING_STATUSES = ['NS', 'TBD', 'PST'];

interface PredictionResponse {
  fixture_id:       number | null;
  home_team_id:     number;
  away_team_id:     number;
  model:            string;
  home_win_prob:    number;
  draw_prob:        number;
  away_win_prob:    number;
  predicted_result: string;
  confidence:       number;
  model_scores:     Record<string, number>;
}

async function callPredict(fixtureId: number): Promise<PredictionResponse | null> {
  try {
    const res = await fetch(`${ML_SERVICE_URL}/predict`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ fixture_id: fixtureId }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.warn(`    [WARN] ML service returned ${res.status}: ${text.slice(0, 200)}`);
      return null;
    }

    return await res.json() as PredictionResponse;
  } catch (err: any) {
    console.warn(`    [WARN] ML service unreachable: ${err?.message ?? err}`);
    return null;
  }
}

export async function seedPredictions(prisma: PrismaClient) {
  console.log('\nSeeding ML predictions...');
  console.log(`  ML service: ${ML_SERVICE_URL}`);

  // Check ML service health first
  try {
    const health = await fetch(`${ML_SERVICE_URL}/health`);
    if (!health.ok) throw new Error(`Health check returned ${health.status}`);
    console.log('  ML service: healthy ✓');
  } catch (err: any) {
    console.error(`  [ERROR] ML service not reachable at ${ML_SERVICE_URL}`);
    console.error(`  Start it with: cd apps/ml && .venv/bin/uvicorn main:app --port 3003`);
    console.error(`  Error: ${err?.message}`);
    return;
  }

  // Trigger training if not yet trained
  console.log('\n  Triggering model training (uses all FULLY_ENRICHED matches)...');
  try {
    const trainRes = await fetch(`${ML_SERVICE_URL}/predict/train`, { method: 'POST' });
    if (trainRes.ok) {
      const trainData = await trainRes.json() as any;
      console.log(`  Best model: ${trainData.best_model} (CV acc: ${trainData.best_cv_acc})`);
      if (trainData.models) {
        for (const m of trainData.models) {
          const tag = m.is_best ? ' ← best' : '';
          console.log(`    ${m.name.padEnd(25)} ${(m.cv_accuracy * 100).toFixed(1)}%${tag}`);
        }
      }
    } else {
      console.warn(`  [WARN] Training returned ${trainRes.status} — predictions may use stale model`);
    }
  } catch (err: any) {
    console.warn(`  [WARN] Could not trigger training: ${err?.message}`);
  }

  // Find upcoming matches without predictions
  const pending = await prisma.match.findMany({
    where: {
      statusShort: { in: UPCOMING_STATUSES },
      prediction:  { is: null },
    },
    select: {
      id:            true,
      apiFootballId: true,
      homeTeam:      { select: { name: true } },
      awayTeam:      { select: { name: true } },
      kickoffAt:     true,
    },
    orderBy: { kickoffAt: 'asc' },
  });

  if (!pending.length) {
    console.log('\n  All upcoming matches already have predictions. Nothing to do.');
    return;
  }

  console.log(`\n  Found ${pending.length} upcoming match(es) without predictions.`);

  let created  = 0;
  let failed   = 0;

  for (const match of pending) {
    const label = `${match.homeTeam.name} vs ${match.awayTeam.name} (${match.kickoffAt?.toISOString().slice(0, 10)})`;
    process.stdout.write(`  [${created + failed + 1}/${pending.length}] ${label}... `);

    const prediction = await callPredict(match.apiFootballId);

    if (!prediction) {
      console.log('[FAIL]');
      failed++;
      continue;
    }

    try {
      await prisma.matchPrediction.upsert({
        where:  { matchId: match.id },
        create: {
          matchId:         match.id,
          modelVersion:    prediction.model,
          homeWinProb:     prediction.home_win_prob,
          drawProb:        prediction.draw_prob,
          awayWinProb:     prediction.away_win_prob,
          predictedResult: prediction.predicted_result,
          confidence:      prediction.confidence,
          modelScores:     prediction.model_scores,
        },
        update: {
          modelVersion:    prediction.model,
          homeWinProb:     prediction.home_win_prob,
          drawProb:        prediction.draw_prob,
          awayWinProb:     prediction.away_win_prob,
          predictedResult: prediction.predicted_result,
          confidence:      prediction.confidence,
          modelScores:     prediction.model_scores,
        },
      });

      const pct = (p: number) => `${(p * 100).toFixed(0)}%`;
      console.log(`[${prediction.predicted_result}] H:${pct(prediction.home_win_prob)} D:${pct(prediction.draw_prob)} A:${pct(prediction.away_win_prob)}`);
      created++;
    } catch (err: any) {
      console.log(`[DB ERR] ${err?.message ?? err}`);
      failed++;
    }
  }

  console.log(`\n  Predictions seed complete.`);
  console.log(`  Created: ${created}  |  Failed: ${failed}`);
}
