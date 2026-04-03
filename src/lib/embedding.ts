// lib/embedding.ts
// Uses Gemini via REST API for tone analysis + mock 8-dim embedding for MVP

interface QuickFeatures {
  avgWordLen: number;
  sentCount: number;
  emojiDensity: number;
  uniqueRatio: number;
  formalityProxy: number;
  punctDensity: number;
  contractionDensity: number;
  capitalRatio: number;
}

function extractQuickFeatures(text: string): QuickFeatures {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const wordCount = words.length || 1;
  
  const avgWordLen = words.reduce((sum, w) => sum + w.length, 0) / wordCount;
  const sentCount = sentences.length;
  
  // match complex emojis robustly
  const emojis = text.match(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu);
  const emojiDensity = (emojis?.length || 0) / wordCount;
  
  const uniqueWords = new Set(words.map(w => w.toLowerCase()));
  const uniqueRatio = uniqueWords.size / wordCount;
  
  const formalWords = ["therefore", "however", "furthermore", "thus", "consequently"];
  const formalityProxy = words.filter(w => formalWords.includes(w.toLowerCase())).length / wordCount;
  
  const puncts = text.match(/[.,;:'"!?]/g);
  const punctDensity = (puncts?.length || 0) / wordCount;
  
  const contractions = text.match(/\b\w+'\w+\b/g);
  const contractionDensity = (contractions?.length || 0) / wordCount;
  
  const capitals = text.match(/[A-Z]/g);
  const capitalRatio = text.length > 0 ? (capitals?.length || 0) / text.length : 0;

  return {
    avgWordLen,
    sentCount,
    emojiDensity,
    uniqueRatio,
    formalityProxy,
    punctDensity,
    contractionDensity,
    capitalRatio,
  };
}

export async function generateEmbedding(text: string): Promise<number[]> {
  // Production: call OpenAI text-embedding-3-small for 1536-dim vectors
  // MVP: derive pseudo-embedding from stylometric features

  const features = extractQuickFeatures(text);
  // Normalize to [0,1] range — 8 dimensions
  return [
    features.avgWordLen / 10,
    features.sentCount / 50,
    features.emojiDensity,
    features.uniqueRatio,
    features.formalityProxy,
    features.punctDensity,
    features.contractionDensity,
    features.capitalRatio,
  ];
}

export async function analyzeToneWithGemini(text: string): Promise<{
  tone: string; confidence: number; markers: string[]
}> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ 
          text: `Analyze this text's tone and writing style. Return JSON only with the following structure:
{"tone": "formal|informal|technical|casual", "confidence": 0.0-1.0, "markers": ["array of strings indicating tone markers"]}`
        }]
      },
      contents: [{
        role: 'user',
        parts: [{ text: `Text: """${text.slice(0, 500)}"""` }]
      }],
      generationConfig: {
        responseMimeType: "application/json",
      }
    })
  });
  
  if (!res.ok) {
    throw new Error(`Gemini API error: ${res.statusText}`);
  }
  
  const data = await res.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!content) {
    throw new Error('Failed to parse response from Gemini');
  }
  
  return JSON.parse(content);
}