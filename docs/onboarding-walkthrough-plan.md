# MiniPedigree: Onboarding Walkthrough Implementation Plan

## Purpose

Add a first-time onboarding walkthrough that helps users understand the fastest path to value after they upload a company CSV and see the org chart.

The walkthrough should feel premium, useful, and lightweight. It should not feel like a training manual. It should help the user understand what to do next and why each step matters.

The tour should teach the user this core flow:

```text
Company Profile → Map Responsibilities → Extract Tasks + Build Agents → Choose Agent Manifest
```

## Product principle

The user should never have to wonder, "What do I do now?"

The walkthrough should point to the real controls inside the UI and explain each action in plain business language:

- What this step does
- Why it matters
- What good output looks like
- What the user should do next

## Recommended onboarding pattern

Use a short, skippable product tour with:

- 4 main steps
- Dark overlay behind the card
- Highlighted target UI element
- Optional arrow or spotlight around target
- One illustration per step
- Progress label: `Step X of 4`
- Primary button: `Next` or `Finish`
- Secondary link: `Skip tour`
- Restart option from Help / Settings later

The uploaded inspiration file recommends the same general pattern: short cards, arrows/highlights pointing to UI targets, clear explanation of what and why, illustrations, skippability, first-login trigger, and a restartable tour option. It also recommends keeping the tour to roughly 3–6 steps and tracking completion/drop-off events.

## When the tour should appear

Trigger the walkthrough after:

1. The user has created or opened a company workspace.
2. A CSV has been uploaded or a demo company has been loaded.
3. The org chart is visible for the first time.
4. `hasCompletedOnboarding` is false.

Do not show the tour before the org chart exists. The first useful moment is after the user sees the company as an org map.

## Storage behavior

Use both:

- Local storage fallback
- User/workspace-level persisted flag when backend persistence is configured

Suggested keys:

```ts
hasCompletedOnboarding: boolean;
hasSkippedOnboarding: boolean;
lastOnboardingStep?: string;
onboardingCompletedAt?: string;
```

Store per user and per workspace where possible. A user may want to see the tour again for a new client workspace.

## Analytics events

Track:

```text
onboarding_started
onboarding_step_viewed
onboarding_step_completed
onboarding_skipped
onboarding_completed
onboarding_restarted
```

Include:

```ts
{
  workspace_id: string;
  company_name: string;
  step_id: string;
  step_number: number;
  target: string;
}
```

## Recommended library

Because the app is React + Vite, use one of:

1. `react-joyride`
2. `driver.js`
3. `shepherd.js`

Recommendation: use `driver.js` if you want fast, highly controllable spotlight/highlight behavior. Use `react-joyride` if you want a React-native step array and less custom positioning work.

## Visual design direction

Match Pedigree's current dark interface:

- Deep navy / near-black app background
- Cyan / teal glow accents
- Rounded modal cards
- Subtle border and shadow
- Crisp product-style illustrations
- Dotted org-map background remains visible but dimmed
- Target button glows or receives a spotlight ring
- Copy is centered inside a premium card

Do not use the older orange Slack-style visual treatment except as structural inspiration. Pedigree should feel more like a premium AI governance product than a generic SaaS demo.

---

# Tour Flow

## Step 0: Optional welcome card

This can be skipped if the product should go straight into Step 1.

### Target

No specific target, or target the page title / org map header.

### Title

`Welcome to Pedigree`

### Body

`You have loaded your organization. This quick tour will show you how to add company context, map responsibility ownership, extract delegatable tasks, and compile governed agents.`

### Primary CTA

`Start tour`

### Secondary CTA

`Skip tour`

### Illustration

An org chart transforming into governed agent cards.

---

## Step 1 of 4: Fill Out Your Company Profile

### Target UI element

Top action button:

```css
[data-tour="company-profile"]
```

Existing visible control: `Company Profile` button.

### User action

Click `Company Profile` and add context.

### Why this step matters

Pedigree needs company context before it can responsibly interpret roles, responsibilities, priorities, tools, and agent opportunities.

Without context, the system can still parse generic tasks, but it cannot understand what matters strategically to that business.

### Card copy

Eyebrow:

```text
Step 1 of 4
```

Title:

```text
Fill Out Your Company Profile
```

Body:

```text
Add your company URL, goals, current state, bottlenecks, and tools so Pedigree can ground responsibility mapping and agent creation in real business context.
```

