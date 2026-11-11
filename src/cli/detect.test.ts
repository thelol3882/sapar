// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { defaultDirectories, defaultPlatforms, detectFramework, detectSource, detectStyle, readProject } from './detect';
import type { ProjectInfo } from './detect';
import { createProject, packageJson } from './fixtures';

const project = (dependencies: string[], hasSrcDir = true): ProjectInfo => ({
    dependencies: new Set(dependencies),
    hasSrcDir,
});

describe('detectFramework', () => {
    it.each([
        [['next', 'react'], 'next'],
        [['expo', 'react-native'], 'expo'],
        [['react'], 'react'],
        [[], 'react'],
        [['next', 'expo'], 'next'],
    ] as const)('%j is %s', (dependencies, expected) => {
        expect(detectFramework(project([...dependencies]))).toBe(expected);
    });
});

describe('detectStyle', () => {
    it.each([
        [['@mantine/core'], 'next', 'mantine'],
        [['tailwindcss'], 'react', 'tailwind'],
        [['@mantine/core', 'tailwindcss'], 'next', 'mantine'],
        [[], 'react', 'tailwind'],
        [['@mantine/core'], 'expo', 'native'],
        [['expo'], 'expo', 'native'],
    ] as const)('%j in %s is %s', (dependencies, framework, expected) => {
        expect(detectStyle(project([...dependencies]), framework)).toBe(expected);
    });
});

describe('detectSource', () => {
    it('picks rtk when Redux Toolkit is installed and memory otherwise', () => {
        expect(detectSource(project(['@reduxjs/toolkit']))).toBe('rtk');
        expect(detectSource(project(['react']))).toBe('memory');
    });
});

describe('defaults', () => {
    it('place directories under src/ when it exists', () => {
        expect(defaultDirectories(project([]))).toEqual({ componentsDir: 'src/components/tours', toursDir: 'src/tours' });
        expect(defaultDirectories(project([], false))).toEqual({ componentsDir: 'components/tours', toursDir: 'tours' });
    });

    it('scan the web platform for web frameworks and native for expo', () => {
        expect(defaultPlatforms(project([]), 'next')).toEqual({ web: ['src'], native: [] });
        expect(defaultPlatforms(project([]), 'react')).toEqual({ web: ['src'], native: [] });
        expect(defaultPlatforms(project([]), 'expo')).toEqual({ web: [], native: ['src'] });
        expect(defaultPlatforms(project([], false), 'expo')).toEqual({ web: [], native: ['.'] });
    });
});

describe('readProject', () => {
    it('reads dependencies and devDependencies and the src folder', async () => {
        const cwd = await createProject({
            'package.json': JSON.stringify({ dependencies: { next: '16' }, devDependencies: { tailwindcss: '4' } }),
            'src/.keep': '',
        });

        const info = await readProject(cwd);

        expect([...info.dependencies].sort()).toEqual(['next', 'tailwindcss']);
        expect(info.hasSrcDir).toBe(true);
    });

    it('reports a missing package.json', async () => {
        const cwd = await createProject({ 'readme.md': '' });
        await expect(readProject(cwd)).rejects.toThrow('No package.json');
    });

    it('reports no src folder', async () => {
        const cwd = await createProject({ 'package.json': packageJson() });
        expect((await readProject(cwd)).hasSrcDir).toBe(false);
    });
});
