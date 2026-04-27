import { C } from '../../lib/theme';
interface FolderIconProps {
    color?: string;
    size?: number;
    hasFiles?: boolean;
}
export default function FolderIcon({ color = C.primary, size = 40, hasFiles, }: FolderIconProps) {
    return (<svg width={size} height={size * 0.82} viewBox="0 0 56 46" fill="none">
      <rect x="0" y="7" width="56" height="37" rx="6" fill={color} opacity=".12"/>
      <rect x="0" y="11" width="21" height="6" rx="3" fill={color} opacity=".4"/>
      <rect x="2" y="15" width="52" height="29" rx="5" fill={color}/>
      {hasFiles ? (<>
          <rect x="13" y="25" width="28" height="2.5" rx="1.25" fill="white" opacity=".65"/>
          <rect x="13" y="31" width="20" height="2.5" rx="1.25" fill="white" opacity=".4"/>
        </>) : (<>
          <line x1="28" y1="23" x2="28" y2="35" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity=".6"/>
          <line x1="22" y1="29" x2="34" y2="29" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity=".6"/>
        </>)}
    </svg>);
}