Primary button:

```text
Next
```

Secondary link:

```text
Skip tour
```

### Illustration brief

Create a dark-mode isometric illustration showing:

- Company building or brand card
- Website URL field
- Goals / target icon
- Clipboard or form fields
- Tool icons such as CRM, docs, Slack, or database
- Dotted lines connecting these to a central company context profile

### Implementation note

This step should highlight the `Company Profile` button with a cyan glow. Clicking the button may optionally pause the tour and resume once the user saves or closes the company profile screen.

---

## Step 2 of 4: Map Responsibilities Top-Down

### Target UI element

Top action button:

```css
[data-tour="map-responsibilities"]
```

Existing visible control: `Map Responsibilities` button.

### User action

Start a responsibility mapping session.

### What this step teaches

This is the most important educational moment in the walkthrough.

The user needs to understand that Pedigree is not asking them to randomly type job descriptions. The workflow is a structured discovery process that starts at the top of the org and cascades downward.

### Business explanation

Start with the CEO and the CEO's direct reports. Put them in a Google Meet, Zoom call, or similar discovery session. The goal is to clarify:

- What outcomes the CEO believes each executive owns
- What responsibilities each direct report actually owns
- Where ownership is unclear or overlapping
- Which departments and teams roll up under each leader
- Which duties, recurring tasks, and decisions belong to each role
- Which work might be safely delegated to an AI agent later

Then repeat the process one layer down:

- Department head + their direct reports
- Manager + their team members
- Individual contributor role if needed

This gives Pedigree a reliable responsibility map from the CEO level down to departments and teams.

### Card copy

Eyebrow:

```text
Step 2 of 4
```

Title:

```text
Map Responsibilities Top-Down
```

Body:

```text
Start with the CEO and direct reports. Clarify who owns which outcomes, then repeat the process at each level with department heads and their teams until responsibility is clear across the org.
```

Primary button:

```text
Next
```

Secondary link:

```text
Skip tour
```

### Tooltip variant copy

Use this if the app uses a smaller side-card instead of a centered card:

```text
Start here. Pedigree works best when responsibility mapping begins with the CEO and direct reports, then cascades down through each department. The goal is to capture who owns each outcome, duty, decision, and repeatable task.
```

### Illustration brief

Create a dark-mode illustration showing:

- CEO node at the top
- Direct reports below
- Department/team groups below each leader
- Video meeting tiles to suggest Zoom/Google Meet
- Speech bubbles such as `Define outcomes`, `Align ownership`, `Clarify duties`
- Dotted arrows cascading downward
- Small responsibility cards attached to leaders

### Target behavior

Highlight the `Map Responsibilities` button in the top action bar.

When the user clicks it:

1. Open the existing mapping/session modal.
2. Recommend the top-level session first.
3. Show CEO/leadership session as the first recommended path.
4. After completion, guide the user toward the next recommended department sessions.

### Plain-language guidance shown inside mapping modal

Add helper copy near the session setup area:

```text
Recommended first session: CEO + direct reports.

Ask: What outcomes does each leader own? What recurring duties and decisions belong to their role? Where does ownership overlap or need clarification?
```

### Suggested discovery questions for Step 2 session

For CEO + direct reports:

```text
1. What are the major outcomes this company needs each leader to own?
2. Which responsibilities clearly belong to each department?
3. Where do responsibilities overlap between leaders?
4. What recurring meetings, reports, reviews, approvals, or operating rhythms does each leader own?
5. What decisions must stay human-owned?
6. What repeatable work could be prepared, summarized, monitored, drafted, or flagged by AI?
7. What systems or documents are the source of truth for each responsibility?
```

For department sessions:

```text
1. What outcomes is this department responsible for?
2. Which team members own each recurring duty?
3. What work happens weekly, monthly, or when a trigger occurs?
4. What work is manual, repetitive, or status-heavy?
5. What work requires judgment, approval, compliance review, or customer commitment?
6. What tools, documents, or data sources does the team use?
7. What would a useful AI assistant or agent prepare before a human reviews it?
```

### Why Step 2 cannot be skipped conceptually

Users can skip the tour, but the product should still nudge them toward responsibility mapping because this is the core data layer. Without responsibility mapping, the system cannot safely determine which tasks should become agents.

---

## Step 3 of 4: Extract Tasks and Build Agents

### Target UI element

Options:

