import { useMemo } from "react";

import { useConfigActions } from "@/hooks/useConfigActions";
import { useOverview } from "@/hooks/useOverview";
import { useProfileEditor } from "@/hooks/useProfileEditor";
import { useProfileTransfer } from "@/hooks/useProfileTransfer";
import { useSshKey } from "@/hooks/useSshKey";
import { AppFooter } from "@/components/common/AppFooter";
import { AppHeader } from "@/components/common/AppHeader";
import { ApplyDialog } from "@/components/common/ApplyDialog";
import { ImportDialog } from "@/components/common/ImportDialog";
import { LoadFailed, Loading } from "@/components/common/AppFallback";
import { ProfilePane } from "@/components/common/ProfilePane";
import { Sidebar } from "@/components/common/Sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function App() {
  const {
    overview,
    setOverview,
    loadError,
    busy,
    pending,
    refreshing,
    refresh,
    run,
  } = useOverview();

  const profiles = useMemo(() => overview?.profiles ?? [], [overview]);
  const editor = useProfileEditor({ profiles, setOverview, run, pending });
  const sshKey = useSshKey({ profile: editor.editing, run, refresh, pending });
  const transfer = useProfileTransfer({
    count: profiles.length,
    run,
    refresh,
    pending,
  });
  const config = useConfigActions({ setOverview, refresh, run, pending });

  if (loadError) {
    return <LoadFailed message={loadError} onRetry={() => void refresh()} />;
  }
  if (!overview) return <Loading />;

  return (
    <TooltipProvider>
      <div className="bg-background text-foreground flex h-full flex-col">
        <AppHeader
          identity={overview.status.global}
          settings={overview.settings}
          profiles={profiles}
          pendingCount={
            overview.plan.changes.filter((change) => change.changed).length
          }
          onSetGlobal={config.setGlobalProfile}
          onReview={() => config.setReviewing(true)}
          busy={busy}
        />

        <main className="flex min-h-0 flex-1">
          <Sidebar
            profiles={profiles}
            health={overview.health}
            status={overview.status}
            selectedId={editor.selectedId}
            globalProfileId={overview.settings.globalProfileId}
            creating={editor.creating}
            onSelect={editor.select}
            onCreate={editor.startCreate}
            onExport={transfer.exportProfiles}
            onImport={transfer.startImport}
            exporting={transfer.exporting}
            importing={transfer.opening}
            busy={busy}
          />
          <ProfilePane
            overview={overview}
            editor={editor}
            sshKey={sshKey}
            onWatchDir={config.watchDir}
            onRefresh={() => void refresh()}
            refreshing={refreshing}
            busy={busy}
          />
        </main>

        <AppFooter locations={overview.locations} />

        <ApplyDialog
          open={config.reviewing}
          onOpenChange={config.setReviewing}
          plan={overview.plan}
          onApply={config.apply}
          applying={config.applying}
          busy={busy}
        />
        <ImportDialog
          preview={transfer.preview}
          onOpenChange={(open) => {
            if (!open) transfer.close();
          }}
          onImport={transfer.runImport}
          importing={transfer.importing}
          busy={busy}
        />
        <Toaster />
      </div>
    </TooltipProvider>
  );
}
