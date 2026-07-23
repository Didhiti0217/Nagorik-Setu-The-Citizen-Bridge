/**
 * The report-processing pipeline: intake -> triage -> evidence -> dedupe -> issue.
 *
 * WHY THIS IS ASYNCHRONOUS
 * ------------------------
 * Measured Gemma 4 latency is 15-25s per triage call and it is irreducible:
 * thinking accounts for 75-80% of generated tokens and cannot be disabled on
 * the models available to us (`thinkingConfig` returns 400). Making a citizen
 * watch a spinner for 20 seconds would be a bad product and a worse demo.
 *
 * So `POST /api/reports` persists the raw report, returns 202 immediately, and
 * hands the report to `processReport()` in the background. When the pipeline
 * finishes it publishes an event; the dashboard's SSE stream drops the pin live.
 * Time-to-acknowledgement for the citizen is ~100ms.
 *
 * This is also the better demo: the video cuts from the phone to the dashboard
 * and the pin lands on camera, which is far more convincing than a spinner.
 *
 * DEPENDENCY INJECTION
 * --------------------
 * The pipeline takes its storage functions as arguments rather than importing
 * Mongoose. Dev B supplies the MongoDB implementations; the in-memory ones in
 * `scripts/pipeline-demo.js` let this run and be tested with no database at
 * all, which is how it was verified before Mongo existed.
 */
import {
  triageReport,
  verifyEvidence,
  findDuplicate,
  generateDispatchBrief,
} from '../gemma/index.js';

/** Issues at or above this severity get an auto-generated dispatch brief. */
const DISPATCH_SEVERITY_THRESHOLD = 4;

/** Geospatial + temporal window for duplicate candidates. */
export const DEDUPE_RADIUS_M = 150;
export const DEDUPE_WINDOW_HOURS = 72;

/**
 * @param {object} deps
 * @param {(args:{lng:number,lat:number,radiusM:number,sinceHours:number}) => Promise<Array>} deps.findNearbyIssues
 * @param {(issue:object) => Promise<object>} deps.createIssue
 * @param {(id:string, patch:object) => Promise<object>} deps.updateIssue
 * @param {(id:string, patch:object) => Promise<void>} deps.updateReport
 * @param {(event:string, payload:object) => void} [deps.publish]  SSE broadcast
 */
