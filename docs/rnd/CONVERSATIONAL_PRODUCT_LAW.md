# IntelliQ — Conversational Product Law and Pilot Priority

Status: founder-ratified product direction, 2026-09-18.

This document records product law and pilot priority. It is not permission to create parallel truth stores, action owners, or intelligence systems. Reuse existing canonical owners, evidence, Inquiry, Focus, outcome, learning, privacy, authority, retrieval, and Composer architecture.

## Product thesis

The human should not operate IntelliQ's state machine.

Highs, Lows, Inquiries, Focuses, Forum, and Library are human-facing views into one intelligence system, not separate workflows the person must administer. Composer is the primary interaction surface on Home and inside each bucket/object.

The screen supplies context; it does not constrain what the person may naturally say.

Examples of concise mobile nudges:
- Home: "What's on your mind?"
- Highs: "What's going well?"
- Lows: "What have you noticed?"
- Inquiries: "What are you wondering?"
- Focuses: "What do you want to work on?"
- Library: "What are you looking for?"
- Bound object: "Talk to IntelliQ..."

Placeholders are nudges, never schemas or modes. They must fit the real mobile Composer without clipping.

Explicit natural requests such as "create an Inquiry about..." remain valid, but the UI should not force forms/object administration. Remove redundant creation UX such as a prominent "Start Focus" where Composer already owns the interaction.

## Methodical assistant

The methodical assistant is the product, not post-pilot polish.

IntelliQ asks questions to reduce meaningful uncertainty, not merely to continue conversation. It uses authorized context, evidence, history, hypotheses, unknowns, previous outcomes, organizational learning, and when justified external research. It should know when another question has low information value and move forward.

General conversational loop:

Experience -> Understand -> Clarify/Ground when needed -> Identify meaningful uncertainty -> Inquire/investigate -> Offer justified candidate suggestions when enough is known -> Human chooses -> Focus/action -> Observe outcome -> Learn -> Better next decision / new A -> repeat toward B.

A suggestion is not truth, evidence, action, or a Focus. Human deliberate choice crosses the threshold into Focus/action. The model interprets and converses; deterministic/governed owners retain authority to validate, bind referents, confirm consequential changes, and write canonical state.

Do not implement this as a second brain, a questionnaire, a hard-coded sequence, or an expanding language regex system. The method should orchestrate existing IntelliQ intelligence.

The assistant should continually determine the useful next move:
- Is something important unclear? Ask a discriminating question.
- Is enough known to investigate with existing evidence/history instead of asking the human? Do that.
- Would a group contribution reduce uncertainty? Offer/use the governed Forum path.
- Is there enough understanding to offer a small number of reasoned possibilities? Suggest them and expose their basis.
- Has the human chosen an action? Stop interrogating and let them act.
- Has something happened? Understand/record the outcome.
- Does the outcome change current understanding? Learn and adjust.
- Is curiosity/watch/no action the honest next state? Allow it.

## Focus law

A Focus is the deliberate-action phase, not another observation bucket and not a Focus factory.

Before a Focus, the central question is "What is worth working on?" Once a Focus exists, the central question becomes "How is this going, and what are we learning?"

Inside a Focus the loop is:

Focus -> Act -> Observe -> Understand -> Adjust -> Act again -> Outcome -> Learn.

Prefer evolving the existing Focus while the desired B is materially the same. Actions, experiments, tactics, and adjustments within that journey should not become new Focuses merely because they are new steps.

A new Focus may emerge only when learning leads to a meaningfully different thing to work toward and the human deliberately chooses it. Preserve the relationship/history between the old Focus, resulting Inquiry/learning, and new Focus using existing canonical relationship vocabulary.

Focus UI should emphasize:
- what you are working toward;
- where things stand;
- what has been tried, when present;
- what happened, when present;
- what has been learned, when present;
- Composer for what happens next.

Complexity should be earned by actual history. Do not expose empty research-report machinery on day one.

## Surface law

Home: what matters now. A calm current briefing, not a truth-maintenance-system readout.

Highs: what is going well.

Lows: what deserves attention.

Inquiries: genuine questions IntelliQ/person/team is trying to understand. Onboarding context may seed curiosity but should not become a wall of hollow Inquiry cards simply because IntelliQ lacks a read.

Focuses: what the person/team has deliberately chosen to work on. Focuses should be narrow enough to represent a meaningful B; if an input contains several distinct goals, conversation may clarify which is worth working on first.

Forum: what authorized people are thinking about together. Not a generic social feed.

Library: things the person wanted to find again. References live canonical things; it is not IntelliQ's memory gate. Do not make users organize an empty Library. Folder organization is secondary and can increasingly be conversational.

Attachments are conversational turns: attach -> talk -> reason. Parser/retention machinery stays underneath.

Privacy should be expressed in human language such as "Private to you." Architecture guarantees remain underneath unless they are needed to make an informed consequential choice.

## UI subtraction law

Do not put a permanent button on screen merely because a backend action exists. If a person can naturally tell IntelliQ what they want, Composer is normally the interface.

Remove/demote redundant state-machine controls and technical explanations where they do not help a person make a real choice. Preserve minimal confirmation where audience, authority, truth standing, or consequential canonical state changes.

If a normal person must understand how IntelliQ stores, classifies, links, corroborates, indexes, or transitions something in order to use it, the product has exposed too much machinery.

## Delivery priority

### Coach handoff — Monday 2026-09-21

Coach should receive:
1. Methodical IntelliQ: natural conversation that makes purposeful next moves rather than generic Q&A or endless questioning.
2. Polished conversational UI: Composer dominant, mobile placeholders not clipped, redundant "Start Focus" removed, Home/Inquiry/Focus/Library copy simplified, Focus experience conversational, technical kernel explanations hidden from ordinary use.
3. Existing privacy/authority/canonical/product-promise gates remain intact.

The acceptance question is:

Can Coach talk naturally to IntelliQ, and does IntelliQ methodically help him understand something and decide what to do next through a polished interface that does not require understanding the machinery?

### Player pilot

Before players receive the pilot, the full direction above should work end-to-end and be hardened through real use: understanding/inquiry -> justified suggestion -> human choice -> Focus/action -> outcome -> learning, including privacy, persistence/reload, multiple people/audiences, imperfect evidence, attachments, and language continuity.

### During/after pilot — Priority R&D

Capabilities that do not block the core methodical conversational product belong in priority R&D and may be improved during/after the pilot where safe. Examples include richer human-facing connection visualization/exploration, deeper graph/Web-of-Webs presentation, advanced dashboards/analytics, sophisticated Library organization, broader organizational-learning views, and other expansion work.

Underlying canonical relationships needed for continuity are not deferred. Their richer visualization/manipulation is.

R&D is not an implementation queue. Promotion into production still requires the repository's normal governance/brief process.

## Pilot principle

Coach/player feedback should be feedback about IntelliQ itself, not feedback about an unfinished form-driven interface wrapped around the kernel.

The product should feel:

Conversational on top. Rigorous underneath.

The person talks. IntelliQ handles the machinery.
