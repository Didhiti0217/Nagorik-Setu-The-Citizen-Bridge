/**
 * THE ONLY FILE IN THIS REPOSITORY THAT CALLS AN AI MODEL.
 *
 * Everything else imports from here. Keeping the inference surface to one file
 * is what lets us prove, at a glance, that Gemma 4 is the only LLM in the
 * project — a hard competition rule (see CLAUDE.md §1).
 *
 * Providers: aistudio (hosted) | ollama (local/offline) | mock (fixtures).
 * All three serve Gemma 4 and only Gemma 4.
 */

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 3;

/**
 * Gemma 4 reasons before answering and cannot be told not to — `thinkingConfig`
 * is rejected with 400 on the models we have access to. Thought tokens are
 * billed against maxOutputTokens, and measured triage calls spend 450+ on
 * reasoning alone. Anything under ~1500 risks the model thinking itself out of
 * a budget and returning nothing at all.
 */
const DEFAULT_MAX_TOKENS = 2048;

export class GemmaError extends Error {
  constructor(message, { status, provider, retryable = false } = {}) {
    super(message);
    this.name = 'GemmaError';
    this.status = status;
    this.provider = provider;
    this.retryable = retryable;
  }
}

/** Thrown when the model's output cannot be coerced into the expected shape. */
export class GemmaParseError extends GemmaError {
  constructor(message, { rawResponse } = {}) {
    super(message);
    this.name = 'GemmaParseError';
    this.rawResponse = rawResponse;
  }
}

