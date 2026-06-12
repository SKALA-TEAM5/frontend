import { C } from '../../lib/theme';
import Card from './Card';
interface InlineLoaderProps {
    title: string;
    body: string;
}
export default function InlineLoader({ title, body }: InlineLoaderProps) {
    return (<Card style={{ marginTop: 16 }}>
      <div data-ui="inline-loader.1" className="inline-loader-shell">
        <div data-ui="inline-loader.2" className="inline-loader-mascot" aria-hidden="true"/>
        <div data-ui="inline-loader.3" className="inline-loader-content">
          <div data-ui="inline-loader.4" style={{ fontSize: 18, fontWeight: 700, color: C.g800, marginBottom: 8 }}>{title}</div>
          <div data-ui="inline-loader.5" style={{ fontSize: 16, color: C.g400, marginBottom: 12, lineHeight: 1.55 }}>{body}</div>
          <div data-ui="inline-loader.6" style={{ height: 10, borderRadius: 99, background: C.g100, overflow: 'hidden' }}>
            <div data-ui="inline-loader.7" style={{
                height: '100%',
                width: '40%',
                borderRadius: 99,
                background: `linear-gradient(90deg,${C.primary},${C.light})`,
                animation: 'loadingSlide 1s linear infinite',
            }}/>
          </div>
        </div>
      </div>
    </Card>);
}
