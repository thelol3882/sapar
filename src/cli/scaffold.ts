import { join } from 'node:path';
import { platformOf } from './config';
import type { SaparConfig } from './config';
import { importSpecifier } from './imports';

export interface ScaffoldFile {
    /** Relative to the project root. */
    path: string;
    content: string;
}

interface NamedImport {
    module: string;
    names: string[];
}

interface SourceSetup {
    named: NamedImport[];
    /** Import lines that are not plain named imports. */
    otherImports: string[];
    moduleScope: string[];
    insideComponent: string[];
    componentProps: ComponentProp[];
    reactHooks: string[];
}

interface ComponentProp {
    name: string;
    type: string;
}

interface ProviderSetup {
    named: NamedImport[];
    moduleScope: string[];
    tag: string;
    props: string;
}

type Specifier = (entry: string) => string;

const HTTP_BASE_URLS = { web: '/api/tours', native: 'https://api.example.com/tours' };

function generateDefinitions(config: SaparConfig, specifier: Specifier): string {
    return `import { defineAnchors, defineTour } from '${specifier('core')}';

export const anchors = defineAnchors(['welcome.header']);

export const welcomeTour = defineTour({
    key: 'welcome',
    title: 'Welcome',
    platforms: ['${platformOf(config.framework)}'],
    steps: [
        { key: 'hello', title: 'Welcome aboard', body: 'A quick look around.' },
        {
            key: 'header',
            anchor: 'welcome.header',
            title: 'Your header',
            body: 'Tours can point at any element you mark with an anchor.',
        },
    ],
});

export const tours = [welcomeTour];
`;
}

function generateAnchors(config: SaparConfig, specifier: Specifier): string {
    const anchorEntry = platformOf(config.framework) === 'native' ? 'expo' : 'web';
    return `import type { AnchorKey } from '${specifier('core')}';
import { useTourAnchor } from '${specifier(anchorEntry)}';
import type { anchors } from './definitions';

/** Mark the element a step points at: \`<button {...useAnchor('welcome.header')} />\`. */
export function useAnchor(key: AnchorKey<typeof anchors>) {
    return useTourAnchor(key);
}
`;
}

function memorySetup(config: SaparConfig, specifier: Specifier): SourceSetup {
    const isExpo = config.framework === 'expo';
    const storage = isExpo
        ? { named: { module: specifier('expo'), names: ['asyncStorageStore'] }, expression: 'asyncStorageStore(AsyncStorage)' }
        : { named: { module: specifier('web'), names: ['localStorageStore'] }, expression: 'localStorageStore()' };
    return {
        named: [{ module: specifier('core'), names: ['memorySource'] }, storage.named],
        otherImports: [
            ...(isExpo ? [`import AsyncStorage from '@react-native-async-storage/async-storage';`] : []),
            `import { tours } from './definitions';`,
        ],
        moduleScope: [],
        reactHooks: ['useMemo'],
        insideComponent: [
            '// A string key, so a `new Date(...)` passed on every render does not recreate the source.',
            'const registeredAtIso = registeredAt === undefined ? undefined : new Date(registeredAt).toISOString();',
            '// A new user is a new source on purpose: each gets their own namespace and grace period.',
            'const source = useMemo(',
            '    () =>',
            '        memorySource({',
            '            tours,',
            `            storage: ${storage.expression},`,
            '            namespace: `app.sapar.${userId}`,',
            '            registeredAt: registeredAtIso,',
            '        }),',
            '    [userId, registeredAtIso],',
            ');',
        ],
        componentProps: [
            { name: 'userId', type: 'string' },
            { name: 'registeredAt?', type: 'Date | string' },
        ],
    };
}

function httpSetup(config: SaparConfig, specifier: Specifier): SourceSetup {
    const baseUrl = HTTP_BASE_URLS[platformOf(config.framework)];
    return {
        named: [{ module: specifier('core'), names: ['httpSource'] }],
        otherImports: [],
        moduleScope: [`const source = httpSource({ baseUrl: '${baseUrl}' });`],
        insideComponent: [],
        reactHooks: [],
        componentProps: [],
    };
}

