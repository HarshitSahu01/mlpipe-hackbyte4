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
  punctuationStyle: number;
  emojiFrequency: number;
  vocabUniqueness: number;
  formalityScore: number;
  humanVariance: number;
  contractionRate: number;
  typoRate: number;
};

async function analyzeTexts(texts: string[]): Promise<Metrics> {
  const allSentences: string[] = [];
  for (const text of texts) {
    const sentences = text.trim().split(/(?<=[.!?])\s+/);
    allSentences.push(...sentences.filter(s => s));
  }

  const lengths = allSentences.map(s => s.split(/\s+/).length);
  const avgSentenceLength = lengths.reduce((sum, len) => sum + len, 0) / Math.max(lengths.length, 1);

  let punctChars = 0;
  let totalChars = 0;
  for (const text of texts) {
    totalChars += text.length;
    for (const char of text) {
      if ('!?...—–'.includes(char)) punctChars++;
    }
  }
  const punctStyle = Math.min(punctChars / Math.max(totalChars * 0.01, 1), 1.0);

  let emojiCount = 0;
  for (const text of texts) {
    const matches = text.match(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu);
    if (matches) emojiCount += matches.length;
  }
  const emojiFrequency = emojiCount / Math.max(allSentences.length, 1);

  const joinedText = texts.join(' ').toLowerCase();
  const allWords = joinedText.match(/\b\w+\b/g) || [];
  const uniqueWords = new Set(allWords);
  const vocabUniqueness = uniqueWords.size / Math.max(allWords.length, 1);

  const informalMarkers = new Set(['lol','lmao','omg','tbh','ngl','imo','smh','brb']);
  const formalMarkers = new Set(['therefore','furthermore','however','moreover','thus']);
  
  let informalHits = 0;
  let formalHits = 0;
  for (const w of allWords) {
    if (informalMarkers.has(w)) informalHits++;
    if (formalMarkers.has(w)) formalHits++;
  }
  let formality = (formalHits - informalHits) / Math.max(allWords.length * 0.001, 1);
  formality = Math.max(0, Math.min(1, (formality + 1) / 2));

  let varianceSum = 0;
  for (const l of lengths) {
    varianceSum += Math.pow(l - avgSentenceLength, 2);
  }
  const variance = Math.sqrt(varianceSum / Math.max(lengths.length, 1));
  const humanVariance = Math.min(variance / 10, 1.0);

  let contractions = 0;
  for (const s of allSentences) {
    const matches = s.match(/\b\w+'[a-z]{1,3}\b/gi);
    if (matches) contractions += matches.length;
  }
  const contractionRate = contractions / Math.max(allSentences.length, 1);

  const typoRate = 0.05;

  return {
    avgSentenceLength: Number(avgSentenceLength.toFixed(2)),
    punctuationStyle: Number(Math.min(punctStyle, 1.0).toFixed(3)),
    emojiFrequency: Number(Math.min(emojiFrequency, 0.3).toFixed(3)),
    vocabUniqueness: Number(Math.min(vocabUniqueness, 1.0).toFixed(3)),
    formalityScore: Number(formality.toFixed(3)),
    humanVariance: Number(humanVariance.toFixed(3)),
    contractionRate: Number(Math.min(contractionRate, 1.0).toFixed(3)),
    typoRate: Number(typoRate.toFixed(3)),
  };
}


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