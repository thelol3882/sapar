import { join } from 'node:path';
import { parseCommandArgs, resolveCwd } from '../args';
import { FRAMEWORKS, SOURCES, STYLES, assertStyleMatchesFramework, parseChoice, writeConfig } from '../config';
import type { SaparConfig } from '../config';
import type { CliContext, Prompt } from '../context';
import { CliError } from '../errors';
import {
    defaultDirectories,
    defaultPlatforms,
    detectFramework,
    detectSource,
    detectStyle,
    readProject,
} from '../detect';
import { reportWrites } from '../format';
import { writeFileSafely } from '../fs';
import { readPackageInfo } from '../packageInfo';
import { displayJoin } from '../paths';
import { scaffoldFiles } from '../scaffold';
import { copyTemplates } from '../templates';

const STARTER_COMPONENT = 'TourCard';

interface Setting<Value extends string> {
    question: string;
    flag: string | undefined;
    detected: Value;
    parse: (raw: string) => Value;
}

function parseText(raw: string): string {
    if (raw.trim() === '') throw new CliError('The value cannot be empty.');
    return raw.trim();
}

const choiceSetting = <Choice extends string>(
    label: string,
    choices: readonly Choice[],
    flag: string | undefined,
    detected: Choice,
): Setting<Choice> => ({
    question: `${label} (${choices.join('/')})`,
    flag,
    detected,
    parse: (raw) => parseChoice(label, raw, choices),
});

async function resolveSetting<Value extends string>(
    { question, flag, detected, parse }: Setting<Value>,
    context: CliContext,
    prompt: Prompt | undefined,
): Promise<Value> {
    if (flag !== undefined) return parse(flag);
    if (prompt === undefined) return detected;
    for (;;) {
        try {
            return parse(await prompt(question, detected));
        } catch (error) {
            if (!(error instanceof CliError)) throw error;
            context.stderr(error.message);
        }
    }
}

interface InitFlags {
    framework: string | undefined;
    style: string | undefined;
    source: string | undefined;
    importBase: string | undefined;
    componentsDir: string | undefined;
    toursDir: string | undefined;
}

async function resolveConfig(
    flags: InitFlags,
    cwd: string,
    packageName: string,
    context: CliContext,
    prompt: Prompt | undefined,
): Promise<SaparConfig> {
    const project = await readProject(cwd);
    const framework = await resolveSetting(
        choiceSetting('framework', FRAMEWORKS, flags.framework, detectFramework(project)),
        context,
        prompt,
    );
    const style = await resolveSetting(
        choiceSetting('style', STYLES, flags.style, detectStyle(project, framework)),
        context,
        prompt,
    );
    const source = await resolveSetting(
        choiceSetting('source', SOURCES, flags.source, detectSource(project)),
        context,
        prompt,
    );
    const importBase = await resolveSetting(
        { question: 'import base', flag: flags.importBase, detected: packageName, parse: parseText },
        context,
        prompt,
    );
    const directories = defaultDirectories(project);
    const componentsDir = await resolveSetting(
        { question: 'components dir', flag: flags.componentsDir, detected: directories.componentsDir, parse: parseText },
        context,
        prompt,
    );

    const toursDir = await resolveSetting(
        { question: 'tours dir', flag: flags.toursDir, detected: directories.toursDir, parse: parseText },
        context,
        prompt,
    );

    assertStyleMatchesFramework(framework, style);
    return {
        framework,
        style,
        source,
        componentsDir,
        toursDir,
        importBase,
        platforms: defaultPlatforms(project, framework),
    };
}

function nextSteps(config: SaparConfig): string {
    const providerPath = displayJoin([config.toursDir, 'SaparProvider.tsx']);
    const providerStep = {
        rtk: `Point the baseApi import in ${providerPath} at your RTK Query slice, and mount <AppSaparProvider /> inside the Redux <Provider>.`,
        http: `Mount <AppSaparProvider /> from ${providerPath} near the root of your app.`,
        memory: `Mount <AppSaparProvider userId={...} registeredAt={...} /> from ${providerPath} near the root of your app: pass the signed-in user's id (it namespaces their saved progress) and when they registered (it enables the new-user grace period).`,
    }[config.source];
    return [
        '',
        'Next steps:',
        `  1. ${providerStep}`,
        `  2. Render <${STARTER_COMPONENT} /> from ${config.componentsDir} inside it.`,
        `  3. Mark the element a step points at with useAnchor('welcome.header') from ${displayJoin([config.toursDir, 'anchors'])}.`,
        '  4. Run `sapar check` in CI to catch anchors that go missing.',
    ].join('\n');
}

export async function initCommand(args: readonly string[], context: CliContext): Promise<number> {
    const { values } = parseCommandArgs(args, {
        cwd: { type: 'string' },
        yes: { type: 'boolean' },
        force: { type: 'boolean' },
        framework: { type: 'string' },
        style: { type: 'string' },
        source: { type: 'string' },
        'import-base': { type: 'string' },
        'components-dir': { type: 'string' },
        'tours-dir': { type: 'string' },
        'no-format': { type: 'boolean' },
    });
    const cwd = resolveCwd(context, values.cwd);
    const force = values.force ?? false;
    const packageInfo = await readPackageInfo();

    const config = await resolveConfig(
        {
            framework: values.framework,
            style: values.style,
            source: values.source,
            importBase: values['import-base'],
            componentsDir: values['components-dir'],
            toursDir: values['tours-dir'],
        },
        cwd,
        packageInfo.name,
        context,
        values.yes ? undefined : context.prompt,
    );

    const records = [await writeConfig(cwd, config, force)];
    for (const file of scaffoldFiles(config, packageInfo.name)) {
        records.push(await writeFileSafely(join(cwd, file.path), file.content, force));
    }
    records.push(
        ...(await copyTemplates({
            packageInfo,
            style: config.style,
            names: [STARTER_COMPONENT],
            destination: join(cwd, config.componentsDir),
            importBase: config.importBase,
            force,
        })),
    );

    context.stdout(`${await reportWrites(cwd, records, context, !values['no-format'])}\n${nextSteps(config)}`);
    return 0;
}