export function createPipeline(deps) {
  const { findNearbyIssues, createIssue, updateIssue, updateReport, publish = () => {} } = deps;

  /**
   * Process one already-persisted report. Never throws — a failure is recorded
   * on the report and surfaced in the UI rather than lost. Callers fire this
   * without awaiting.
   *
   * @param {object} report  { _id, rawText, photo?, location:{coordinates:[lng,lat]}, areaHint? }
   */
  async function processReport(report) {
    const timings = {};
    const started = Date.now();

    try {
      await updateReport(report._id, { status: 'processing' });

      // --- Stage 2: triage -------------------------------------------------
      const t1 = Date.now();
      const triage = await triageReport({
        text: report.rawText,
        photo: report.photo,
        areaHint: report.areaHint,
      });
      timings.triageMs = Date.now() - t1;

      // --- Stage 3: evidence verification ----------------------------------
      // Only meaningful when there is a photo; skipped cleanly otherwise.
      const t2 = Date.now();
      const evidence = await verifyEvidence({
        photo: report.photo,
        claimText: report.rawText,
        summaryEn: triage.data.summary_en,
      });
      timings.evidenceMs = Date.now() - t2;

      await updateReport(report._id, {
        status: triage.manualReview ? 'manual_review' : 'triaged',
        gemmaOutput: triage.data,
        evidenceCheck: evidence.data,
      });

      // --- Stage 4: duplicate clustering -----------------------------------
      const [lng, lat] = report.location.coordinates;
      const nearby = await findNearbyIssues({
        lng,
        lat,
        radiusM: DEDUPE_RADIUS_M,
        sinceHours: DEDUPE_WINDOW_HOURS,
      });

      const t3 = Date.now();
      const dupe = await findDuplicate({
        report: triage.data,
        candidates: nearby.map((i) => ({
          summaryEn: i.summaryEn,
          category: i.category,
          reportCount: i.reportCount,
          ageHours: Math.round((Date.now() - new Date(i.createdAt)) / 3_600_000),
          distanceM: Math.round(i.distanceM ?? 0),
        })),
      });
      timings.dedupeMs = Date.now() - t3;

      let issue;
      let merged = false;

      if (dupe.data.is_duplicate && nearby[dupe.data.candidate_index]) {
        // --- merge into the existing physical problem ---------------------
        const target = nearby[dupe.data.candidate_index];
        merged = true;
        issue = await updateIssue(target._id, {
          $inc: { reportCount: 1 },
          // Severity of an issue is the worst any citizen has reported.
          severity: Math.max(target.severity, triage.data.severity),
          priorityWeight: computePriorityWeight({
            severity: Math.max(target.severity, triage.data.severity),
            reportCount: target.reportCount + 1,
            isLifeThreatening: target.isLifeThreatening || triage.data.is_life_threatening,
          }),
          updatedAt: new Date(),
          $push: {
            mergeReasons: {
              reportId: report._id,
              reason: dupe.data.reason,
              confidence: dupe.data.confidence,
            },
          },
        });
      } else {
        // --- a genuinely new problem --------------------------------------
        issue = await createIssue({
          centroid: { type: 'Point', coordinates: [lng, lat] },
          category: triage.data.category,
          severity: triage.data.severity,
          isLifeThreatening: triage.data.is_life_threatening,
          summaryBn: triage.data.summary_bn,
          summaryEn: triage.data.summary_en,
          inferredLocation: triage.data.inferred_location,
          urgencyReason: triage.data.urgency_reason,
          department: triage.data.department,
          estimatedAffectedPeople: triage.data.estimated_affected_people,
          evidenceConfidence: evidence.data?.evidence_confidence ?? null,
          reportCount: 1,
          priorityWeight: computePriorityWeight({
            severity: triage.data.severity,
            reportCount: 1,
            isLifeThreatening: triage.data.is_life_threatening,
          }),
          status: 'open',
          needsReview: triage.manualReview,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      await updateReport(report._id, { issueId: issue._id, status: 'linked' });

      // --- Stage 5: dispatch brief -----------------------------------------
      // Only for issues that warrant one, and only once per issue. This is the
      // most expensive call in the pipeline, so it is deliberately gated.
      if (issue.severity >= DISPATCH_SEVERITY_THRESHOLD && !issue.dispatchBrief) {
        try {
          const t4 = Date.now();
          const brief = await generateDispatchBrief({
            issue: {
              category: issue.category,
              severity: issue.severity,
              isLifeThreatening: issue.isLifeThreatening,
              inferredLocation: issue.inferredLocation,
              reportCount: issue.reportCount,
              estimatedAffectedPeople: issue.estimatedAffectedPeople,
              summaryEn: issue.summaryEn,
              urgencyReason: issue.urgencyReason,
              evidenceConfidence: issue.evidenceConfidence,
            },
          });
          timings.dispatchMs = Date.now() - t4;
          issue = await updateIssue(issue._id, {
            dispatchBrief: brief.data,
            department: brief.data.department,
            slaDueAt: new Date(Date.now() + brief.data.sla_hours * 3_600_000),
          });
        } catch (err) {
          // A missing brief must not sink an otherwise-good issue.
          console.error(`[pipeline] dispatch brief failed for ${issue._id}:`, err.message);
        }
      }

      timings.totalMs = Date.now() - started;

      publish(merged ? 'issue:updated' : 'issue:created', { issue, merged, timings });

      return { issue, merged, triage: triage.data, evidence: evidence.data, dupe: dupe.data, timings };
    } catch (err) {
      console.error(`[pipeline] failed on report ${report._id}:`, err);
      await updateReport(report._id, { status: 'failed', error: err.message }).catch(() => {});
      publish('report:failed', { reportId: report._id, error: err.message });
      return { error: err.message };
    }
  }

  return { processReport };
}

/**
 * Ranking score for the councilor's work queue.
 *
 * Severity dominates, but volume matters: forty citizens reporting a severity-3
 * problem is a bigger civic event than one person reporting a severity-4. The
 * log keeps a viral issue from burying everything else, and a life-threatening
 * flag always floats to the top.
 */
export function computePriorityWeight({ severity, reportCount, isLifeThreatening }) {
  const base = severity * 10;
  const volume = Math.log2(Math.max(1, reportCount)) * 6;
  const danger = isLifeThreatening ? 25 : 0;
  return Math.round(base + volume + danger);
}
