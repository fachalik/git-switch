import { useEffect, useRef } from "react";
import { UserRound } from "lucide-react";

import type { useProfileEditor } from "@/hooks/useProfileEditor";
import type { useSshKey } from "@/hooks/useSshKey";
import type { Overview } from "@/lib/types";
import { KeyPanel } from "@/components/common/KeyPanel";
import { ProfileForm } from "@/components/common/ProfileForm";
import { WatchedFolder } from "@/components/common/WatchedFolder";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

/** The scrolling workspace column: what's live, then what's being edited. */
export function ProfilePane({
  overview,
  editor,
  sshKey,
  onWatchDir,
  onRefresh,
  refreshing,
  busy,
}: {
  overview: Overview;
  editor: ReturnType<typeof useProfileEditor>;
  sshKey: ReturnType<typeof useSshKey>;
  onWatchDir: (dir: string | null) => void;
  onRefresh: () => void;
  refreshing: boolean;
  busy: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { creating, editing, formKey } = editor;

  // Switching profiles starts at the top of the pane; reverting a draft keeps
  // you where you were, which is why this tracks the profile and not formKey.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [creating, editing?.id]);

  const health = overview.health.find(
    (entry) => entry.profileId === editing?.id,
  );

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-5 py-4">
          <WatchedFolder
            status={overview.status}
            settings={overview.settings}
            onWatchDir={onWatchDir}
            onRefresh={onRefresh}
            refreshing={refreshing}
            busy={busy}
          />

          {creating ? (
            <ProfileForm
              key={formKey}
              profile={null}
              onSave={editor.save}
              onCancel={editor.cancel}
              saving={editor.saving}
              busy={busy}
            />
          ) : editing ? (
            <>
              <ProfileForm
                key={formKey}
                profile={editing}
                onSave={editor.save}
                onCancel={editor.cancel}
                onDelete={editor.remove}
                saving={editor.saving}
                deleting={editor.deleting}
                busy={busy}
              />
              <KeyPanel
                profile={editing}
                health={health}
                onGenerate={sshKey.generate}
                onTest={sshKey.testConnection}
                test={sshKey.test}
                generated={sshKey.generated}
                generating={sshKey.generating}
                testing={sshKey.testing}
                busy={busy}
              />
            </>
          ) : (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UserRound />
                </EmptyMedia>
                <EmptyTitle>No profile selected</EmptyTitle>
                <EmptyDescription>
                  Add a profile for each account you commit from. Git Switcher
                  writes the SSH host alias and the{" "}
                  <code className="font-mono">includeIf</code> rules for you,
                  and shows which identity is active in the menu bar.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </div>
    </section>
  );
}
