import { C } from '../../lib/theme';
import { getCategoryLabels, makeThumbSvg } from '../../lib/evidence-utils';
import type { EvidenceFile } from '../../types/domain';
interface ArchivePreviewProps {
    hoverPreview: {
        entry: EvidenceFile;
        x: number;
        y: number;
    } | null;
}
export default function ArchivePreview({ hoverPreview }: ArchivePreviewProps) {
    if (!hoverPreview)
        return null;
    const validation = hoverPreview.entry.visionValidation;
    return (<div data-ui="archive-preview.1" style={{ position: 'fixed', top: Math.min(hoverPreview.y, window.innerHeight - 240), left: Math.min(hoverPreview.x, window.innerWidth - 260), width: 240, background: C.white, border: `1px solid ${C.g200}`, borderRadius: 16, boxShadow: '0 12px 28px rgba(0,0,0,.16)', padding: 12, zIndex: 980, pointerEvents: 'none' }}>
      <div data-ui="archive-preview.2" style={{ borderRadius: 12, overflow: 'hidden', background: C.g100, marginBottom: 10 }}>
        <img data-ui="archive-preview.3" src={hoverPreview.entry.previewUrl || `data:image/svg+xml;charset=UTF-8,${makeThumbSvg(hoverPreview.entry.kind || 'site_photo')}`} alt={hoverPreview.entry.name} style={{ width: '100%', height: 150, objectFit: 'cover', display: 'block' }}/>
      </div>
      <div data-ui="archive-preview.4" style={{ fontSize: 14, fontWeight: 800, color: C.g800, marginBottom: 6, wordBreak: 'break-all' }}>{hoverPreview.entry.name}</div>
      <div data-ui="archive-preview.5" style={{ fontSize: 13, color: C.g400, lineHeight: 1.6 }}>
        {(hoverPreview.entry.categoryIds?.length ? getCategoryLabels(hoverPreview.entry.categoryIds).join(', ') : '')}
        {hoverPreview.entry.description ? ` · ${hoverPreview.entry.description}` : ''}
      </div>
      {validation && (
        <div style={{ marginTop: 8, borderRadius: 10, padding: '8px 9px', background: validation.status === 'suitable' ? '#F4FBF6' : C.dangerBg, color: validation.status === 'suitable' ? C.ok : C.danger, fontSize: 12, fontWeight: 900, lineHeight: 1.45 }}>
          {validation.summary}
        </div>
      )}
    </div>);
}
