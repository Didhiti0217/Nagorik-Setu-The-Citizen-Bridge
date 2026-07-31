/**
 * GemmaCall — the audit log for every single model call.
 *
 * Written by the logger the server injects into gemma/client.js via
 * setCallLogger(). `npm run eval` scores this collection into the measured
 * results in the README and the writeup (latency, JSON parse success rate,
 * etc.) — that is the project's proof-of-realness now, not a public page. The
 * record shape mirrors exactly what client.js emits.
 */
import mongoose from 'mongoose';

const { Schema } = mongoose;

const GemmaCallSchema = new Schema({
  stage: String,
  promptVersion: String,
  provider: String,
  model: String,
  modalities: { type: [String], default: [] },
  latencyMs: Number,
  tokensIn: { type: Number, default: null },
  tokensOut: { type: Number, default: null },
  // Reasoning traces are already stripped upstream; this is the answer text.
  rawResponse: { type: String, default: null },
  // null on success (validation runs later), false when all retries failed.
  parsedOk: { type: Schema.Types.Mixed, default: null },
  attempts: { type: Number, default: null },
  error: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

// eval/run.js pulls the most recent calls to score the live system.
GemmaCallSchema.index({ createdAt: -1 });

export const GemmaCall = mongoose.model('GemmaCall', GemmaCallSchema);
