import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { withArmorIQ } from '@/lib/armoriq';
import { db } from '@/lib/mongodb';

// ---- Types (MATCH PYTHON EXACTLY) ----
type Metrics = {
  avgSentenceLength: number;
  punctuationStyle: number;
  emojiFrequency: number;
  vocabUniqueness: number;
  formalityScore: number;
  humanVariance: number;
  contractionRate: number;
  typoRate: number;
};

type CompareRequest = {
  baselineId: string;
  suspectId: string;
};

type DNAProfile = {
  _id: ObjectId;
  embedding: number[];
  metrics: Metrics;
};

type Suspect = {
  _id: ObjectId;
  embedding: number[];
  metrics: Metrics;
};

// ---- Cosine Similarity (from Python) ----
function computeCosine(a: number[], b: number[]): number {
  const dot = a.reduce((sum, val, i) => sum + val * (b[i] || 0), 0);

  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));

  return dot / Math.max(magA * magB, 1e-10);
}

// ---- Risk Score (ported from Python) ----
function computeRiskScore(
  baseline: Metrics,
  suspect: Metrics,
  cosineSim: number
) {
  const embeddingRisk = cosineSim * 50;

  const deltas: number[] = [];

  for (const key in baseline) {
    const b = baseline[key as keyof Metrics];
    const s = suspect[key as keyof Metrics];

    if (typeof b === 'number' && typeof s === 'number') {
      const maxVal = Math.max(Math.abs(b), Math.abs(s), 0.001);
      deltas.push(Math.abs(b - s) / maxVal);
    }
  }

  const avgDelta =
    deltas.reduce((sum, d) => sum + d, 0) / Math.max(deltas.length, 1);

  const styleRisk = (1 - avgDelta) * 30;

  // AI signals
  let aiSignals = 0;
  if (suspect.humanVariance < 0.3) aiSignals++;
  if (suspect.formalityScore > 0.75) aiSignals++;
  if (suspect.contractionRate < 0.1) aiSignals++;
  if (suspect.typoRate < 0.005) aiSignals++;

  const aiRisk = (aiSignals / 4) * 20;

  const total = embeddingRisk + styleRisk + aiRisk;

  let status: 'VERIFIED' | 'SUSPICIOUS' | 'IMPOSTER';

  if (total >= 75) status = 'IMPOSTER';
  else if (total >= 45) status = 'SUSPICIOUS';
  else status = 'VERIFIED';

  return {
    riskScore: Math.round(Math.min(total, 100)),
    status,
    breakdown: {
      embeddingRisk: Math.round(embeddingRisk * 10) / 10,
      stylometricRisk: Math.round(styleRisk * 10) / 10,
      aiPatternRisk: Math.round(aiRisk * 10) / 10,
    },
    cosineSimilarity: Number(cosineSim.toFixed(4)),
    confidence: Math.round(Math.min(total * 1.1, 99)),
  };
}

// ---- Simple anomaly detector ----
function detectAnomalies(
  baseline: Metrics,
  suspect: Metrics,
  cosineSim: number
): string[] {
  const anomalies: string[] = [];

  if (cosineSim > 0.9) anomalies.push('High embedding similarity');

  if (suspect.formalityScore > 0.8 && baseline.formalityScore < 0.5) {
    anomalies.push('Sudden increase in formality');
  }

  if (suspect.humanVariance < 0.2) {
    anomalies.push('Low variance (AI-like consistency)');
  }

  if (suspect.contractionRate < 0.05) {
    anomalies.push('No contractions (AI signal)');
  }

  return anomalies;
}

// ---- Handler ----
/**
 * @swagger
 * /api/compare:
 *   post:
 *     summary: Compare a suspect profile against a baseline
 *     description: Computes risk score, cosine similarity, and detects anomalies between a baseline and a suspect.
 *     tags: [Compare]
 *     security:
 *       - userIdHeader: []
 *         userRoleHeader: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - baselineId
 *               - suspectId
 *             properties:
 *               baselineId:
 *                 type: string
 *                 description: The MongoDB ObjectId of the baseline DNA profile.
 *               suspectId:
 *                 type: string
 *                 description: The MongoDB ObjectId of the suspect profile.
 *     responses:
 *       200:
 *         description: Successfully compared profiles
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 riskScore:
 *                   type: number
 *                   description: Computed risk score between 0 and 100.
 *                 status:
 *                   type: string
 *                   enum: [VERIFIED, SUSPICIOUS, IMPOSTER]
 *                 breakdown:
 *                   type: object
 *                   properties:
 *                     embeddingRisk:
 *                       type: number
 *                     stylometricRisk:
 *                       type: number
 *                     aiPatternRisk:
 *                       type: number
 *                 cosineSimilarity:
 *                   type: number
 *                   description: Computed cosine similarity for embeddings.
 *                 confidence:
 *                   type: number
 *                   description: Confidence score of the assessment.
 *                 anomalies:
 *                   type: array
 *                   description: List of detected anomalies in the writing style.
 *                   items:
 *                     type: string
 *       404:
 *         description: Baseline or Suspect profile not found
 *       500:
 *         description: Internal Server Error
 */
export const POST = withArmorIQ(
  async (req: NextRequest): Promise<NextResponse> => {
    try {
      const body: CompareRequest = await req.json();
      const { baselineId, suspectId } = body;

      const baseline = await db
        .collection<DNAProfile>('dna_profiles')
        .findOne({ _id: new ObjectId(baselineId) });

      const suspect = await db
        .collection<Suspect>('suspects')
        .findOne({ _id: new ObjectId(suspectId) });

      if (!baseline || !suspect) {
        return NextResponse.json(
          { error: 'Not found' },
          { status: 404 }
        );
      }

      const cosineSim = computeCosine(
        baseline.embedding,
        suspect.embedding
      );

      const result = computeRiskScore(
        baseline.metrics,
        suspect.metrics,
        cosineSim
      );

      const anomalies = detectAnomalies(
        baseline.metrics,
        suspect.metrics,
        cosineSim
      );

      await db.collection('suspects').updateOne(
        { _id: new ObjectId(suspectId) },
        {
          $set: {
            riskScore: result.riskScore,
            status: result.status,
            anomalies,
            analyzedAt: new Date(),
          },
        }
      );

      return NextResponse.json({
        ...result,
        anomalies,
      });
    } catch (error) {
      return NextResponse.json(
        { error: 'Internal Server Error', details: String(error) },
        { status: 500 }
      );
    }
  },
  'compare:run'
);