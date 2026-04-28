import { C } from '../../lib/theme';
import { getCategoryLabels, makeThumbSvg } from '../../lib/mock-data';
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
    return (<div data-ui="features-project-tab-archive-preview.div-1" style={{ position: 'fixed', top: Math.min(hoverPreview.y, window.innerHeight - 240), left: Math.min(hoverPreview.x, window.innerWidth - 260), width: 240, background: C.white, border: `1px solid ${C.g200}`, borderRadius: 16, boxShadow: '0 12px 28px rgba(0,0,0,.16)', padding: 12, zIndex: 980, pointerEvents: 'none' }}>
      <div data-ui="features-project-tab-archive-preview.div-2" style={{ borderRadius: 12, overflow: 'hidden', background: C.g100, marginBottom: 10 }}>
        <img data-ui="features-project-tab-archive-preview.img-1" src={hoverPreview.entry.previewUrl || `data:image/svg+xml;charset=UTF-8,${makeThumbSvg(hoverPreview.entry.kind || 'site_photo')}`} alt={hoverPreview.entry.name} style={{ width: '100%', height: 150, objectFit: 'cover', display: 'block' }}/>
      </div>
      <div data-ui="features-project-tab-archive-preview.div-3" style={{ fontSize: 14, fontWeight: 800, color: C.g800, marginBottom: 6, wordBreak: 'break-all' }}>{hoverPreview.entry.name}</div>
      <div data-ui="features-project-tab-archive-preview.div-4" style={{ fontSize: 13, color: C.g400, lineHeight: 1.6 }}>
        {(hoverPreview.entry.categoryIds?.length ? getCategoryLabels(hoverPreview.entry.categoryIds).join(', ') : '')}
        {hoverPreview.entry.description ? ` · ${hoverPreview.entry.description}` : ''}
      </div>
    </div>);
}
