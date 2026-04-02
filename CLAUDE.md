# Known App — Claude Code Context

## What This Is
Single-file HTML app for member recognition training at Interlachen Country Club.
Live at: known.golf/interlachen
Auto-deploys from main via Vercel.

## Critical Rules
1. **NEVER read the full interlachen.html** — it's 2000+ lines and will choke your context. Use grep to find edit points, then read only specific line ranges.
2. **Push to main only** — Vercel auto-deploys from main. If you're in a worktree, merge to main first.
3. **Verify live after every push** — open known.golf/interlachen and confirm the feature works.
4. **git push may hang** — if push hangs >60 seconds, it's a network issue. Report it, don't retry silently.

## File Structure
- `interlachen.html` — The entire app (HTML + CSS + JS + data)
- `index.html` — Homepage/landing page for known.golf

## Data Model
GOLFERS array (1020 members) with fields:
- name, first, last, membership, memberType, memberNumber
- rounds18, rounds9, roundsTotal, tier, ft, p

## Key Patterns
- ForeTees photo URL: `https://web.foretees.com/v5/member-photos/interlachen/FT${golfer.ft}.jpg`
- Photo fallback: ftImg() renders img, _camFallback shows camera SVG on error
- Leitner spaced repetition: localStorage key `icc_leitner_Guest`
- Mode switching: Quiz (renderQuiz), Recall (renderRecall), Production (renderProduction)
- Password gate: protects Interlachen member data

## Spec Status (17 Items)
### Done
- Item 1: ForeTees photo URLs + speed grades + interval scheduling
- Item 2: Session queue with priority scheduling
- Item 3: Quiz mode (multiple choice)
- Item 4: Production Mode (voice/mic with Web Speech API, Levenshtein + Soundex fuzzy matching)
- Item 5: Session queue with per-participant Leitner tracking
- Item 6: Recall mode (type the name)
- Item 7: Leitner spaced repetition
- Item 9: Tier filtering
- Item 10: Photo error fallback (camera SVG, clickable)
- Item 13: Password gate

### Remaining
- (none — all 17 items complete)
