import { NextRequest, NextResponse } from 'next/server';
import { withArmorIQ } from '@/lib/armoriq';
import { db } from '@/lib/mongodb';
import { generateEmbedding } from '@/lib/embedding';

// ---- Types ----
type BaselineRequest = {
  userId: string;
  handle: string;
  platform: string;
  texts: string[];
};

type Metrics = {
  avgSentenceLength: number;
  emojiFrequency: number;
  punctuationDensity: number;
  vocabularyRichness: number;
  toneScore: number;
};

// Assume analyzeTexts is defined elsewhere
declare function analyzeTexts(texts: string[]): Promise<Metrics>;

// ---- Handler ----
export const POST = withArmorIQ(
  async (req: NextRequest): Promise<NextResponse> => {
    try {
      const body: BaselineRequest = await req.json();
      const { userId, handle, platform, texts } = body;

      if (!userId || !texts?.length) {
        return NextResponse.json(
          { error: 'Invalid input' },
          { status: 400 }
        );
      }

      // Stylometric analysis
      const metrics = await analyzeTexts(texts);

      // Embedding generation
      const embedding: number[] = await generateEmbedding(texts.join(' '));

      const doc = {
        userId,
        handle,
        platform,
        metrics,
        embedding,
        sampleCount: texts.length,
        createdAt: new Date(),
      };

      await db.collection('dna_profiles').replaceOne(
        { userId },
        doc,
        { upsert: true }
      );

      return NextResponse.json({ success: true, metrics });
    } catch (error) {
      return NextResponse.json(
        { error: 'Internal Server Error', details: String(error) },
        { status: 500 }
      );
    }
  },
  'baseline:create'
);