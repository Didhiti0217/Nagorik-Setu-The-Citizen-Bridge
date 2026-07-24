# Stage 3 — real-photo validation

Generated `2026-07-24T14:15:17.269Z` · model `gemma-4-26b-a4b-it` · 16 photos.

> Photos are gitignored (many are stock/news images with their own licenses). This page
> reports only the model's behaviour, not the images. Vision triage is image-only: the
> model is given the photo and no text, and must identify the civic problem cold.

| Metric | Result |
|---|---|
| Photos where evidence matched the claim | 16/16 |
| Photos where an unrelated decoy claim was rejected | 16/16 |

## Per-photo

| Photo | Vision category | Sev | Supports matching claim | Rejects decoy |
|---|---|---|---|---|
| bus burnt in protest rage.png | hazard | 5 | ✅ 1 | ✅ |
| Bus_accident.png | traffic | 2 | ✅ 1 | ✅ |
| dirty.jpg | sanitation | 3 | ✅ 1 | ✅ |
| garbage bags on stret.jpg | waste | 3 | ✅ 1 | ✅ |
| garbage in street.png | waste | 4 | ✅ 1 | ✅ |
| garbage_pothole.png | waste | 4 | ✅ 1 | ✅ |
| left constrution work for 6 months.png | infrastructure | 4 | ✅ 1 | ✅ |
| potholes.png | sanitation | 4 | ✅ 1 | ✅ |
| road_damage.png | infrastructure | 5 | ✅ 1 | ✅ |
| road_damaged.png | infrastructure | 4 | ✅ 0.8 | ✅ |
| street_broken.png | infrastructure | 5 | ✅ 1 | ✅ |
| street_workers_unhygejnic.png | waste | 4 | ✅ 1 | ✅ |
| tangled_wires_below_height.png | hazard | 5 | ✅ 1 | ✅ |
| wires wrapped in a pillar.png | hazard | 5 | ✅ 1 | ✅ |
| worker_protest.png | traffic | 3 | ✅ 0.9 | ✅ |
| worker_protest_street_block.png | traffic | 4 | ✅ 1 | ✅ |

**Reading it.** "Supports matching claim" should be ✅ — the photo backs its own description.
"Rejects decoy" should be ✅ for most photos — an unrelated streetlight claim should not be
supported by a photo of garbage or a wrecked auto. A photo that genuinely shows a streetlight
issue may legitimately accept the decoy.
