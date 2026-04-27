import type { CSSProperties } from 'react';
import { C } from '../../lib/theme';
import ArchiveFileRow from './ArchiveFileRow';
import type { EvidenceFile, FolderEvidenceCategory } from '../../types/domain';
import type { ArchiveViewMode } from './ArchiveToolbar';
interface CategoryMeta {
    id: number;
    short: string;
}
type DragContext = {
    file: EvidenceFile;
    fromCat: number;
    kind: FolderEvidenceCategory;
} | null;
interface ArchiveFolderGridProps {
    cats: CategoryMeta[];
    viewMode: ArchiveViewMode;
    dragFile: DragContext;
    getAllFilesForCategory: (catId: number) => EvidenceFile[];
    onDropFile: (toCat: number) => void;
    onSetDragFile: (drag: DragContext) => void;
    onRemove: (kind: FolderEvidenceCategory, catId: number, fileId: string) => void;
    onPreview: (entry: EvidenceFile, x: number, y: number) => void;
    onPreviewEnd: () => void;
}
const thumbStyle: CSSProperties = {
    width: 44,
    height: 44,
    borderRadius: 10,
    background: '#F1F8F3',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    flexShrink: 0,
};
function FolderThumb({ empty }: {
    empty: boolean;
}) {
    return (<svg data-ui="features-project-tab-archive-folder-grid.folder-thumb-svg" width="34" height="30" viewBox="0 0 68 60" fill="none" aria-hidden="true">
      <path data-ui="features-project-tab-archive-folder-grid.folder-thumb-tab" d="M7 14C7 10.686 9.686 8 13 8H26.7C28.35 8 29.927 8.68 31.06 9.88L35 14H55C58.314 14 61 16.686 61 20V45C61 48.314 58.314 51 55 51H13C9.686 51 7 48.314 7 45V14Z" fill={empty ? '#DDE8E0' : '#CFE9D6'}/>
      <path data-ui="features-project-tab-archive-folder-grid.folder-thumb-body" d="M5 23C5 19.686 7.686 17 11 17H57C60.314 17 63 19.686 63 23V47C63 50.314 60.314 53 57 53H11C7.686 53 5 50.314 5 47V23Z" fill={empty ? '#E8EFEA' : '#9CCFA9'}/>
      <path data-ui="features-project-tab-archive-folder-grid.folder-thumb-front" d="M9 28C9 25.791 10.791 24 13 24H55C57.209 24 59 25.791 59 28V46C59 48.209 57.209 50 55 50H13C10.791 50 9 48.209 9 46V28Z" fill={empty ? '#F4F7F5' : '#DFF2E4'}/>
      <path data-ui="features-project-tab-archive-folder-grid.folder-thumb-line" d="M16 36H45" stroke={empty ? '#B8C7BE' : '#6FAF7E'} strokeWidth="4" strokeLinecap="round"/>
    </svg>);
}
export default function ArchiveFolderGrid({ cats, viewMode, dragFile, getAllFilesForCategory, onDropFile, onSetDragFile, onRemove, onPreview, onPreviewEnd }: ArchiveFolderGridProps) {
    return (<div data-ui="features-project-tab-archive-folder-grid.div-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18 }}>
      {cats.map((cat) => {
            const files = getAllFilesForCategory(cat.id);
            const count = files.length;
            const empty = count === 0;
            return (<div data-ui="features-project-tab-archive-folder-grid.div-2" key={`${viewMode}-${cat.id}`} onDragOver={(e) => { if (!dragFile)
                return; e.preventDefault(); }} onDrop={(e) => {
                    if (!dragFile)
                        return;
                    e.preventDefault();
                    onDropFile(cat.id);
                }} style={{ position: 'relative', background: C.white, border: `1px solid ${C.g200}`, borderRadius: 18, padding: '14px 14px 20px', transition: 'all .18s', boxShadow: '0 8px 18px rgba(27,94,59,.06)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div data-ui="features-project-tab-archive-folder-grid.div-3" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
              <div data-ui="features-project-tab-archive-folder-grid.div-4" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <div data-ui="features-project-tab-archive-folder-grid.folder-thumbnail" style={thumbStyle}>
                  <FolderThumb empty={empty}/>
                </div>
                <div data-ui="features-project-tab-archive-folder-grid.div-6" style={{ fontSize: 13, fontWeight: 800, color: empty ? C.g400 : C.g800, lineHeight: 1.35, wordBreak: 'keep-all' }}>{cat.short}</div>
                <div data-ui="features-project-tab-archive-folder-grid.div-7" style={{ fontSize: 11, fontWeight: 700, color: C.g400, whiteSpace: 'nowrap' }}>{empty ? '0개' : `${count}개`}</div>
              </div>
            </div>
            <div data-ui="features-project-tab-archive-folder-grid.div-8" style={{ border: `1px solid ${C.g100}`, borderRadius: 14, background: '#FCFEFD', padding: '10px 8px 0 10px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div data-ui="features-project-tab-archive-folder-grid.div-9" style={{ overflowY: 'auto', paddingRight: 4, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 172 }}>
                {empty && <div data-ui="features-project-tab-archive-folder-grid.div-10" style={{ minHeight: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: C.g400 }}>이 폴더는 비어 있습니다</div>}
                {files.map((file) => {
                    const fileKind = file.kind as FolderEvidenceCategory;
                    return (<ArchiveFileRow key={`${file.kind}-${file.id}-${cat.id}`} file={file} catId={cat.id} kind={fileKind} onDragStart={() => onSetDragFile({ file, fromCat: cat.id, kind: fileKind })} onDragEnd={() => onSetDragFile(null)} onRemove={() => onRemove(fileKind, cat.id, file.id)} onPreview={onPreview} onPreviewEnd={onPreviewEnd}/>);
                })}
              </div>
            </div>
          </div>);
        })}
    </div>);
}