function config() {
  return {
    provider: process.env.GEMMA_PROVIDER || 'aistudio',
    model: process.env.GEMMA_MODEL || 'gemma-4-e4b-it',
    apiKey: process.env.GOOGLE_API_KEY || '',
    ollamaHost: process.env.OLLAMA_HOST || 'http://localhost:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'gemma4:e4b',
    timeoutMs: Number(process.env.GEMMA_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    maxRetries: Number(process.env.GEMMA_MAX_RETRIES) || DEFAULT_MAX_RETRIES,
  };
}

/* ------------------------------------------------------------------ *
 * Audit logging
 *
 * The client does not import the Mongoose model directly — the server
 * injects a logger at boot. Keeps gemma/ free of database coupling and
 * lets scripts/eval run the engine without a database.
 * ------------------------------------------------------------------ */
let callLogger = async () => {};

export function setCallLogger(fn) {
  callLogger = typeof fn === 'function' ? fn : async () => {};
}

/* ------------------------------------------------------------------ *
 * Part helpers
 *
 * A "part" is one piece of multimodal input:
 *   { text: '...' }
 *   { image: { data: <base64>, mimeType: 'image/jpeg' } }
 *   { audio: { data: <base64>, mimeType: 'audio/wav' } }
 *
 * Per the Gemma 4 model card, image/audio parts must come BEFORE text.
 * orderParts() enforces that so callers cannot get it wrong.
 * ------------------------------------------------------------------ */
export const textPart = (text) => ({ text });
export const imagePart = (data, mimeType = 'image/jpeg') => ({ image: { data, mimeType } });
export const audioPart = (data, mimeType = 'audio/wav') => ({ audio: { data, mimeType } });

function orderParts(parts) {
  const media = parts.filter((p) => p.image || p.audio);
  const text = parts.filter((p) => p.text != null);
  return [...media, ...text];
}

function modalitiesOf(parts) {
  const set = new Set();
  for (const p of parts) {
    if (p.text != null) set.add('text');
    if (p.image) set.add('image');
    if (p.audio) set.add('audio');
  }
  return [...set];
}

/* ------------------------------------------------------------------ *
 * Provider: Google AI Studio (Gemini API serving Gemma 4)
 *
 * Note: Gemma models on this API historically do not accept a separate
 * systemInstruction field, so callers fold system framing into the first
 * text part. Structured-output support is probed rather than assumed —
 * see the responseMimeType fallback below.
 * ------------------------------------------------------------------ */
async function callAiStudio({ stage, parts, json, temperature, maxTokens, signal }) {
  const cfg = config();
  if (!cfg.apiKey) {
    throw new GemmaError(
      'GOOGLE_API_KEY is not set. Add it to server/.env (see .env.example).',
      { provider: 'aistudio' },
    );
  }

  const apiParts = parts.map((p) => {
    if (p.text != null) return { text: p.text };
    const media = p.image || p.audio;
    return { inline_data: { mime_type: media.mimeType, data: media.data } };
  });

  const generationConfig = {
    temperature: temperature ?? 0.2,
    maxOutputTokens: maxTokens ?? DEFAULT_MAX_TOKENS,
  };
  if (json) generationConfig.responseMimeType = 'application/json';

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;

  const send = async (genConfig) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: apiParts }],
        generationConfig: genConfig,
      }),
      signal,
    });
    return res;
  };

  let res = await send(generationConfig);

  // Some Gemma variants reject responseMimeType. Retry once without it rather
  // than losing the call — prompt-level JSON instruction plus our extractor is
  // a sufficient fallback.
  if (!res.ok && json) {
    const body = await res.text();
    if (/responseMimeType|response_mime_type|not supported/i.test(body)) {
      const { responseMimeType, ...rest } = generationConfig;
      res = await send(rest);
    } else {
      throw new GemmaError(`AI Studio ${res.status}: ${body.slice(0, 500)}`, {
        status: res.status,
        provider: 'aistudio',
        retryable: res.status === 429 || res.status >= 500,
      });
    }
  }

  if (!res.ok) {
    const body = await res.text();
    throw new GemmaError(`AI Studio ${res.status}: ${body.slice(0, 500)}`, {
      status: res.status,
      provider: 'aistudio',
      retryable: res.status === 429 || res.status >= 500,
    });
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  const allParts = candidate?.content?.parts || [];

  // CRITICAL: Gemma 4 always reasons before answering, and returns those
  // thoughts as ordinary parts flagged `thought: true`. Concatenating every
  // part hands you the reasoning trace instead of the answer — and the trace
  // usually starts with prose, so JSON.parse fails on output that was
  // actually fine. Thinking cannot be disabled on these models:
  // `thinkingConfig` returns 400 "Thinking budget is not supported".
  const text = allParts
    .filter((p) => p.thought !== true)
    .map((p) => p.text || '')
    .join('')
    .trim();

  const thoughtTokens = data.usageMetadata?.thoughtsTokenCount ?? 0;

  if (!text) {
    const reason = candidate?.finishReason || 'unknown';
    // Thinking is billed against maxOutputTokens. When the budget is too
    // tight the model spends all of it reasoning and emits no answer at all.
    if (reason === 'MAX_TOKENS') {
      // Retryable, because generate() responds by DOUBLING the budget rather
      // than repeating an identical doomed call. How much a model reasons
      // varies run to run on the same input, so a fixed budget will always
      // fail eventually — escalation is the only stable fix.
      const err = new GemmaError(
        `Gemma spent the entire token budget on reasoning (${thoughtTokens} thought tokens) ` +
          `and produced no answer for stage "${stage}".`,
        { provider: 'aistudio', retryable: true },
      );
      err.exhaustedBudget = true;
      throw err;
    }
    throw new GemmaError(`AI Studio returned no text (finishReason: ${reason})`, {
      provider: 'aistudio',
      retryable: reason === 'RECITATION',
    });
  }

  return {
    text,
    model: cfg.model,
    usage: {
      tokensIn: data.usageMetadata?.promptTokenCount ?? null,
      tokensOut: data.usageMetadata?.candidatesTokenCount ?? null,
      thoughtTokens,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Provider: Ollama (local, offline)
 *
 * Deliberately uses the OpenAI-compatible endpoint for EVERYTHING.
 * The native /api/chat SILENTLY IGNORES audio — it returns a normal
 * response claiming no audio was provided, with no error. Using one
 * endpoint for all modalities removes that whole class of bug.
 * ------------------------------------------------------------------ */
async function callOllama({ parts, json, temperature, maxTokens, signal }) {
  const cfg = config();

  const content = parts.map((p) => {
    if (p.text != null) return { type: 'text', text: p.text };
    if (p.image) {
      return {
        type: 'image_url',
        image_url: { url: `data:${p.image.mimeType};base64,${p.image.data}` },
      };
    }
    // Audio format is the bare subtype ("wav"), not the full mime type.
    const format = p.audio.mimeType.split('/')[1] || 'wav';
    return { type: 'input_audio', input_audio: { data: p.audio.data, format } };
  });

  const body = {
    model: cfg.ollamaModel,
    messages: [{ role: 'user', content }],
    temperature: temperature ?? 0.2,
    max_tokens: maxTokens ?? DEFAULT_MAX_TOKENS,
  };
  if (json) body.response_format = { type: 'json_object' };

  const res = await fetch(`${cfg.ollamaHost}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new GemmaError(`Ollama ${res.status}: ${errBody.slice(0, 500)}`, {
      status: res.status,
      provider: 'ollama',
      retryable: res.status >= 500,
    });
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new GemmaError('Ollama returned no content', { provider: 'ollama' });

  return {
    text,
    model: cfg.ollamaModel,
    usage: {
      tokensIn: data.usage?.prompt_tokens ?? null,
      tokensOut: data.usage?.completion_tokens ?? null,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Provider: mock — lets the pipeline and UI be built without a key.
 * Registered fixtures are keyed by stage.
 * ------------------------------------------------------------------ */
const mockFixtures = new Map();

export function setMockFixture(stage, value) {
  mockFixtures.set(stage, typeof value === 'string' ? value : JSON.stringify(value));
}

async function callMock({ stage }) {
  const text = mockFixtures.get(stage);
  if (!text) {
    throw new GemmaError(
      `No mock fixture registered for stage "${stage}". Call setMockFixture('${stage}', {...}).`,
      { provider: 'mock' },
    );
  }
  return { text, model: 'mock', usage: { tokensIn: null, tokensOut: null } };
}

const PROVIDERS = { aistudio: callAiStudio, ollama: callOllama, mock: callMock };

/* ------------------------------------------------------------------ *
 * generate() — one raw model call, with timeout, retry and audit logging.
 * ------------------------------------------------------------------ */
export async function generate({
  stage,
  promptVersion,
  parts,
  json = false,
  temperature,
  maxTokens,
}) {
  const cfg = config();
  const impl = PROVIDERS[cfg.provider];
  if (!impl) {
    throw new GemmaError(
      `Unknown GEMMA_PROVIDER "${cfg.provider}". Expected aistudio | ollama | mock.`,
    );
  }

  const ordered = orderParts(parts);
  const modalities = modalitiesOf(ordered);
  const startedAt = Date.now();

  let lastError;
  // Escalates when the model reasons itself out of budget (see MAX_TOKENS above).
  let effectiveMaxTokens = maxTokens ?? DEFAULT_MAX_TOKENS;

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
    try {
      const result = await impl({
        stage,
        parts: ordered,
        json,
        temperature,
        maxTokens: effectiveMaxTokens,
        signal: controller.signal,
      });
      const latencyMs = Date.now() - startedAt;

      await callLogger({
        stage,
        promptVersion,
        provider: cfg.provider,
        model: result.model,
        modalities,
        latencyMs,
        tokensIn: result.usage.tokensIn,
        tokensOut: result.usage.tokensOut,
        rawResponse: result.text,
        parsedOk: null, // set by generateJson once validation runs
        attempts: attempt + 1,
      });

      return { ...result, latencyMs, provider: cfg.provider, modalities };
    } catch (err) {
      lastError = err;
      const aborted = err.name === 'AbortError';
      const retryable = aborted || err.retryable || err instanceof TypeError;
      if (attempt === cfg.maxRetries || !retryable) break;

      if (err.exhaustedBudget) {
        // Give it room to finish the thought AND write the answer. Capped so a
        // pathological input cannot run away with the token budget.
        effectiveMaxTokens = Math.min(effectiveMaxTokens * 2, 8192);
        console.warn(
          `[gemma] stage "${stage}" exhausted its budget on reasoning; ` +
            `retrying with maxTokens=${effectiveMaxTokens}`,
        );
      }

      // Exponential backoff with jitter — AI Studio free tier is ~15 RPM.
      const backoff = 500 * 2 ** attempt + Math.random() * 250;
      await new Promise((r) => setTimeout(r, backoff));
    } finally {
      clearTimeout(timer);
    }
  }

  await callLogger({
    stage,
    promptVersion,
    provider: cfg.provider,
    model: cfg.provider === 'ollama' ? cfg.ollamaModel : cfg.model,
    modalities,
    latencyMs: Date.now() - startedAt,
    rawResponse: null,
    parsedOk: false,
    error: lastError?.message,
  });

  throw lastError;
}

/* ------------------------------------------------------------------ *
 * JSON extraction and repair
 *
 * Models wrap JSON in prose and code fences even when told not to. We
 * strip fences, then scan for the first balanced object/array so that
 * trailing commentary cannot break the parse.
 * ------------------------------------------------------------------ */
export function extractJson(text) {
  if (!text) return null;

  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  const direct = tryParse(s);
  if (direct !== undefined) return direct;

  for (const [open, close] of [['{', '}'], ['[', ']']]) {
    const start = s.indexOf(open);
    if (start === -1) continue;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < s.length; i += 1) {
      const ch = s[i];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === open) depth += 1;
      else if (ch === close) {
        depth -= 1;
        if (depth === 0) {
          const parsed = tryParse(s.slice(start, i + 1));
          if (parsed !== undefined) return parsed;
          break;
        }
      }
    }
  }
  return null;
}

function tryParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

/**
 * generateJson — the function every pipeline stage actually uses.
 *
 * Contract: either returns data valid against `schema`, or throws
 * GemmaParseError. It never returns half-valid data, so callers can route
 * the failure to manual_review instead of guessing. This is what keeps a
 * malformed model response from becoming a 500.
 */
export async function generateJson({
  stage,
  promptVersion,
  parts,
  schema,
  temperature,
  maxTokens,
  repair = true,
}) {
  const first = await generate({
    stage,
    promptVersion,
    parts,
    json: true,
    temperature,
    maxTokens,
  });

  const validated = validateAgainst(schema, extractJson(first.text));
  if (validated.ok) {
    return { data: validated.data, meta: { ...first, repaired: false } };
  }

  if (!repair) {
    throw new GemmaParseError(
      `Stage "${stage}" produced invalid JSON: ${validated.error}`,
      { rawResponse: first.text },
    );
  }

  // One repair pass: hand the model its own broken output plus the reason.
  const second = await generate({
    stage: `${stage}:repair`,
    promptVersion,
    parts: [
      {
        text:
          `The following text was supposed to be a single valid JSON object ` +
          `matching a strict schema, but it failed validation.\n\n` +
          `Validation error:\n${validated.error}\n\n` +
          `Invalid output:\n${first.text}\n\n` +
          `Return ONLY the corrected JSON object. No markdown, no commentary.`,
      },
    ],
    json: true,
    temperature: 0,
    maxTokens,
  });

  const repaired = validateAgainst(schema, extractJson(second.text));
  if (repaired.ok) {
    return { data: repaired.data, meta: { ...second, repaired: true } };
  }

  throw new GemmaParseError(
    `Stage "${stage}" failed validation after repair: ${repaired.error}`,
    { rawResponse: second.text },
  );
}

function validateAgainst(schema, value) {
  if (value == null) return { ok: false, error: 'no JSON object found in response' };
  if (!schema) return { ok: true, data: value };

  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };

  const error = result.error.issues
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
  return { ok: false, error };
}

export function activeConfig() {
  const cfg = config();
  return {
    provider: cfg.provider,
    model: cfg.provider === 'ollama' ? cfg.ollamaModel : cfg.model,
    hasApiKey: Boolean(cfg.apiKey),
  };
}
