# Harmonic Mixing Documentation

This document explains how AutoMix detects musical keys and calculates harmonic compatibility between tracks using the Camelot Wheel system.

## Table of Contents

1. [What is Harmonic Mixing?](#what-is-harmonic-mixing)
2. [Key Detection Algorithm](#key-detection-algorithm)
3. [Camelot Wheel System](#camelot-wheel-system)
4. [Compatibility Scoring](#compatibility-scoring)
5. [Implementation Details](#implementation-details)

---

## What is Harmonic Mixing?

Harmonic mixing is the practice of mixing tracks that are in **musically compatible keys**. When two tracks are harmonically compatible, their melodies, basslines, and harmonies blend smoothly without dissonance or clashing frequencies.

**Benefits:**
- Smoother, more professional-sounding transitions
- Maintains musical energy and flow
- Avoids jarring key changes that break the vibe
- Enables creative techniques like mashups and acapella overlays

**Example:**
- Track A in **A minor (8A)** mixes well with Track B in **E minor (9A)** (adjacent on Camelot Wheel)
- Track A in **A minor (8A)** clashes with Track B in **F# major (11B)** (distant on wheel)

---

## Key Detection Algorithm

AutoMix uses the **Krumhansl-Schmuckler key-finding algorithm** implemented in Python with Librosa.

### How It Works

1. **Extract chroma features** from the audio:
   ```python
   chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
   chroma_mean = chroma.mean(axis=1)  # Average across time
   ```
   Chroma features represent the energy in each of the 12 pitch classes (C, C#, D, ..., B).

2. **Compare to key profiles** using correlation:
   ```python
   major_profile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
   minor_profile = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
   ```
   These profiles represent the typical distribution of notes in major and minor keys.

3. **Test all 12 rotations** of each profile:
   ```python
   for shift in range(12):
       rotated = np.roll(profile, shift)
       correlation = np.corrcoef(chroma_mean, rotated)[0, 1]
   ```

4. **Select the best match**:
   - Highest correlation across all 24 tests (12 major + 12 minor)
   - Returns key name, mode, and confidence score

### Accuracy and Limitations

**Works well for:**
- Electronic dance music (clear harmonic content)
- Pop/rock with strong melodic elements
- Tracks with consistent key throughout

**Challenges:**
- Ambient/atmospheric tracks (weak harmonic content)
- Tracks that modulate (change key) frequently
- Percussion-heavy tracks with minimal melody
- Very short tracks (<30 seconds)

**Confidence threshold:** AutoMix flags keys with confidence < 0.6 as potentially unreliable (⚠ warning in UI).

---

## Camelot Wheel System

The Camelot Wheel is a simplified notation system used by DJs to represent musical keys in a way that makes harmonic compatibility obvious.

### Structure

```
     A (minor)          B (major)
1A = Ab min    ←→    1B = B maj
2A = Eb min    ←→    2B = F# maj
3A = Bb min    ←→    3B = Db maj
4A = F min     ←→    4B = Ab maj
5A = C min     ←→    5B = Eb maj
6A = G min     ←→    6B = Bb maj
7A = D min     ←→    7B = F maj
8A = A min     ←→    8B = C maj
9A = E min     ←→    9B = G maj
10A = B min    ←→    10B = D maj
11A = F# min   ←→    11B = A maj
12A = Db min   ←→    12B = E maj
```

**Key points:**
- **Numbers (1-12)** represent the "hour" on the wheel
- **Letters (A/B)** represent minor (A) or major (B)
- Adjacent hours are harmonically compatible
- Same hour, different letter = relative major/minor (also compatible)

### Mapping from Standard Notation

AutoMix converts detected keys to Camelot codes:

| Standard Key | Pitch Class | Mode | Camelot |
|--------------|-------------|------|---------|
| C major | 0 | major | 8B |
| C minor | 0 | minor | 5A |
| G major | 7 | major | 9B |
| G minor | 7 | minor | 6A |
| A minor | 9 | minor | 8A |
| E minor | 4 | minor | 9A |

---

## Compatibility Scoring

AutoMix calculates harmonic compatibility using these rules:

### Compatibility Levels

| Level | Score | Condition | Example |
|-------|-------|-----------|---------|
| **Perfect** | 100 | Same key | 8A → 8A |
| **Perfect** | 100 | Relative major/minor | 8A → 8B |
| **Good** | 75 | ±1 hour, same letter | 8A → 7A or 9A |
| **Good** | 75 | ±1 hour, different letter | 8A → 7B or 9B |
| **Okay** | 40 | ±2 hours, same letter | 8A → 6A or 10A |
| **Clash** | 0 | Everything else | 8A → 3B |

### Energy Boost Trick

Moving **+1 hour clockwise** (e.g., 8A → 9A) subtly raises energy and is a common DJ technique for building momentum.

Moving **-1 hour counter-clockwise** (e.g., 8A → 7A) creates a calmer, more relaxed transition.

### Implementation

```typescript
function getHarmonicCompatibility(camelotA: string, camelotB: string) {
  const a = parseCamelot(camelotA); // { hour: 8, letter: "A" }
  const b = parseCamelot(camelotB); // { hour: 9, letter: "A" }

  // Same key
  if (a.hour === b.hour && a.letter === b.letter) {
    return { level: "perfect", label: "✓ Perfect" };
  }

  // Relative major/minor
  if (a.hour === b.hour && a.letter !== b.letter) {
    return { level: "perfect", label: "✓ Relative" };
  }

  // Calculate hour distance (wrap around 12)
  const hourDiff = Math.min(
    Math.abs(a.hour - b.hour),
    12 - Math.abs(a.hour - b.hour)
  );

  // ±1 hour, same letter
  if (hourDiff === 1 && a.letter === b.letter) {
    const direction = ((b.hour - a.hour + 12) % 12) <= 6 ? "up" : "down";
    return {
      level: "good",
      label: direction === "up" ? "↑ Energy" : "↓ Calm"
    };
  }

  // ±2 hours, same letter
  if (hourDiff === 2 && a.letter === b.letter) {
    return { level: "okay", label: "○ Okay" };
  }

  // Everything else
  return { level: "clash", label: "✗ Clash" };
}
```

### Overall Mix Score

For a multi-track mix, AutoMix calculates an **overall harmonic flow score**:

```typescript
function scoreHarmonicFlow(camelots: string[]) {
  let totalScore = 0;
  let pairs = 0;

  for (let i = 0; i < camelots.length - 1; i++) {
    const compat = getHarmonicCompatibility(camelots[i], camelots[i + 1]);
    switch (compat.level) {
      case "perfect": totalScore += 100; break;
      case "good":    totalScore += 75; break;
      case "okay":    totalScore += 40; break;
      case "clash":   totalScore += 0; break;
    }
    pairs++;
  }

  return pairs > 0 ? Math.round(totalScore / pairs) : 100;
}
```

**Interpretation:**
- **80-100%:** Great harmonic flow
- **50-79%:** Some clashes, but acceptable
- **0-49%:** Significant key clashes detected

---

## Implementation Details

### Backend (Python Analyzer)

**File:** `services/analyzer/main.py`

```python
MINOR_CAMELOT = {
    0: "5A", 1: "12A", 2: "7A", 3: "2A", 4: "9A", 5: "4A",
    6: "11A", 7: "6A", 8: "1A", 9: "8A", 10: "3A", 11: "10A",
}

MAJOR_CAMELOT = {
    0: "8B", 1: "3B", 2: "10B", 3: "5B", 4: "12B", 5: "7B",
    6: "2B", 7: "9B", 8: "4B", 9: "11B", 10: "6B", 11: "1B",
}

def detect_key(y, sr):
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    chroma_mean = chroma.mean(axis=1)
    
    # ... correlation logic ...
    
    return {
        "key": f"{key_name} {mode}",
        "camelot": camelot,
        "mode": mode,
        "pitchClass": pitch_class,
        "confidence": confidence,
    }
```

### Database Schema

**File:** `apps/api/prisma/schema.prisma`

```prisma
model Track {
  // ... other fields ...
  musicalKey       String?   // "A minor"
  camelot          String?   // "8A"
  keyMode          String?   // "minor"
  keyConfidence    Float?    // 0.847
}
```

### Frontend Components

**Key Badge:** `apps/web/src/components/key-badge.tsx`
- Displays Camelot code with color coding (indigo for minor, amber for major)
- Shows ⚠ warning for low-confidence detections

**Compatibility Indicator:** `apps/web/src/components/mix-builder.tsx`
- Shows compatibility between consecutive tracks in the mix queue
- Color-coded: green (perfect), blue (good), yellow (okay), red (clash)

**Harmonic Flow Score:** `apps/web/src/components/mix-builder.tsx`
- Displays overall mix compatibility percentage
- Updates in real-time as tracks are added/removed

---

## Advanced Techniques

### Harmonic Mixing Strategies

1. **Stay in the same key** (8A → 8A)
   - Safest option, guaranteed compatibility
   - Can feel repetitive over long mixes

2. **Move ±1 hour** (8A → 9A or 7A)
   - Most common DJ technique
   - +1 hour = energy boost
   - -1 hour = energy reduction

3. **Switch between relative major/minor** (8A → 8B)
   - Creates emotional shift (sad → happy or vice versa)
   - Maintains harmonic compatibility

4. **Jump to perfect fifth** (8A → 1A or 3A)
   - More dramatic key change
   - Still harmonically compatible
   - Use sparingly for impact

### When to Ignore Harmony

Harmonic mixing is a guideline, not a rule. Ignore it when:

- **Percussion-only sections** (no harmonic content to clash)
- **Very short transitions** (<8 beats, too quick to notice dissonance)
- **Intentional dissonance** (experimental/avant-garde mixing)
- **Genre requirements** (some genres embrace key clashes for energy)

### Combining with Beat Matching

The best mixes align **both rhythm and harmony**:

```
✓ Beats aligned + Keys compatible = Professional mix
✓ Beats aligned + Keys clash = Rhythmically tight but harmonically jarring
✗ Beats misaligned + Keys compatible = Harmonically smooth but rhythmically messy
✗ Beats misaligned + Keys clash = Trainwreck
```

AutoMix handles both automatically, but understanding the principles helps you make better track selection decisions.

---

## Future Enhancements

Potential improvements for future versions:

1. **Phrase-aware key detection**
   - Analyze key changes within a track
   - Identify intro/outro sections with different keys

2. **Pitch shifting for harmonic alignment**
   - Shift track pitch by ±1-2 semitones to match keys
   - Requires high-quality pitch shifting (e.g., Rubber Band)

3. **Energy-based track ordering**
   - Combine harmonic compatibility with energy analysis
   - Automatically arrange tracks for optimal energy flow

4. **Key lock indicator**
   - Show when a track's pitch has been shifted for harmonic alignment
   - Warn if shift exceeds ±3 semitones (audible artifacts)
```