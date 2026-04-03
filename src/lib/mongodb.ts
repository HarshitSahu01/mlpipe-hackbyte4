// lib/mongodb.ts
import { MongoClient, ObjectId } from 'mongodb';

const client = new MongoClient(process.env.MONGODB_URI!);
export const db = client.db('persona_audit');

// Collections:
// db.collection('dna_profiles')  — Digital DNA baselines
// db.collection('suspects')      — Scouted profiles
// db.collection('audit_log')     — ArmorIQ decisions

// Digital DNA Document shape:
interface DNAProfile {
  _id: ObjectId;
  userId: string;
  handle: string;
  platform: string;
  createdAt: Date;
  metrics: {
    avgSentenceLength: number;   // mean words per sentence
    punctuationStyle: number;    // 0–1 normalized score
    emojiFrequency: number;      // emojis per sentence
    vocabUniqueness: number;     // TTR (type-token ratio)
    formalityScore: number;      // 0=very informal, 1=very formal
    humanVariance: number;       // std dev of style metrics
    contractionRate: number;     // fraction of sentences with contractions
    typoRate: number;            // estimated typo probability
  };
  embedding: number[];           // 1536-dim vector (OpenAI) or 8-dim mock
  sampleCount: number;
}