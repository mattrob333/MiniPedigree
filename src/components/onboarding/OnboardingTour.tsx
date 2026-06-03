import { useEffect, useMemo, useState } from "react";
import { OnboardingCard } from "./OnboardingCard";
import { onboardingStepIndex, onboardingSteps, type OnboardingStepConfig } from "./onboardingSteps";

interface TargetBox {
  top: number;
  left: number;
  width: number;
  height: number;
  label: string;
}

interface Props {
  open: boolean;
  startStepId?: string;
  hasWorkspace: boolean;
  onStepView?: (step: OnboardingStepConfig) => void;
  onAdvanceFromHome: (nextStepId: string) => void;
  onComplete: () => void;
  onSkip: () => void;
}

function findTarget(step: OnboardingStepConfig): HTMLElement | null {
  for (const selector of step.targetSelectors) {
    const el = document.querySelector(selector);
    if (el instanceof HTMLElement) return el;
  }
  return null;
}

export function OnboardingTour({
  open,
  startStepId,
  hasWorkspace,
  onStepView,
  onAdvanceFromHome,
  onComplete,
  onSkip,
}: Props) {
  const [index, setIndex] = useState(() => onboardingStepIndex(startStepId));
  const [target, setTarget] = useState<TargetBox | null>(null);
  const step = onboardingSteps[index] ?? onboardingSteps[0];

  useEffect(() => {
    if (!open) return;
    setIndex(onboardingStepIndex(startStepId));
  }, [open, startStepId]);

  useEffect(() => {
    if (!open) return;
    onStepView?.(step);
  }, [open, step, onStepView]);

  useEffect(() => {
    if (!open) return;
    const updateTarget = () => {
      const el = findTarget(step);
      if (!el) {
        setTarget(null);
        return;
      }
      const rect = el.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
      if (!visible) {
        setTarget(null);
        return;
      }
      setTarget({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        label: el.innerText.trim().replace(/\s+/g, " "),
      });
    };
    updateTarget();
    window.addEventListener("resize", updateTarget);
    window.addEventListener("scroll", updateTarget, true);
    const timer = window.setTimeout(updateTarget, 120);
    return () => {
      window.removeEventListener("resize", updateTarget);
      window.removeEventListener("scroll", updateTarget, true);
      window.clearTimeout(timer);
    };
  }, [open, step]);

  const targetStyle = useMemo(() => {
    if (!target) return undefined;
    const pad = 8;
    return {
      top: Math.max(8, target.top - pad),
      left: Math.max(8, target.left - pad),
      width: target.width + pad * 2,
      height: target.height + pad * 2,
    };
  }, [target]);

  if (!open) return null;

  const next = () => {
    const nextStep = onboardingSteps[index + 1];
    if (!nextStep) {
      onComplete();
      return;
    }
    if (nextStep.requiresWorkspace && !hasWorkspace) {
      onAdvanceFromHome(nextStep.id);
      return;
    }
    setIndex(index + 1);
  };

  return (
    <div className="onboarding-layer">
      <div className="onboarding-scrim" />
      {targetStyle && <div className="onboarding-target" style={targetStyle} aria-hidden />}
      {targetStyle && target?.label && (
        <div className="onboarding-target-label" style={targetStyle} aria-hidden>
          {target.label}
        </div>
      )}
      <OnboardingCard step={step} onNext={next} onSkip={onSkip} />
    </div>
  );
}
