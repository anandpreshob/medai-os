import { useSearchParams } from 'react-router-dom';

/** Placeholder until the Cornerstone engine module lands. */
export function ViewerPage() {
  const [params] = useSearchParams();
  return (
    <div className="p-6 text-ink-2" data-testid="viewer-page">
      Viewer — study {params.get('studyUID') ?? '(none)'} local {params.get('local') ?? '(none)'}
    </div>
  );
}
