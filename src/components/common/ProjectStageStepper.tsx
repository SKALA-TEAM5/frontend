import { C } from '../../lib/theme';
import { PROJECT_STAGE_DEFINITIONS } from '../../lib/project-stages';
interface ProjectStageStepperProps {
    currentStage: number;
    compact?: boolean;
}
const STAGE_COLORS = [
    '#BFE8C9',
    '#9FDBB3',
    '#7FCF9E',
    '#5FBE87',
    '#45A972',
    '#2E8D5E',
    '#1F7048',
    '#145536',
];
export default function ProjectStageStepper({ currentStage, compact = false }: ProjectStageStepperProps) {
    return (<div data-ui="project-stage-stepper.1" style={{ display: 'grid', gridTemplateColumns: `repeat(${PROJECT_STAGE_DEFINITIONS.length}, minmax(0, 1fr))`, gap: compact ? 6 : 8, minWidth: 0 }}>
      {PROJECT_STAGE_DEFINITIONS.map((stage, index) => {
            const done = index < currentStage;
            const active = index === currentStage;
            const isLastStage = index === PROJECT_STAGE_DEFINITIONS.length - 1;
            const stageColor = STAGE_COLORS[index] || C.primary;
            const nextStageColor = STAGE_COLORS[index + 1] || stageColor;
            const visible = done || active;
            return (<div data-ui="project-stage-stepper.2" key={stage.id} style={{ minWidth: 0, overflow: 'hidden' }}>
            <div data-ui="project-stage-stepper.3" style={{ display: 'flex', alignItems: 'center', gap: compact ? 5 : 6, marginBottom: 6, minWidth: 0 }}>
              <div data-ui="project-stage-stepper.4" style={{ width: compact ? 22 : 26, height: compact ? 22 : 26, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: compact ? 12 : 13, fontWeight: 900, color: visible ? '#fff' : C.g400, background: visible ? stageColor : C.g100, border: visible ? 'none' : `1px solid ${C.g200}` }}>
                {index + 1}
              </div>
              {!isLastStage && <div data-ui="project-stage-stepper.5" style={{ flex: 1, minWidth: 0, height: 4, borderRadius: 99, background: done ? `linear-gradient(90deg, ${stageColor}, ${nextStageColor})` : active ? stageColor : C.g200 }}/>}
            </div>
            <div data-ui="project-stage-stepper.6" title={stage.label} style={{ fontSize: compact ? 12 : 12, fontWeight: 700, color: visible ? C.g800 : C.g400, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {stage.label}
            </div>
          </div>);
        })}
    </div>);
}
