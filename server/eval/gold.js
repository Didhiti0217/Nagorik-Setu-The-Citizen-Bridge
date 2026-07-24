/**
 * Hand-labelled ground truth for the seed corpus.
 *
 * These labels are an independent human reading of each report's TEXT — they are
 * NOT derived from what the model produced. Category + severity are one
 * annotator's judgment; `clusterId` marks which reports describe the same
 * physical problem (the dedupe ground truth). Singletons each get a unique id.
 *
 * Labels are kept in corpus order and zipped onto CORPUS, so the texts live in
 * exactly one place (scripts/seed-corpus.js).
 */
import { CORPUS } from '../scripts/seed-corpus.js';

// Same length and order as CORPUS.
const LABELS = [
  // Tongi Bazar transformer sparking ×10 — live electrical hazard
  ...Array(10).fill({ category: 'hazard', severity: 5 }),
  // Konabari flooded road ×6 — major road disruption
  ...Array(6).fill({ category: 'infrastructure', severity: 4 }),
  // Board Bazar uncollected garbage ×4 — week-old pile, health risk
  ...Array(4).fill({ category: 'waste', severity: 3 }),
  // Chandana streetlight out ×3 — routine utility
  ...Array(3).fill({ category: 'utility', severity: 2 }),
  // Shibbari missing drain cover ×3 — child-fall hazard
  ...Array(3).fill({ category: 'hazard', severity: 4 }),
  // --- singletons, in corpus order ---
  { category: 'infrastructure', severity: 3 }, // Joydebpur pothole
  { category: 'water', severity: 3 }, // Gazipura no water 3 days
  { category: 'sanitation', severity: 3 }, // Salna sewage on road
  { category: 'infrastructure', severity: 2 }, // Bhogra broken footpath
  { category: 'hazard', severity: 5 }, // Cherag Ali gas leak
  { category: 'hazard', severity: 4 }, // Mouchak open manhole
  { category: 'traffic', severity: 3 }, // College gate dead signal
  { category: 'water', severity: 3 }, // Ershad Nagar burst water main
  { category: 'infrastructure', severity: 4 }, // Rajendrapur fallen tree blocking road
  { category: 'sanitation', severity: 3 }, // Station Road stagnant water / dengue
  { category: 'utility', severity: 2 }, // Zirani streetlight
  { category: 'infrastructure', severity: 3 }, // Board Bazar overbridge broken stairs
];

if (LABELS.length !== CORPUS.length) {
  throw new Error(`gold labels (${LABELS.length}) do not match corpus (${CORPUS.length}) — fix eval/gold.js`);
}

export const GOLD = CORPUS.map((c, i) => ({
  text: c.text,
  category: LABELS[i].category,
  severity: LABELS[i].severity,
  // Every 'single' report is its own cluster; real clusters share their tag.
  clusterId: c.cluster === 'single' ? `single-${i}` : c.cluster,
}));
