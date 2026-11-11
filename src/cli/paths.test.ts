import { posix, win32 } from 'node:path';
import { describe, expect, it } from 'vitest';
import { displayJoin, displayPath, toForwardSlashes } from './paths';

describe('displayPath', () => {
    it('prints a Windows relative path with forward slashes', () => {
        const path = displayPath('C:\\app', 'C:\\app\\src\\components\\tours\\TourCard.tsx', win32);

        expect(path).toBe('src/components/tours/TourCard.tsx');
    });

    it('leaves a POSIX relative path unchanged', () => {
        expect(displayPath('/app', '/app/src/TourCard.tsx', posix)).toBe('src/TourCard.tsx');
    });

    it('keeps parent references', () => {
        expect(displayPath('C:\\app\\web', 'C:\\app\\shared\\a.ts', win32)).toBe('../shared/a.ts');
    });
});

describe('displayJoin', () => {
    it('joins segments with forward slashes on Windows', () => {
        expect(displayJoin(['src', 'tours', 'SaparProvider.tsx'], win32)).toBe('src/tours/SaparProvider.tsx');
    });
});

describe('toForwardSlashes', () => {
    it('converts the separator of the given path module only', () => {
        expect(toForwardSlashes('a\\b\\c', win32)).toBe('a/b/c');
        expect(toForwardSlashes('a\\b', posix)).toBe('a\\b');
    });
});