function rtkSetup(specifier: Specifier): SourceSetup {
    return {
        named: [{ module: specifier('rtk'), names: ['createSaparRtk'] }],
        otherImports: ['// TODO: point this at your RTK Query api slice', `import { baseApi } from '@/store/api';`],
        moduleScope: ['const toursRtk = createSaparRtk(baseApi);'],
        insideComponent: ['const source = toursRtk.useSaparSource();'],
        reactHooks: [],
        componentProps: [],
    };
}

function sourceSetup(config: SaparConfig, specifier: Specifier): SourceSetup {
    if (config.source === 'http') return httpSetup(config, specifier);
    if (config.source === 'rtk') return rtkSetup(specifier);
    return memorySetup(config, specifier);
}

function providerSetup(config: SaparConfig, specifier: Specifier): ProviderSetup {
    if (config.framework === 'next') {
        return {
            named: [{ module: specifier('next'), names: ['NextSaparProvider'] }],
            moduleScope: [],
            tag: 'NextSaparProvider',
            props: 'source={source}',
        };
    }
    if (config.framework === 'expo') {
        return {
            named: [{ module: specifier('expo-router'), names: ['ExpoSaparProvider'] }],
            moduleScope: [],
            tag: 'ExpoSaparProvider',
            props: 'source={source}',
        };
    }
    return {
        named: [
            { module: specifier('react'), names: ['SaparProvider'] },
            { module: specifier('web'), names: ['createWebAdapter'] },
        ],
        moduleScope: [
            [
                '// TODO: use your router here, and pass `route` to <SaparProvider> to enable route triggers',
                'const adapter = createWebAdapter({',
                `    navigate: (route) => window.history.pushState(null, '', route),`,
                '    currentRoute: () => window.location.pathname,',
                '});',
            ].join('\n'),
        ],
        tag: 'SaparProvider',
        props: 'source={source} adapter={adapter}',
    };
}

function renderNamedImports(imports: readonly NamedImport[]): string[] {
    const namesByModule = new Map<string, string[]>();
    for (const { module, names } of imports) namesByModule.set(module, [...(namesByModule.get(module) ?? []), ...names]);
    return [...namesByModule].map(([module, names]) => `import { ${names.sort().join(', ')} } from '${module}';`);
}

const indent = (lines: readonly string[]): string[] => lines.map((line) => `    ${line}`);

function renderComponentParameters(props: readonly ComponentProp[]): string {
    const all = [...props, { name: 'children', type: 'ReactNode' }];
    const names = all.map(({ name }) => name.replace('?', '')).join(', ');
    const types = all.map(({ name, type }) => `${name}: ${type}`).join('; ');
    return `{ ${names} }: { ${types} }`;
}

function reactImport(hooks: readonly string[]): string {
    return hooks.length === 0
        ? "import type { ReactNode } from 'react';"
        : `import { ${hooks.join(', ')}, type ReactNode } from 'react';`;
}

function generateProvider(config: SaparConfig, specifier: Specifier): string {
    const provider = providerSetup(config, specifier);
    const source = sourceSetup(config, specifier);
    const directive = config.framework === 'next' ? ["'use client';", ''] : [];
    const imports = [
        reactImport(source.reactHooks),
        ...renderNamedImports([...provider.named, ...source.named]),
        ...source.otherImports,
    ];
    const moduleScope = [...provider.moduleScope, ...source.moduleScope];

    return `${[
        ...directive,
        ...imports,
        '',
        ...moduleScope.flatMap((block) => [block, '']),
        `export function AppSaparProvider(${renderComponentParameters(source.componentProps)}) {`,
        ...indent(source.insideComponent),
        ...indent([
            'return (',
            `    <${provider.tag} ${provider.props}>{children}</${provider.tag}>`,
            ');',
        ]),
        '}',
    ].join('\n')}\n`;
}

export function scaffoldFiles(config: SaparConfig, packageName: string): ScaffoldFile[] {
    const specifier: Specifier = (entry) => importSpecifier(entry, config.importBase, packageName);
    return [
        { path: join(config.toursDir, 'definitions.ts'), content: generateDefinitions(config, specifier) },
        { path: join(config.toursDir, 'anchors.ts'), content: generateAnchors(config, specifier) },
        { path: join(config.toursDir, 'SaparProvider.tsx'), content: generateProvider(config, specifier) },
    ];
}
