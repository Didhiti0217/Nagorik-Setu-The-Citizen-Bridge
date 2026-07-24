# Test photos for Stage 3 (evidence verification)

Drop civic photos here, then from `server/`:

```bash
npm run evidence
```

It runs each photo through the **real** Gemma 4 vision pipeline — image-only triage plus
Stage 3 evidence verification — and writes `../evidence-results.md`.

## Rules

- **Nothing in this folder except this README is committed.** The parent `.gitignore`
  ignores all images here. That is deliberate: many test photos are stock or news images
  with their own copyright, and this repo is public (CLAUDE.md §1 rule 5).
- **Do not present stock/news photos as your own field data** in the writeup or video.
  Use them to *validate* that the feature works; use your own phone photos of Gazipur (or
  CC-licensed, attributed images) for anything shown to judges.

## Optional: pair a photo with a specific complaint

By default each photo is verified against the model's own reading of it. To test a
specific citizen claim instead, add a sidecar text file with the same name:

```
pothole-chandana.jpg
pothole-chandana.txt   ← "চন্দনায় রাস্তায় বড় গর্ত, রিকশা উল্টে যাচ্ছে"
```

The harness will verify the photo against that exact claim.

## Accepted formats

`.jpg` · `.jpeg` · `.png` · `.webp`
