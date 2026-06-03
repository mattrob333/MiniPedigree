export interface OnboardingStepConfig {
  id: "upload-team" | "company-profile" | "map-responsibilities" | "extract-tasks-build-agents" | "export-manifests";
  stepNumber: number;
  totalSteps: number;
  title: string;
  body: string;
  imageSrc: string;
  targetSelectors: string[];
  primaryLabel: string;
  requiresWorkspace: boolean;
}

export const onboardingSteps: OnboardingStepConfig[] = [
  {
    id: "upload-team",
    stepNumber: 1,
    totalSteps: 5,
    title: "Upload Your Team",
    body: "Upload a CSV of your people to instantly generate an interactive org chart you can explore, map, and build from.",
    imageSrc: "/onboarding/upload-team.png",
    targetSelectors: ['[data-tour="upload-team"]'],
    primaryLabel: "Next",
    requiresWorkspace: false,
  },
  {
    id: "company-profile",
    stepNumber: 2,
    totalSteps: 5,
    title: "Fill Out Your Company Profile",
    body: "Add your company URL, goals, current state, bottlenecks, and tools so Pedigree can ground responsibility mapping in real context.",
    imageSrc: "/onboarding/company-profile.png",
    targetSelectors: ['[data-tour="company-profile"]'],
    primaryLabel: "Next",
    requiresWorkspace: true,
  },
  {
    id: "map-responsibilities",
    stepNumber: 3,
    totalSteps: 5,
    title: "Map Responsibilities Top-Down",
    body: "Start with the CEO and direct reports, then cascade through departments until ownership is clear across the org.",
    imageSrc: "/onboarding/map-responsibilities.png",
    targetSelectors: ['[data-tour="map-responsibilities"]'],
    primaryLabel: "Next",
    requiresWorkspace: true,
  },
  {
    id: "extract-tasks-build-agents",
    stepNumber: 4,
    totalSteps: 5,
    title: "Extract Tasks and Build Agents",
    body: "Pedigree breaks responsibilities into tasks, identifies safe delegation, and helps compile governed agents from clearly scoped work.",
    imageSrc: "/onboarding/task-to-agent.png",
    targetSelectors: ['[data-tour="agent-candidates"]', '[data-tour="delegatable-tasks"]'],
    primaryLabel: "Next",
    requiresWorkspace: true,
  },
  {
    id: "export-manifests",
    stepNumber: 5,
    totalSteps: 5,
    title: "Export Your Agent Manifests",
    body: "Choose the runtime package that fits your workflow, then export the manifest that launches the governed agent.",
    imageSrc: "/onboarding/manifest-runtime.svg",
    targetSelectors: ['[data-tour="agent-runtime-selector"]', '[data-tour="export"]'],
    primaryLabel: "Finish",
    requiresWorkspace: true,
  },
];

export function onboardingStepIndex(stepId?: string): number {
  const idx = onboardingSteps.findIndex((step) => step.id === stepId);
  return idx >= 0 ? idx : 0;
}
