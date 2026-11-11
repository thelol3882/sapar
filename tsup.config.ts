import { readFile, writeFile } from 'node:fs/promises';
import { defineConfig } from 'tsup';

const CLIENT_ENTRIES = ['react', 'web', 'next', 'rtk'];
const LIBRARY_ENTRIES = ['core', 'expo', 'expo-router', ...CLIENT_ENTRIES];
const PEERS = [
    'react',
    'react-dom',
    'next',
    '@reduxjs/toolkit',
    'react-redux',
    '@floating-ui/react-dom',
    'react-native',
    'react-native-svg',
    'expo-router',
    'typescript',
];

// esbuild drops module directives, so the client entries get theirs back after the build.
// Core stays directive-free so tour definitions can be imported from server components.
async function markClientEntries(): Promise<void> {
    await Promise.all(
        CLIENT_ENTRIES.map(async (entry) => {
            const file = `dist/${entry}/index.js`;
            await writeFile(file, `'use client';\n${await readFile(file, 'utf8')}`);
        }),
    );
}

export default defineConfig([
    {
        entry: Object.fromEntries(LIBRARY_ENTRIES.map((entry) => [`${entry}/index`, `src/${entry}/index.ts`])),
        format: ['esm'],
        dts: true,
        sourcemap: true,
        splitting: true,
        external: PEERS,
        onSuccess: markClientEntries,
    },
    {
        entry: { 'cli/index': 'src/cli/index.ts' },
        format: ['esm'],
        platform: 'node',
        target: 'node20',
        external: PEERS,
        banner: { js: '#!/usr/bin/env node' },
    },
]);