```css
[data-tour="delegatable-tasks"]
[data-tour="agent-candidates"]
[data-tour="agents-tab"]
```

Use whichever is easiest based on the current screen.

### User action

Review extracted tasks and select a safe delegatable task to compile into an agent.

### Card copy

Eyebrow:

```text
Step 3 of 4
```

Title:

```text
Extract Tasks and Build Agents
```

Body:

```text
Pedigree breaks responsibilities into concrete tasks, identifies what can be delegated, and helps you compile governed agents from the work that is safe, repeatable, and clearly scoped.
```

Primary button:

```text
Next
```

Secondary link:

```text
Skip tour
```

### Illustration brief

Show a three-part flow:

```text
Responsibility → Extracted Tasks → Agent Candidates
```

Include:

- Responsibility card
- Checklist of extracted tasks
- Agent candidate cards
- Shield / governance icon
- Labels like `Safe`, `Approval Required`, `Blocked`

### Implementation note

This step should explain the delegation categories:

- Delegatable: safe for agent execution or drafting
- Approval required: agent may prepare, human must approve
- Not delegatable: must remain human-owned

---

## Step 4 of 4: Choose Your Agent Manifest

### Target UI element

Options:

```css
[data-tour="export"]
[data-tour="manifest-runtime"]
[data-tour="agent-runtime-selector"]
```

Existing visible control: `Export` button, or future runtime selector inside the agent creation flow.

### User action

Choose which runtime package to generate.

### Card copy

Eyebrow:

```text
Step 4 of 4
```

Title:

```text
Choose Your Agent Manifest
```

Body:

```text
Select the runtime that fits your workflow, then configure tools, approvals, schedule, delivery, and export the manifest package that will launch the agent.
```

Primary button:

```text
Finish
```

Secondary link:

```text
Skip tour
```

### Illustration brief

Show:

- A manifest file, preferably `agent-manifest.yaml`
- Runtime tiles:
  - Hermes
  - Pedigree Standard
  - OpenAI
  - Claude
  - Generic
- Small connected modules:
  - Tools
  - Approvals
  - Schedule
  - Delivery

### Implementation note

This step should connect directly to the Hermes bridge work. The user should understand that agent creation is not just a prompt. It is a deployable manifest package.

---

# Completion screen

After Step 4, show a short completion state.

### Title

```text
You're ready to build governed agents
```

### Body

```text
You now know the flow: add company context, map responsibilities, extract tasks, and export the right agent manifest for your runtime.
```

### CTA

```text
Start mapping responsibilities
```

Optional celebration: subtle glow, not excessive confetti. This product should feel executive/enterprise, not toy-like.

---

# Suggested component structure

## New files

```text
src/components/onboarding/OnboardingTour.tsx
src/components/onboarding/onboardingSteps.ts
src/components/onboarding/OnboardingCard.tsx
src/components/onboarding/onboardingIllustrations.ts
src/lib/onboarding.ts
```

## Updated files

```text
src/App.tsx
src/components/Topbar.tsx
src/components/CompanyProfile.tsx
src/components/Drawer.tsx
src/components/ManifestScreen.tsx
src/types.ts
src/lib/persist.ts
```

## Suggested types

```ts
export interface OnboardingState {
  hasCompletedOnboarding: boolean;
  hasSkippedOnboarding: boolean;
  lastStepId?: string;
  completedAt?: string;
}

export interface OnboardingStepConfig {
  id: string;
  stepNumber: number;
  totalSteps: number;
  title: string;
  body: string;
  targetSelector?: string;
  placement?: "center" | "top" | "bottom" | "left" | "right";
  primaryLabel: string;
  secondaryLabel: string;
  illustrationKey: string;
  highlightTarget?: boolean;
}
```

## Step config draft

