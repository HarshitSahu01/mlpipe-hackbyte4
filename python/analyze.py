# python/analyze.py
import re, math
from collections import Counter
import json
import argparse

def extract_features(texts: list[str]) -> dict:
    """
    Extract stylometric fingerprint from a list of text samples.
    Returns normalized features that form the 'Digital DNA'.
    """
    all_sentences = []
    for text in texts:
        # Split on .!? but preserve emoji context
        sentences = re.split(r'(?<=[.!?])\s+', text.strip())
        all_sentences.extend([s for s in sentences if s])

    # 1. Sentence length distribution
    lengths = [len(s.split()) for s in all_sentences]
    avg_sent_len = sum(lengths) / max(len(lengths), 1)

    # 2. Punctuation style score (ratio of non-standard punctuation)
    punct_chars = sum(1 for t in texts for c in t if c in '!?...—–')
    total_chars = sum(len(t) for t in texts)
    punct_style = min(punct_chars / max(total_chars * 0.01, 1), 1.0)

    # 3. Emoji frequency
    emoji_pattern = re.compile(
        "[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF"
        "\U0001F680-\U0001F6FF\U0001F1E0-\U0001F1FF]+",
        flags=re.UNICODE
    )
    emoji_count = sum(len(emoji_pattern.findall(t)) for t in texts)
    emoji_freq = emoji_count / max(len(all_sentences), 1)

    # 4. Vocabulary uniqueness (Type-Token Ratio)
    all_words = re.findall(r'\b\w+\b', ' '.join(texts).lower())
    ttr = len(set(all_words)) / max(len(all_words), 1)

    # 5. Formality score (function word ratio)
    informal_markers = {'lol','lmao','omg','tbh','ngl','imo','smh','brb'}
    formal_markers = {'therefore','furthermore','however','moreover','thus'}
    informal_hits = sum(1 for w in all_words if w in informal_markers)
    formal_hits = sum(1 for w in all_words if w in formal_markers)
    formality = (formal_hits - informal_hits) / max(len(all_words) * 0.001, 1)
    formality = max(0, min(1, (formality + 1) / 2))  # normalize to 0–1

    # 6. Human variance (standard deviation of sentence length)
    mean_len = avg_sent_len
    variance = math.sqrt(
        sum((l - mean_len)**2 for l in lengths) / max(len(lengths), 1)
    )
    human_variance = min(variance / 10, 1.0)  # normalize

    # 7. Contraction rate
    contraction_pattern = re.compile(r"\b\w+'[a-z]{1,3}\b")
    contractions = sum(len(contraction_pattern.findall(s)) for s in all_sentences)
    contraction_rate = contractions / max(len(all_sentences), 1)

    # 8. Typo rate (rough heuristic: words not in common dictionary)
    # In production: use pyspellchecker
    typo_rate = 0.05  # placeholder

    return {
        "avgSentenceLength": round(avg_sent_len, 2),
        "punctuationStyle": round(min(punct_style, 1.0), 3),
        "emojiFrequency": round(min(emoji_freq, 0.3), 3),
        "vocabUniqueness": round(min(ttr, 1.0), 3),
        "formalityScore": round(formality, 3),
        "humanVariance": round(human_variance, 3),
        "contractionRate": round(min(contraction_rate, 1.0), 3),
        "typoRate": round(typo_rate, 3),
    }

def cosine_similarity(vec_a: list, vec_b: list) -> float:
    """Compute cosine similarity between two embedding vectors."""
    dot = sum(a*b for a,b in zip(vec_a, vec_b))
    mag_a = math.sqrt(sum(a**2 for a in vec_a))
    mag_b = math.sqrt(sum(b**2 for b in vec_b))
    return dot / max(mag_a * mag_b, 1e-10)

def compute_risk_score(
    baseline_metrics: dict,
    suspect_metrics: dict,
    cosine_sim: float
) -> dict:
    """
    Multi-factor risk scoring:
    - Cosine similarity of embeddings (50% weight)
    - Stylometric deviation (30% weight)
    - AI pattern detection (20% weight)
    Returns score 0–100 and classification.
    """
    # 1. Embedding similarity contribution
    embedding_risk = cosine_sim * 50

    # 2. Stylometric deviation (lower delta = higher risk of copying)
    deltas = []
    for key in baseline_metrics:
        if key in suspect_metrics:
            bv = baseline_metrics[key]
            sv = suspect_metrics[key]
            max_val = max(abs(bv), abs(sv), 0.001)
            deltas.append(abs(bv - sv) / max_val)
    avg_delta = sum(deltas) / max(len(deltas), 1)
    # Low delta = high similarity = high risk for this component
    style_risk = (1 - avg_delta) * 30

    # 3. AI pattern detection
    # Flags: low variance, high formality, no contractions
    ai_signals = 0
    if suspect_metrics.get('humanVariance', 1) < 0.3:
        ai_signals += 1  # unnaturally consistent
    if suspect_metrics.get('formalityScore', 0) > 0.75:
        ai_signals += 1  # overly formal
    if suspect_metrics.get('contractionRate', 1) < 0.1:
        ai_signals += 1  # no contractions
    if suspect_metrics.get('typoRate', 1) < 0.005:
        ai_signals += 1  # grammatically perfect
    ai_risk = (ai_signals / 4) * 20

    total = embedding_risk + style_risk + ai_risk

    # Classification thresholds
    if total >= 75:
        status = "IMPOSTER"
    elif total >= 45:
        status = "SUSPICIOUS"
    else:
        status = "VERIFIED"

    return {
        "riskScore": round(min(total, 100)),
        "status": status,
        "breakdown": {
            "embeddingRisk": round(embedding_risk, 1),
            "stylometricRisk": round(style_risk, 1),
            "aiPatternRisk": round(ai_risk, 1),
        },
        "cosineSimilarity": round(cosine_sim, 4),
        "confidence": round(min(total * 1.1, 99))
    }

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    args = parser.parse_args()

    with open(args.input, "r", encoding="utf-8") as f:
        data = json.load(f)

    results = []

    for item in data:
        texts = item.get("posts", [])
        metrics = extract_features(texts)

        results.append({
            "id": item.get("id"),
            "handle": item.get("handle"),
            "metrics": metrics
        })

    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()