# AI-Assisted Status Tracking for Nagorik Setu

## Overview

The status tracking system should **not rely entirely on the LLM**.
Instead, use a combination of:

-   **Backend business logic** (source of truth)
-   **Gemma** (reasoning and evidence extraction)
-   **Community verification**
-   **Authority updates**

The LLM suggests the next status, while the backend decides whether the
status should actually change.

------------------------------------------------------------------------

# Status Flow

``` text
Reported
    ↓
Under Review
    ↓
Verified
    ↓
Assigned
    ↓
In Progress
    ↓
Resolved
    ↓
Closed
```

## Status Definitions

  ------------------------------------------------------------------------
  Status                Changed By                   Trigger
  --------------------- ---------------------------- ---------------------
  Reported              Citizen                      New issue submitted

  Under Review          System/Moderator             Report enters
                                                     moderation queue

  Verified              Moderator or AI + Community  Sufficient evidence
                                                     confirms issue

  Assigned              Authority                    Department accepts
                                                     responsibility

  In Progress           Authority                    Repair work begins

  Resolved              Authority                    Work completed

  Closed                Community/System             Residents confirm
                                                     resolution
  ------------------------------------------------------------------------

------------------------------------------------------------------------

# System Architecture

``` text
Citizen
    │
    ▼
Create Report
    │
    ▼
Database (Current Status)
    │
    ├─────────────┐
    ▼             ▼
Backend Rules   Gemma
                    │
                    ▼
      Suggested Next Status + Confidence
                    │
                    ▼
        Backend Validation Rules
                    │
                    ▼
      Update Status (if allowed)
```

Gemma **never directly changes the database**.

------------------------------------------------------------------------

# Gemma's Role

Gemma analyzes:

-   New comments
-   Images
-   Official responses
-   Citizen updates

Example input:

> "Workers arrived today and started repairing the road."

Example output:

``` json
{
  "predicted_stage": "IN_PROGRESS",
  "confidence": 0.96,
  "reason": "Repair work has started."
}
```

The backend then decides whether to accept the recommendation.

------------------------------------------------------------------------

# Backend Rules

Example:

``` text
IF
Current Status == VERIFIED
AND
Gemma Confidence > 0.90
AND
Prediction == IN_PROGRESS

THEN

Status = IN_PROGRESS
```

The backend is always the final authority.

------------------------------------------------------------------------

# Community Verification

When an issue is reported:

Residents can click

✔ I can confirm this issue exists.

Once enough confirmations are received, the issue can automatically move
to **Verified**.

Optional:

Combine confirmation count with AI image analysis for higher confidence.

------------------------------------------------------------------------

# Resolution Confirmation

When the authority marks an issue as resolved:

Status becomes

``` text
Resolved (Pending Community Confirmation)
```

Nearby residents receive a notification.

Question:

> Has this issue actually been fixed?

Options:

-   👍 Yes
-   👎 No

Decision example:

``` text
15 Yes
2 No

↓

Closed
```

or

``` text
3 Yes
18 No

↓

Back to In Progress
```

This prevents false completion reports.

------------------------------------------------------------------------

# Event Timeline

Every status transition should create an immutable log.

Example:

``` text
Jul 30 10:21
Issue Reported

↓

Jul 30 10:35
Verified by Community

↓

Jul 31 09:20
Assigned to Road Department

↓

Aug 2 14:00
Repair Started

↓

Aug 4 11:00
Repair Completed

↓

Aug 5 18:00
Community Confirmed

↓

Closed
```

This provides transparency for both citizens and authorities.

------------------------------------------------------------------------

# Prompt Template for Gemma

``` text
You are analyzing updates for a civic issue.

Current Status:
Verified

New Update:
"Workers started repairing the drainage this morning."

Determine:

1. Evidence type
2. Suggested next status
3. Confidence (0-1)
4. Reason

Return JSON only.
```

Example output:

``` json
{
  "evidence_type": "repair_started",
  "next_status": "IN_PROGRESS",
  "confidence": 0.96,
  "reason": "The update explicitly states that repair work has begun."
}
```

------------------------------------------------------------------------

# Recommended Database Tables

## issues

``` text
id
title
description
category
location
current_status
created_at
updated_at
```

## status_history

``` text
id
issue_id
old_status
new_status
changed_by
reason
confidence
timestamp
```

## community_votes

``` text
id
issue_id
user_id
vote
created_at
```

## ai_predictions

``` text
id
issue_id
prediction
confidence
reason
raw_response
created_at
```

------------------------------------------------------------------------

# Key Design Principles

-   Backend owns the official status.
-   Gemma provides reasoning and recommendations.
-   Every status change is recorded.
-   Community participation increases trust.
-   Authorities remain accountable.
-   AI assists decision-making instead of replacing human oversight.

This hybrid design is transparent, scalable, and well-suited for a civic
engagement platform like **Nagorik Setu**.
