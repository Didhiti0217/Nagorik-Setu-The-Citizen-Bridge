/**
 * GemmaCall — the audit log for every single model call.
 *
 * Written by the logger the server injects into gemma/client.js via
 * setCallLogger(). This is the data behind the in-app Transparency page and the
 * benchmark table in the writeup — our proof-of-realness for the Functionality
 * score (CLAUDE.md §2). The record shape mirrors exactly what client.js emits.
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

// Transparency page pulls the most recent calls.
GemmaCallSchema.index({ createdAt: -1 });

export const GemmaCall = mongoose.model('GemmaCall', GemmaCallSchema);
