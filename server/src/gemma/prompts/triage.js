/**
 * Stage 2 — Triage & structuring.
 *
 * Turns an unstructured citizen report (Bangla, Banglish, or phonetic Bangla
 * in Latin script, optionally with a photo) into the strict JSON the whole
 * application is built on.
 *
 * Prompt engineering notes:
 *  - Gemma models on the Gemini API do not take a separate systemInstruction,
 *    so the system framing is folded into the first text part.
 *  - Few-shot examples deliberately cover pure Bangla, Banglish code-switching,
 *    and Latin-script phonetic Bangla, because that is what real reports from
 *    Gazipur actually look like.
 *  - The examples model *terse* output. Without them the model narrates.
 */
import { textPart, imagePart } from '../client.js';
import { CATEGORIES, DEPARTMENTS, ACTIONS } from '../schemas.js';

export const version = 'triage@3';

const SYSTEM = `You are the civic triage engine for Gazipur City Corporation, Bangladesh.
You convert messy citizen complaints into strict structured data for dispatch officers.

Citizens write in Bangla, in English, in "Banglish" (Bangla words in Latin script),
or in a mix. Photos may be attached. Understand all of these.

Output ONLY a single valid JSON object. No markdown fences, no commentary, no
explanation before or after. Every field is required.

Fields:
- "category": one of ${CATEGORIES.join(' | ')}
- "severity": integer 1-5. 5 = immediate threat to life or total blockage of a
  major road. 4 = serious risk or many people affected. 3 = significant
  disruption. 2 = routine problem. 1 = cosmetic or minor.
- "urgency_reason": one short sentence in English justifying the severity score.
- "summary_bn": a concise summary in Bangla script, max 12 words.
- "summary_en": a concise summary in English, max 12 words.
- "inferred_location": the most specific landmark, road, market, ward or area
  named or implied. Empty string if genuinely none.
- "landmark_confidence": 0.0-1.0, how confident you are in inferred_location.
- "department": one of ${DEPARTMENTS.join(' | ')}. Electricity -> DPDC.
  Water supply, sewerage, drainage -> WASA. Roads, footpaths, streetlights ->
  City Corp Roads. Garbage -> Waste Mgmt. Fire, gas leak, electrocution risk ->
  Fire Service.
- "action_required": one of ${ACTIONS.join(' | ')}
- "is_life_threatening": true only if a person could plausibly be killed or
  seriously injured soon.
- "estimated_affected_people": integer best estimate. 0 if unknowable.
- "language_detected": "bn", "en", or "mixed".
- "pii_present": true if the text contains a phone number, national ID, or a
  named private individual.

If a photo is attached, use it to correct or sharpen the text — a citizen may
understate or overstate. Judge severity on what the evidence actually shows.`;

const EXAMPLES = `Example 1
Input: "The road is completely washed out by the factory in Konabari, cars are stuck."
Output: {"category":"infrastructure","severity":5,"urgency_reason":"Major road impassable, vehicles trapped, industrial area at peak hours.","summary_bn":"কোনাবাড়ীতে রাস্তা ধসে গাড়ি আটকে আছে","summary_en":"Road washed out, traffic fully blocked","inferred_location":"Konabari factory area","landmark_confidence":0.85,"department":"City Corp Roads","action_required":"immediate_dispatch","is_life_threatening":false,"estimated_affected_people":2000,"language_detected":"en","pii_present":false}

Example 2
Input: "টঙ্গী বাজারের সামনে বিদ্যুতের তার ছিঁড়ে পড়ে আছে, স্পার্ক করছে, অনেক মানুষ চলাচল করে এখানে"
Output: {"category":"hazard","severity":5,"urgency_reason":"Live sparking power line in a crowded market; electrocution risk is immediate.","summary_bn":"টঙ্গী বাজারে ছেঁড়া বিদ্যুতের তার স্পার্ক করছে","summary_en":"Live power line down and sparking at market","inferred_location":"Tongi Bazar entrance","landmark_confidence":0.9,"department":"Fire Service","action_required":"immediate_dispatch","is_life_threatening":true,"estimated_affected_people":500,"language_detected":"bn","pii_present":false}

Example 3
Input: "vai amader Board Bazar er moddhe 3 din dhore pani nai, WASA k bar bar bolsi kono kaj hoy nai"
Output: {"category":"water","severity":3,"urgency_reason":"Three-day supply outage affecting a residential area, but no immediate danger.","summary_bn":"বোর্ড বাজারে তিন দিন ধরে পানি নেই","summary_en":"No water supply for three days","inferred_location":"Board Bazar","landmark_confidence":0.8,"department":"WASA","action_required":"scheduled_maintenance","is_life_threatening":false,"estimated_affected_people":800,"language_detected":"mixed","pii_present":false}

Example 4
Input: "ekta street light noshto"
Output: {"category":"utility","severity":1,"urgency_reason":"Single broken streetlight with no location detail and no immediate risk.","summary_bn":"একটি স্ট্রিট লাইট নষ্ট","summary_en":"One streetlight not working","inferred_location":"","landmark_confidence":0.1,"department":"City Corp Roads","action_required":"scheduled_maintenance","is_life_threatening":false,"estimated_affected_people":20,"language_detected":"mixed","pii_present":false}`;

/**
 * @param {object} input
 * @param {string} input.text        raw citizen text (may be '')
 * @param {{data:string,mimeType:string}} [input.photo]
 * @param {{data:string,mimeType:string}} [input.audio]  reserved; gated on the H+0 spike
 * @param {string} [input.areaHint]  reverse-geocoded area, if available
 */
export function buildTriagePrompt({ text, photo, audio, areaHint }) {
  const parts = [];

  // Media before text — required by the Gemma 4 model card. orderParts() in
  // client.js enforces this too, but keeping call sites correct is cheaper
  // than relying on the safety net.
  if (photo) parts.push(imagePart(photo.data, photo.mimeType));
  if (audio) parts.push({ audio: { data: audio.data, mimeType: audio.mimeType } });

  const context = [
    SYSTEM,
    '',
    EXAMPLES,
    '',
    'Now process this report.',
    areaHint ? `GPS suggests the citizen is near: ${areaHint}` : null,
    audio ? 'The citizen recorded a voice message in Bangla. Understand the audio and triage it.' : null,
    photo ? 'A photo is attached. Use it as evidence.' : null,
    '',
    `Input: ${JSON.stringify(text || '(no text provided)')}`,
    'Output:',
  ]
    .filter(Boolean)
    .join('\n');

  parts.push(textPart(context));
  return parts;
}
