'use client';

import { useState } from 'react';
import { IconButton } from '../primitives';
import { ProjectNavigation } from './ProjectSidebar';
import { useNativeDialog } from './use-native-dialog';

export function ProjectNavigationDrawer({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useNativeDialog({ open, onOpenChange: setOpen });

  return (
    <div className="hidden md:block xl:hidden">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="project-navigation-drawer"
        className="m-3 min-h-11 rounded-md border border-default px-3 font-semibold"
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">☰</span> Menu proyek
      </button>
      <dialog
        id="project-navigation-drawer"
        ref={dialogRef}
        aria-labelledby="project-navigation-drawer-title"
        className="m-0 h-dvh w-[min(360px,calc(100%-64px))] max-w-none bg-surface p-0 text-primary shadow-lg backdrop:bg-brand-ink/40"
      >
        <div className="flex min-h-11 items-center justify-between border-b border-default p-3">
          <h2 id="project-navigation-drawer-title" className="font-bold">
            Navigasi proyek
          </h2>
          <IconButton
            data-dialog-initial-focus
            aria-label="Tutup navigasi proyek"
            onClick={() => setOpen(false)}
          >
            ×
          </IconButton>
        </div>
        <div className="h-[calc(100dvh-68px)] overflow-y-auto">
          <ProjectNavigation
            projectId={projectId}
            labelledBy="project-navigation-drawer-title"
            idPrefix="drawer-nav"
          />
        </div>
      </dialog>
    </div>
  );
}
