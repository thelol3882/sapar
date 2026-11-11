import type { ReactNode } from 'react';
import { vi } from 'vitest';
import { createTestAdapter, createSaparController, memorySource, memoryStore } from '../core';
import type {
    AnnouncementDefinition,
    PlatformAdapter,
    TourDefinition,
} from '../core';
import { SaparProvider } from './SaparProvider';

export interface HarnessOptions {
    tours?: TourDefinition[];
    announcements?: AnnouncementDefinition[];
    adapter?: PlatformAdapter;
    anchors?: string[];
    route?: string;
}

export function createHarness(options: HarnessOptions = {}) {
    const adapter = options.adapter ?? createTestAdapter({ anchors: options.anchors });
    const source = memorySource({
        tours: options.tours ?? [],
        announcements: options.announcements,
        storage: memoryStore(),
        registeredAt: new Date('2020-01-01'),
    });
    const recordProgress = vi.spyOn(source, 'recordProgress');
    const controller = createSaparController({ source, adapter, anchorTimeoutMs: 50, presentAnchorTimeoutMs: 20 });
    const wrapper = ({ children }: { children: ReactNode }) => (
        <SaparProvider controller={controller} adapter={adapter} route={options.route}>
            {children}
        </SaparProvider>
    );
    return { adapter, source, controller, recordProgress, wrapper };
}
