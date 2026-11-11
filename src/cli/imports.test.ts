// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { importSpecifier, rewriteTemplateImports } from './imports';

const PACKAGE = '@thelol3882/sapar';

describe('importSpecifier', () => {
    it('maps core to the package root and the rest to subpaths for the package name', () => {
        expect(importSpecifier('core', PACKAGE, PACKAGE)).toBe('@thelol3882/sapar');
        expect(importSpecifier('web', PACKAGE, PACKAGE)).toBe('@thelol3882/sapar/web');
    });

    it('maps every entry, core included, to a folder for a copied alias', () => {
        expect(importSpecifier('core', '@/shared/tours', PACKAGE)).toBe('@/shared/tours/core');
        expect(importSpecifier('expo', '@/shared/tours', PACKAGE)).toBe('@/shared/tours/expo');
    });
});

describe('rewriteTemplateImports', () => {
    const template = `'use client';

// After copying, change these imports to '@thelol3882/sapar/...'
import { TourOverlay } from '../../src/web';
import type { Tour } from "../../src/core";
import { Local } from './Local';
`;

    it('rewrites to the package name and drops the note', () => {
        expect(rewriteTemplateImports(template, PACKAGE, PACKAGE)).toBe(`'use client';

import { TourOverlay } from '@thelol3882/sapar/web';
import type { Tour } from "@thelol3882/sapar";
import { Local } from './Local';
`);
    });

    it('rewrites to a copied alias', () => {
        const rewritten = rewriteTemplateImports(template, '@/shared/tours', PACKAGE);
        expect(rewritten).toContain("from '@/shared/tours/web'");
        expect(rewritten).toContain('from "@/shared/tours/core"');
        expect(rewritten).not.toContain('After copying');
    });
});
