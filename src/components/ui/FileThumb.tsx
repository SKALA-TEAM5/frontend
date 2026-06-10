import { useEffect, useState, type CSSProperties } from 'react';
import { C } from '../../lib/theme';
import { isImageFile, makeThumbSvg } from '../../lib/evidence-utils';
import type { EvidenceFile } from '../../types/domain';

interface FileThumbProps {
    entry: EvidenceFile;
    size?: number;
}

interface AuthenticatedPreviewImageProps {
    src?: string;
    fallbackSrc: string;
    alt: string;
    style?: CSSProperties;
    dataUi?: string;
}

const shouldFetchWithCredentials = (src?: string) => {
    if (!src) return false;
    return src.startsWith('http://') || src.startsWith('https://') || src.startsWith('/');
};

export function AuthenticatedPreviewImage({ src, fallbackSrc, alt, style, dataUi }: AuthenticatedPreviewImageProps) {
    const [objectUrl, setObjectUrl] = useState('');
    const needsAuthenticatedFetch = shouldFetchWithCredentials(src);
    const imageSrc = objectUrl || (needsAuthenticatedFetch ? fallbackSrc : src || fallbackSrc);

    useEffect(() => {
        if (!src || !needsAuthenticatedFetch) {
            setObjectUrl('');
            return;
        }

        const controller = new AbortController();
        let isActive = true;
        let nextObjectUrl = '';

        setObjectUrl('');
        fetch(src, { credentials: 'include', signal: controller.signal })
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Preview request failed with ${response.status}`);
                }
                return response.blob();
            })
            .then((blob) => {
                nextObjectUrl = URL.createObjectURL(blob);
                if (isActive) {
                    setObjectUrl(nextObjectUrl);
                    return;
                }
                URL.revokeObjectURL(nextObjectUrl);
            })
            .catch((error) => {
                if (error instanceof DOMException && error.name === 'AbortError') {
                    return;
                }
                if (isActive) {
                    setObjectUrl('');
                }
            });

        return () => {
            isActive = false;
            controller.abort();
            if (nextObjectUrl) {
                URL.revokeObjectURL(nextObjectUrl);
            }
        };
    }, [src, needsAuthenticatedFetch]);

    return <img data-ui={dataUi} src={imageSrc} alt={alt} style={style} />;
}

export default function FileThumb({ entry, size = 56 }: FileThumbProps) {
    const validation = entry.visionValidation;
    const fallbackSrc = `data:image/svg+xml;charset=UTF-8,${makeThumbSvg(entry.kind)}`;
    return (<div data-ui="file-thumb.1" style={{
            position: 'relative',
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
      {entry.previewUrl || isImageFile(entry.name) ? (<AuthenticatedPreviewImage dataUi="file-thumb.2" src={entry.previewUrl} fallbackSrc={fallbackSrc} alt={entry.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>) : (<span data-ui="file-thumb.3" style={{ fontSize: 13, fontWeight: 800, color: C.g600 }}>문서</span>)}
      {validation && (
        <span style={{ position: 'absolute', left: 4, bottom: 4, borderRadius: 999, padding: '2px 5px', background: validation.status === 'suitable' ? 'rgba(46,125,82,.92)' : 'rgba(211,47,47,.92)', color: C.white, fontSize: 9, fontWeight: 900, lineHeight: 1 }}>
          {validation.status === 'suitable' ? '적합' : '부적합'}
        </span>
      )}
    </div>);
}
