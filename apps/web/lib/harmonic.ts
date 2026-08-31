/**
 * Camelot Wheel harmonic compatibility.
 *
 * Compatible transitions:
 * - Same key (8A → 8A)
 * - ±1 hour (8A → 7A, 9A)
 * - Relative major/minor (8A ↔ 8B)
 * - Energy boost: +1 hour clockwise (8A → 9A)
 */

export type CompatibilityLevel = "perfect" | "good" | "okay" | "clash";

export interface CompatibilityResult {
  level: CompatibilityLevel;
  label: string;
  color: string;
  description: string;
}

function parseCamelot(
  camelot: string,
): { hour: number; letter: string } | null {
  const match = camelot.match(/^(\d{1,2})([AB])$/i);
  if (!match) return null;
  return { hour: parseInt(match[1], 10), letter: match[2].toUpperCase() };
}

export function getHarmonicCompatibility(
  camelotA: string,
  camelotB: string,
): CompatibilityResult {
  const a = parseCamelot(camelotA);
  const b = parseCamelot(camelotB);

  if (!a || !b) {
    return {
      level: "okay",
      label: "?",
      color: "text-gray-400",
      description: "Unknown key",
    };
  }

  // Same key
  if (a.hour === b.hour && a.letter === b.letter) {
    return {
      level: "perfect",
      label: "✓ Perfect",
      color: "text-green-500",
      description: "Same key",
    };
  }

  // Relative major/minor (same hour, different letter)
  if (a.hour === b.hour && a.letter !== b.letter) {
    return {
      level: "perfect",
      label: "✓ Relative",
      color: "text-green-500",
      description: "Relative major/minor",
    };
  }

  // Calculate hour distance (wrap around 12)
  const hourDiff = Math.min(
    Math.abs(a.hour - b.hour),
    12 - Math.abs(a.hour - b.hour),
  );

  // ±1 hour, same letter
  if (hourDiff === 1 && a.letter === b.letter) {
    const direction = (b.hour - a.hour + 12) % 12 <= 6 ? "up" : "down";
    return {
      level: "good",
      label: direction === "up" ? "↑ Energy" : "↓ Calm",
      color: "text-blue-500",
      description:
        direction === "up" ? "+1 hour (energy boost)" : "-1 hour (calm down)",
    };
  }

  // ±1 hour, different letter (diagonal move)
  if (hourDiff === 1 && a.letter !== b.letter) {
    return {
      level: "good",
      label: "~ Good",
      color: "text-blue-400",
      description: "Adjacent key change",
    };
  }

  // ±2 hours, same letter
  if (hourDiff === 2 && a.letter === b.letter) {
    return {
      level: "okay",
      label: "○ Okay",
      color: "text-yellow-500",
      description: "Two steps away",
    };
  }

  // Everything else
  return {
    level: "clash",
    label: "✗ Clash",
    color: "text-red-500",
    description: "Harmonically distant",
  };
}

/**
 * Score a sequence of tracks for overall harmonic flow.
 * Higher = better harmonic progression.
 */
export function scoreHarmonicFlow(camelots: string[]): number {
  if (camelots.length < 2) return 100;

  let totalScore = 0;
  let pairs = 0;

  for (let i = 0; i < camelots.length - 1; i++) {
    const compat = getHarmonicCompatibility(camelots[i], camelots[i + 1]);
    switch (compat.level) {
      case "perfect":
        totalScore += 100;
        break;
      case "good":
        totalScore += 75;
        break;
      case "okay":
        totalScore += 40;
        break;
      case "clash":
        totalScore += 0;
        break;
    }
    pairs++;
  }

  return pairs > 0 ? Math.round(totalScore / pairs) : 100;
}
