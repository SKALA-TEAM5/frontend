import { C } from '../../lib/theme';
import { isImageFile, makeThumbSvg } from '../../lib/evidence-utils';
import type { EvidenceFile } from '../../types/domain';
interface FileThumbProps {
    entry: EvidenceFile;
    size?: number;
}
export default function FileThumb({ entry, size = 56 }: FileThumbProps) {
    return (<div data-ui="file-thumb.1" style={{
            width: size,
            height: size,
            borderRadius: 12,
            overflow: 'hidden',
            background: C.g100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
        }}>
      {entry.previewUrl || isImageFile(entry.name) ? (<img data-ui="file-thumb.2" src={entry.previewUrl || `data:image/svg+xml;charset=UTF-8,${makeThumbSvg(entry.kind)}`} alt={entry.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>) : (<span data-ui="file-thumb.3" style={{ fontSize: 13, fontWeight: 800, color: C.g600 }}>문서</span>)}
    </div>);
}
