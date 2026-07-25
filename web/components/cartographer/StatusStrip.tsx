import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/ui/radix-ui';
import { WorkspaceTabs } from '@/components/WorkspaceTabs';

type StatusStripProps = {
  error?: string | null;
  isRefreshing?: boolean;
  lastUpdatedLabel?: string | null;
  onBeforeWorkspaceChange: (href: string) => boolean;
  onRefresh: () => void;
};

export function StatusStrip({
  error = null,
  isRefreshing = false,
  lastUpdatedLabel = null,
  onBeforeWorkspaceChange,
  onRefresh,
}: StatusStripProps) {
  return (
    <div className="status-strip" role={error == null ? undefined : 'status'}>
      <div className="workspace-header-start">
        <BrandMark subtitle="Routes and places workspace" />
        <WorkspaceTabs activeSection="map" onBeforeChange={onBeforeWorkspaceChange} />
      </div>
      <span className={error == null ? undefined : 'status-error'}>
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
