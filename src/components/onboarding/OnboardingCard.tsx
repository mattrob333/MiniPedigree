import { Icon } from "../Icon";
import { ExportManifestTourArt } from "./ExportManifestTourArt";
import type { OnboardingStepConfig } from "./onboardingSteps";

interface Props {
  step: OnboardingStepConfig;
  onNext: () => void;
  onSkip: () => void;
}

export function OnboardingCard({ step, onNext, onSkip }: Props) {
  return (
    <section className="onboarding-card" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="onboarding-art-wrap">
        {step.id === "export-manifests" ? (
          <ExportManifestTourArt />
        ) : (
          <img className="onboarding-art" src={step.imageSrc} alt="" draggable={false} />
        )}
      </div>
      <div className="onboarding-step-label">Step {step.stepNumber} of {step.totalSteps}</div>
      <h2 id="onboarding-title">{step.title}</h2>
      <p>{step.body}</p>
      <button className="onboarding-primary" onClick={onNext}>
        {step.primaryLabel}
        <Icon name={step.primaryLabel === "Finish" ? "checkmark" : "arrow-right"} size={15} />
      </button>
      <button className="onboarding-skip" onClick={onSkip}>Skip tour</button>
    </section>
  );
}
