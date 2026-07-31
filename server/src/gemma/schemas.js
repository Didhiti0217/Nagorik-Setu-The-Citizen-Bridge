/**
 * The contracts between Gemma 4 and the rest of the application.
 *
 * FROZEN AT H+2 — Dev B builds routes against these, Dev C builds fixtures
 * from these. Changing a field here breaks two other people's work, so
 * additions are fine, renames and removals are not.
 *
 * Every schema is deliberately permissive at the edges (.catch/.default on
 * soft fields) and strict on the fields the UI depends on. A model that gets
 * `estimated_affected_people` wrong should not fail the whole report.
 */
import { z } from 'zod';

export const CATEGORIES = [
  'infrastructure',
  'utility',
  'sanitation',
  'hazard',
  'water',
  'waste',
  'traffic',
];

export const DEPARTMENTS = [
  'DPDC',
  'City Corp Roads',
  'WASA',
  'Waste Mgmt',
  'Fire Service',
  'Other',
];

export const ACTIONS = ['immediate_dispatch', 'scheduled_maintenance', 'monitor'];

// The municipal-complaint lifecycle (docs/plan.md's status-tracking design).
// Order matters — services/statusEngine.js only accepts a transition to the
// SINGLE next entry in this list; skipping straight from "reported" to
// "resolved" is rejected no matter how confident Gemma is.
export const STATUSES = [
  'reported',
  'under_review',
  'verified',
  'assigned',
  'in_progress',
  'resolved',
  'closed',
];

/* --------------------------------------------------------------- *
 * Stage 2 — Triage & structuring
 * --------------------------------------------------------------- */
export const TriageSchema = z.object({
  category: z.enum(CATEGORIES),
  severity: z.coerce.number().int().min(1).max(5),
  // Forces the model to justify the severity score. Improves calibration and
  // gives the councilor an auditable reason instead of an opaque number.
  urgency_reason: z.string().min(1).max(300),
  summary_bn: z.string().min(1).max(200),
  summary_en: z.string().min(1).max(200),
  inferred_location: z.string().max(200).default(''),
  landmark_confidence: z.coerce.number().min(0).max(1).catch(0.5),
  department: z.enum(DEPARTMENTS).catch('Other'),
  action_required: z.enum(ACTIONS),
  is_life_threatening: z.coerce.boolean().catch(false),
  estimated_affected_people: z.coerce.number().int().min(0).max(1_000_000).catch(0),
  language_detected: z.string().max(20).catch('bn'),
  pii_present: z.coerce.boolean().catch(false),
});

/* --------------------------------------------------------------- *
 * Stage 3 — Photo-evidence verification
 * --------------------------------------------------------------- */
export const EvidenceSchema = z.object({
  supports_claim: z.coerce.boolean(),
  evidence_confidence: z.coerce.number().min(0).max(1),
  visible_elements: z.array(z.string().max(80)).max(12).catch([]),
  mismatch_reason: z.string().max(300).nullable().catch(null),
  image_quality: z.enum(['clear', 'usable', 'poor']).catch('usable'),
});

/* --------------------------------------------------------------- *
 * Stage 4 — Semantic duplicate clustering
 *
 * `candidate_index` refers to the position in the candidate list we sent,
 * or null when the report describes a genuinely new problem.
 * --------------------------------------------------------------- */
export const DedupeSchema = z.object({
  is_duplicate: z.coerce.boolean(),
  candidate_index: z.coerce.number().int().min(0).nullable().catch(null),
  confidence: z.coerce.number().min(0).max(1).catch(0.5),
  reason: z.string().min(1).max(300),
});

/* --------------------------------------------------------------- *
 * Stage 5 — Agentic dispatch brief
 * --------------------------------------------------------------- */
export const DispatchSchema = z.object({
  department: z.enum(DEPARTMENTS),
  priority: z.enum(['P1', 'P2', 'P3', 'P4']),
  sla_hours: z.coerce.number().int().min(1).max(720),
  crew: z.string().max(200),
  equipment: z.array(z.string().max(80)).max(10).catch([]),
  brief_en: z.string().min(1).max(1200),
  brief_bn: z.string().min(1).max(1200),
  // Generated, not sent. We do not ship an SMS integration (plan.md §12).
  citizen_sms_bn: z.string().max(320),
  priority_justification: z.string().max(400),
});

/* --------------------------------------------------------------- *
 * Stage 6 — Councilor's Copilot (tool calling)
 *
 * The model NEVER emits a raw query string. It picks one tool and supplies
 * typed arguments, which we validate before touching the database. This is
 * the injection boundary — treat it as security-critical.
 * --------------------------------------------------------------- */
export const COPILOT_TOOLS = ['query_issues', 'aggregate_by_category', 'find_hotspots'];

export const CopilotCallSchema = z.object({
  tool: z.enum(COPILOT_TOOLS),
  args: z
    .object({
      category: z.enum(CATEGORIES).nullable().catch(null),
      min_severity: z.coerce.number().int().min(1).max(5).nullable().catch(null),
      days: z.coerce.number().int().min(1).max(365).nullable().catch(null),
      area: z.string().max(120).nullable().catch(null),
      status: z.enum(STATUSES).nullable().catch(null),
      limit: z.coerce.number().int().min(1).max(100).nullable().catch(null),
    })
    .catch({}),
  intent_bn: z.string().max(300).catch(''),
});

/* --------------------------------------------------------------- *
 * Stage 7 — Status-transition suggestion
 *
 * Gemma reads a new update against an issue's CURRENT status and suggests
 * where it goes next. It never writes the database — services/statusEngine.js
 * is the only thing that decides whether a suggestion is actually applied
 * (docs/plan.md's AI-assisted status tracking design).
 * --------------------------------------------------------------- */
export const StatusSuggestionSchema = z.object({
  evidence_type: z.string().max(60).catch('unspecified'),
  next_status: z.enum(STATUSES),
  confidence: z.coerce.number().min(0).max(1),
  reason: z.string().min(1).max(300),
});

/** Second copilot turn: narrate the query results back in Bangla. */
export const CopilotAnswerSchema = z.object({
  answer_bn: z.string().min(1).max(800),
  answer_en: z.string().min(1).max(800),
  highlight_issue_ids: z.array(z.string().max(64)).max(50).catch([]),
});

/**
 * Fallback record written when a stage fails validation even after repair.
 * The report is preserved and flagged rather than dropped — a citizen's
 * complaint must never vanish because the model had a bad day.
 */
export function manualReviewFallback(reason) {
  return {
    category: 'infrastructure',
    severity: 3,
    urgency_reason: 'Automatic triage failed; queued for human review.',
    summary_bn: 'স্বয়ংক্রিয় বিশ্লেষণ ব্যর্থ — ম্যানুয়াল পর্যালোচনা প্রয়োজন',
    summary_en: 'Automatic triage failed — needs manual review',
    inferred_location: '',
    landmark_confidence: 0,
    department: 'Other',
    action_required: 'monitor',
    is_life_threatening: false,
    estimated_affected_people: 0,
    language_detected: 'unknown',
    pii_present: false,
    _manualReview: true,
    _manualReviewReason: reason,
  };
}