```ts
export const onboardingSteps: OnboardingStepConfig[] = [
  {
    id: "company-profile",
    stepNumber: 1,
    totalSteps: 4,
    title: "Fill Out Your Company Profile",
    body: "Add your company URL, goals, current state, bottlenecks, and tools so Pedigree can ground responsibility mapping and agent creation in real business context.",
    targetSelector: '[data-tour="company-profile"]',
    placement: "center",
    primaryLabel: "Next",
    secondaryLabel: "Skip tour",
    illustrationKey: "company-profile",
    highlightTarget: true,
  },
  {
    id: "map-responsibilities",
    stepNumber: 2,
    totalSteps: 4,
    title: "Map Responsibilities Top-Down",
    body: "Start with the CEO and direct reports. Clarify who owns which outcomes, then repeat the process at each level with department heads and their teams until responsibility is clear across the org.",
    targetSelector: '[data-tour="map-responsibilities"]',
    placement: "center",
    primaryLabel: "Next",
    secondaryLabel: "Skip tour",
    illustrationKey: "map-responsibilities",
    highlightTarget: true,
  },
  {
    id: "extract-tasks-build-agents",
    stepNumber: 3,
    totalSteps: 4,
    title: "Extract Tasks and Build Agents",
    body: "Pedigree breaks responsibilities into concrete tasks, identifies what can be delegated, and helps you compile governed agents from the work that is safe, repeatable, and clearly scoped.",
    targetSelector: '[data-tour="agent-candidates"]',
    placement: "center",
    primaryLabel: "Next",
    secondaryLabel: "Skip tour",
    illustrationKey: "task-to-agent",
    highlightTarget: true,
  },
  {
    id: "choose-agent-manifest",
    stepNumber: 4,
    totalSteps: 4,
    title: "Choose Your Agent Manifest",
    body: "Select the runtime that fits your workflow, then configure tools, approvals, schedule, delivery, and export the manifest package that will launch the agent.",
    targetSelector: '[data-tour="export"]',
    placement: "center",
    primaryLabel: "Finish",
    secondaryLabel: "Skip tour",
    illustrationKey: "manifest-runtime",
    highlightTarget: true,
  },
];
```

---

# Required data-tour attributes

Add these to existing buttons/areas:

```tsx
<button data-tour="company-profile">Company Profile</button>
<button data-tour="map-responsibilities">Map Responsibilities</button>
<button data-tour="export">Export</button>
<div data-tour="agent-candidates">...</div>
<div data-tour="delegatable-tasks">...</div>
<div data-tour="agents-tab">...</div>
```

For components that may not exist yet, add the attribute once the component is created.

---

# UX details

## Copy tone

Use:

- Clear
- Executive-friendly
- Operational
- Short
- Confidence-building

Avoid:

- Cute language
- Overly technical language
- Long paragraphs
- Too many steps
- Anything that makes the workflow feel harder than it is

## Step length

Each step body should stay under roughly 35 words in the visible card.

Put deeper explanation in helper text, tooltips, or documentation, not the main tour card.

## Skip behavior

If the user clicks `Skip tour`:

- Close the tour immediately.
- Set `hasSkippedOnboarding = true`.
- Do not show again automatically for that workspace.
- Let user restart from Help / Settings.

## Auto-resume behavior

If the user refreshes during the tour:

- Resume from `lastStepId` if possible.
- If the target element is missing, fall back to the first available step or close gracefully.

## Mobile behavior

On smaller screens:

- Use centered modal cards.
- Avoid arrows that depend on exact desktop positions.
- Highlight target only when visible.

---

# Implementation phases

## Phase 1: Basic tour

- Add step config.
- Add tour component.
- Add data-tour attributes.
- Trigger after org map first appears.
- Add localStorage persistence.

## Phase 2: Polished visuals

- Add custom illustrations.
- Add target glow/spotlight.
- Match Pedigree modal styling.
- Add progress label and skip behavior.

## Phase 3: Deeper workflow integration

- Step 1 can open Company Profile.
- Step 2 can open Map Responsibilities.
- Step 3 can focus on agent candidates after mapping exists.
- Step 4 can open runtime/manifest export.

## Phase 4: Analytics + restart

- Track step events.
- Add Help menu restart action.
- Persist completion per user/workspace.

---

# Definition of done

The onboarding walkthrough is complete when:

1. It appears automatically after the org chart is first loaded.
2. It has exactly four clear steps.
3. Each step highlights or visually relates to a real UI control.
4. Step 2 clearly teaches the top-down responsibility mapping workflow.
5. Users can skip the tour.
6. Users can restart the tour later.
7. Completion state is stored.
8. The visual style matches Pedigree's dark UI.
9. The copy explains the path to value without overwhelming the user.
10. The walkthrough helps a first-time user understand what to do next.

---

# North star

The walkthrough should make the app feel obvious:

```text
First, give Pedigree company context.
Then map who owns what.
Then let Pedigree find safe, repeatable tasks.
Then export governed agents for the runtime you use.
```

That is the product story the tour needs to teach.
