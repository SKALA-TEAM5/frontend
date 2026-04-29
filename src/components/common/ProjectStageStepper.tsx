import { C } from '../../lib/theme';
import { PROJECT_STAGE_DEFINITIONS } from '../../lib/project-stages';
interface ProjectStageStepperProps {
    currentStage: number;
    compact?: boolean;
}
export default function ProjectStageStepper({ currentStage, compact = false }: ProjectStageStepperProps) {
    return (<div data-ui="project-stage-stepper.1" style={{ display: 'grid', gridTemplateColumns: `repeat(${PROJECT_STAGE_DEFINITIONS.length}, minmax(0, 1fr))`, gap: compact ? 6 : 8, minWidth: 0 }}>
      {PROJECT_STAGE_DEFINITIONS.map((stage, index) => {
            const done = index < currentStage;
            const active = index === currentStage;
            const isLastStage = index === PROJECT_STAGE_DEFINITIONS.length - 1;
            return (<div data-ui="project-stage-stepper.2" key={stage.id} style={{ minWidth: 0, overflow: 'hidden' }}>
            <div data-ui="project-stage-stepper.3" style={{ display: 'flex', alignItems: 'center', gap: compact ? 5 : 6, marginBottom: 6, minWidth: 0 }}>
              <div data-ui="project-stage-stepper.4" style={{ width: compact ? 22 : 26, height: compact ? 22 : 26, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: compact ? 12 : 13, fontWeight: 900, color: done || active ? '#fff' : C.g400, background: done ? C.ok : active ? C.primary : C.g200 }}>
                {index + 1}
              </div>
              {!isLastStage && <div data-ui="project-stage-stepper.5" style={{ flex: 1, minWidth: 0, height: 4, borderRadius: 99, background: done ? C.ok : active ? C.light : C.g200 }}/>}
            </div>
            <div data-ui="project-stage-stepper.6" title={stage.label} style={{ fontSize: compact ? 12 : 12, fontWeight: 700, color: done || active ? C.g800 : C.g400, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {stage.label}
            </div>
          </div>);
        })}
    </div>);
}
