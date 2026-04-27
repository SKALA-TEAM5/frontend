import { C } from '../../lib/theme';
import { isImageFile, makeThumbSvg } from '../../lib/mock-data';
import type { EvidenceFile } from '../../types/domain';
interface FileThumbProps {
    entry: EvidenceFile;
    size?: number;
}
export default function FileThumb({ entry, size = 56 }: FileThumbProps) {
    return (<div data-ui="components-ui-file-thumb.div-1" style={{
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
      {entry.previewUrl || isImageFile(entry.name) ? (<img data-ui="components-ui-file-thumb.img-1" src={entry.previewUrl || `data:image/svg+xml;charset=UTF-8,${makeThumbSvg(entry.kind)}`} alt={entry.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>) : (<span data-ui="components-ui-file-thumb.span-1" style={{ fontSize: 11, fontWeight: 800, color: C.g600 }}>문서</span>)}
    </div>);
}
