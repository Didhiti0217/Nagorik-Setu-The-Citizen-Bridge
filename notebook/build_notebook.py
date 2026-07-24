"""
Generates nagorik-setu-gemma4.ipynb — the runnable Kaggle notebook artifact.

We build the .ipynb programmatically so the JSON is always valid (hand-writing
notebook JSON invites escaping bugs). Run:  python build_notebook.py
"""
import json

def md(*lines):
    return {"cell_type": "markdown", "metadata": {}, "source": _src(lines)}

def code(*lines):
    return {"cell_type": "code", "metadata": {}, "execution_count": None,
            "outputs": [], "source": _src(lines)}

def _src(lines):
    flat = []
    for l in lines:
        flat.extend(l.split("\n"))
    return [x + "\n" for x in flat[:-1]] + [flat[-1]] if flat else []

cells = [
    md("# Nagorik Setu — Gemma 4 civic-triage pipeline",
       "",
       "**নাগরিক সেতু** turns messy Bangla/Banglish civic complaints into structured, "
       "de-duplicated, prioritized work orders for a city corporation — powered end to "
       "end by a single open Gemma 4 model.",
       "",
       "This notebook is a runnable slice of the real pipeline. It calls the same model "
       "the production app uses — `gemma-4-26b-a4b-it` — and demonstrates the two hardest "
       "stages:",
       "",
       "1. **Triage** — free text in any script → strict validated JSON",
       "2. **Semantic deduplication** — deciding whether two reports describe the *same "
       "physical problem*, across languages",
       "",
       "Full source (MERN app, five Gemma stages, live demo): "
       "https://github.com/Didhiti0217/Gemma---AI---Hackathon-",
       "",
       "> **Note.** Gemma 4 is the *only* LLM used. Every AI capability here is Gemma 4."),

    md("## 1. Setup",
       "",
       "Add your Google AI Studio API key as a Kaggle Secret named `GOOGLE_API_KEY` "
       "(Add-ons → Secrets), then run the cell below. A free key from "
       "[aistudio.google.com](https://aistudio.google.com) works."),

    code("import os, json, re, urllib.request",
         "",
         "# Kaggle Secrets (falls back to an env var for local runs).",
         "try:",
         "    from kaggle_secrets import UserSecretsClient",
         "    API_KEY = UserSecretsClient().get_secret('GOOGLE_API_KEY')",
         "except Exception:",
         "    API_KEY = os.environ.get('GOOGLE_API_KEY', '')",
         "",
         "MODEL = 'gemma-4-26b-a4b-it'   # the only LLM in this project",
         "assert API_KEY, 'Set GOOGLE_API_KEY as a Kaggle Secret first.'",
         "print('Model:', MODEL)"),

    md("## 2. The Gemma client",
       "",
       "Two non-obvious things this handles, learned the hard way:",
       "",
       "- **Gemma 4 always reasons first, and returns its thoughts as response parts "
       "flagged `thought: true` *before* the answer.** Concatenating every part gives you "
       "the reasoning trace instead of the JSON. We keep only non-thought parts.",
       "- **Thinking cannot be disabled** (`thinkingConfig` → HTTP 400) and eats 75–80% of "
       "the output-token budget, so we give it plenty of room."),

    code("def gemma(prompt, max_tokens=2048, temperature=0.1):",
         "    \"\"\"One Gemma 4 call. Returns the answer text (thoughts stripped).\"\"\"",
         "    url = (f'https://generativelanguage.googleapis.com/v1beta/models/'",
         "           f'{MODEL}:generateContent?key={API_KEY}')",
         "    body = {",
         "        'contents': [{'role': 'user', 'parts': [{'text': prompt}]}],",
         "        'generationConfig': {'temperature': temperature,",
         "                             'maxOutputTokens': max_tokens,",
         "                             'responseMimeType': 'application/json'},",
         "    }",
         "    req = urllib.request.Request(url, data=json.dumps(body).encode(),",
         "                                 headers={'Content-Type': 'application/json'})",
         "    resp = json.loads(urllib.request.urlopen(req, timeout=90).read())",
         "    parts = resp['candidates'][0]['content']['parts']",
         "    # CRITICAL: drop the thought parts, keep the answer.",
         "    return ''.join(p.get('text', '') for p in parts if not p.get('thought'))",
         "",
         "def extract_json(text):",
         "    \"\"\"Models wrap JSON in prose/fences even when told not to.\"\"\"",
         "    m = re.search(r'\\{.*\\}', text, re.S)",
         "    return json.loads(m.group(0)) if m else None"),

    md("## 3. Stage 2 — Triage",
       "",
       "Three deliberately messy inputs: pure Bangla, phonetic Banglish, and a terse "
       "fragment. Each must become the same strict schema."),

    code("TRIAGE_PROMPT = '''You are the civic triage engine for Gazipur City Corporation.",
         "Output ONLY one JSON object with keys: category "
         "(infrastructure|utility|sanitation|hazard|water|waste|traffic), severity (1-5),",
         "summary_bn, summary_en, department, is_life_threatening.",
         "",
         "Input: {text}",
         "Output:'''",
         "",
         "samples = [",
         "    'টঙ্গী বাজারের সামনে বিদ্যুতের তার ছিঁড়ে পড়ে আছে, স্পার্ক করছে',",
         "    'konabari te rasta puro bhenge gese, cng auto ultay geche, khub bipod',",
         "    'ekta street light noshto',",
         "]",
         "",
         "for s in samples:",
         "    out = extract_json(gemma(TRIAGE_PROMPT.format(text=json.dumps(s, ensure_ascii=False))))",
         "    print('IN :', s)",
         "    print('OUT:', json.dumps(out, ensure_ascii=False), '\\n')"),

    md("## 4. Stage 4 — Semantic deduplication",
       "",
       "The core reasoning task, and the project's central claim. Three residents report "
       "*one* sparking transformer — in Bangla, English, and Banglish. A keyword or "
       "embedding baseline struggles across scripts; Gemma reasons about the underlying "
       "physical problem.",
       "",
       "We ask: does the new report describe the **same physical problem** as an existing "
       "one?"),

    code("DEDUPE_PROMPT = '''You decide whether a NEW civic report describes the SAME "
         "physical real-world problem as an EXISTING one in Gazipur.",
         "Output ONLY JSON: {{\"is_duplicate\": bool, \"reason\": \"one short sentence\"}}.",
         "",
         "EXISTING: \"{existing}\"",
         "NEW: \"{new}\"",
         "Output:'''",
         "",
         "existing = 'Transformer sparking at Tongi Bazar entrance'",
         "new_reports = [",
         "    ('টঙ্গী বাজারের ট্রান্সফরমার থেকে আগুনের ফুলকি বের হচ্ছে', 'same, Bangla'),",
         "    ('tongi bazar er transformer theke spark hocche', 'same, Banglish'),",
         "    ('কোনাবাড়ীতে রাস্তা পানির নিচে', 'DIFFERENT: flooded road'),",
         "]",
         "",
         "for text, label in new_reports:",
         "    out = extract_json(gemma(DEDUPE_PROMPT.format(existing=existing, new=text)))",
         "    verdict = 'MERGE' if out.get('is_duplicate') else 'separate'",
         "    print(f'[{verdict:7}] ({label})')",
         "    print(f'          {out.get(\"reason\")}\\n')"),

    md("## 5. What this shows",
       "",
       "- One open Gemma 4 model handles free-text triage **and** cross-lingual duplicate "
       "reasoning — no separate classifier, no embedding model, no second LLM.",
       "- The same model, in the full app, also does photo-evidence verification, agentic "
       "dispatch-brief generation, and tool-calling over the live database.",
       "- Because Gemma 4 is open-weight (Apache 2.0), the whole pipeline can run locally "
       "at zero per-report cost, keeping citizen data inside the municipality.",
       "",
       "**Live demo, full MERN source, and the measured benchmark table:** "
       "https://github.com/Didhiti0217/Gemma---AI---Hackathon-"),
]

nb = {
    "cells": cells,
    "metadata": {
        "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
        "language_info": {"name": "python", "version": "3.11"},
    },
    "nbformat": 4,
    "nbformat_minor": 5,
}

with open("nagorik-setu-gemma4.ipynb", "w", encoding="utf-8") as f:
    json.dump(nb, f, ensure_ascii=False, indent=1)

print(f"Wrote nagorik-setu-gemma4.ipynb — {len(cells)} cells")
