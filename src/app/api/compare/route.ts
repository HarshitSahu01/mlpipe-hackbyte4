import { NextRequest, NextResponse } from 'next/server';
import { withArmorIQ } from '@/lib/armoriq';
import { db } from '@/lib/mongodb';

// ---- Types ----
type CompareRequest = {
  baselineId: string;
  suspectId: string;
};

type Metrics = {
  avgSentenceLength: number;
  emojiFrequency: number;
  punctuationDensity: number;
  vocabularyRichness: number;
  toneScore: number;
};

type DNAProfile = {
  _id: string;
  embedding: number[];
  metrics: Metrics;
};

type Suspect = {
  _id: string;
  embedding: number[];
  metrics: Metrics;
};

type RiskResult = {
  riskScore: number;
  status: 'VERIFIED' | 'SUSPICIOUS' | 'IMPOSTER';
};

// ---- External Functions ----
declare function computeCosine(a: number[], b: number[]): number;

declare function computeRiskScore(
  baseline: Metrics,
  suspect: Metrics,
  similarity: number
): RiskResult;

declare function detectAnomalies(
  baseline: Metrics,
  suspect: Metrics,
  similarity: number
): string[];

// ---- Handler ----
export const POST = withArmorIQ(
  async (req: NextRequest): Promise<NextResponse> => {
    try {
      const body: CompareRequest = await req.json();
      const { baselineId, suspectId } = body;

      const baseline = await db
        .collection<DNAProfile>('dna_profiles')
        .findOne({ _id: baselineId });

      const suspect = await db
        .collection<Suspect>('suspects')
        .findOne({ _id: suspectId });

      if (!baseline || !suspect) {
        return NextResponse.json(
          { error: 'Not found' },
          { status: 404 }
        );
      }

      // Cosine similarity
      const cosineSim = computeCosine(
        baseline.embedding,
        suspect.embedding
      );

      // Risk scoring
      const result = computeRiskScore(
        baseline.metrics,
        suspect.metrics,
        cosineSim
      );

      // Anomaly detection
      const anomalies = detectAnomalies(
        baseline.metrics,
        suspect.metrics,
        cosineSim
      );

      await db.collection('suspects').updateOne(
        { _id: suspectId as any },
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