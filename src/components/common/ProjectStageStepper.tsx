import { C } from '../../lib/theme';
import { PROJECT_STAGE_DEFINITIONS } from '../../lib/project-stages';
interface ProjectStageStepperProps {
    currentStage: number;
    compact?: boolean;
}
export default function ProjectStageStepper({ currentStage, compact = false }: ProjectStageStepperProps) {
    return (<div data-ui="components-common-project-stage-stepper.div-1" style={{ display: 'grid', gridTemplateColumns: `repeat(${PROJECT_STAGE_DEFINITIONS.length}, minmax(0, 1fr))`, gap: compact ? 8 : 12 }}>
      {PROJECT_STAGE_DEFINITIONS.map((stage, index) => {
            const done = index < currentStage;
            const active = index === currentStage;
            const isLastStage = index === PROJECT_STAGE_DEFINITIONS.length - 1;
            return (<div data-ui="components-common-project-stage-stepper.div-2" key={stage.id} style={{ minWidth: 0 }}>
            <div data-ui="components-common-project-stage-stepper.div-3" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div data-ui="components-common-project-stage-stepper.div-4" style={{ width: compact ? 22 : 26, height: compact ? 22 : 26, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: compact ? 10 : 11, fontWeight: 900, color: done || active ? '#fff' : C.g400, background: done ? C.ok : active ? C.primary : C.g200 }}>
                {index + 1}
              </div>
              {!isLastStage && <div data-ui="components-common-project-stage-stepper.connector-line" style={{ flex: 1, height: 4, borderRadius: 99, background: done ? C.ok : active ? C.light : C.g200 }}/>}
            </div>
            <div data-ui="components-common-project-stage-stepper.div-6" style={{ fontSize: compact ? 10 : 11, fontWeight: 700, color: done || active ? C.g800 : C.g400, lineHeight: 1.45 }}>
              {stage.label}
            </div>
          </div>);
        })}
    </div>);
}
