import { Button } from '@/components/ui/radix-ui';

type StatusStripProps = {
  error?: string | null;
  isRefreshing?: boolean;
  lastUpdatedLabel?: string | null;
  onRefresh: () => void;
};

export function StatusStrip({
  error = null,
  isRefreshing = false,
  lastUpdatedLabel = null,
  onRefresh,
}: StatusStripProps) {
  return (
    <div className="status-strip" role={error == null ? undefined : 'status'}>
      <span className="font-mono">Kestrel Cloud</span>
      <span>
        {error ?? (lastUpdatedLabel == null ? 'Survey sheet ready' : `Updated ${lastUpdatedLabel}`)}
      </span>
      <Button
        aria-busy={isRefreshing}
        className="status-refresh"
        disabled={isRefreshing}
        type="button"
        onClick={onRefresh}
      >
        Refresh
      </Button>
    </div>
  );
}
