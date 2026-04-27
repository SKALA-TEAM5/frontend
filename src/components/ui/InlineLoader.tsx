import { C } from '../../lib/theme';
import Card from './Card';
interface InlineLoaderProps {
    title: string;
    body: string;
}
export default function InlineLoader({ title, body }: InlineLoaderProps) {
    return (<Card style={{ marginTop: 16 }}>
      <div data-ui="components-ui-inline-loader.div-1" style={{ fontSize: 15, fontWeight: 800, color: C.g800, marginBottom: 8 }}>{title}</div>
      <div data-ui="components-ui-inline-loader.div-2" style={{ fontSize: 13, color: C.g400, marginBottom: 12 }}>{body}</div>
      <div data-ui="components-ui-inline-loader.div-3" style={{ height: 10, borderRadius: 99, background: C.g100, overflow: 'hidden' }}>
        <div data-ui="components-ui-inline-loader.div-4" style={{
            height: '100%',
            width: '40%',
            borderRadius: 99,
            background: `linear-gradient(90deg,${C.primary},${C.light})`,
            animation: 'loadingSlide 1s linear infinite',
        }}/>
      </div>
    </Card>);
}
