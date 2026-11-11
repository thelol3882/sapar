import { analyze } from '../analyze';
import { parseCommandArgs, resolveCwd } from '../args';
import { parseChoice, readConfig } from '../config';
import type { CliContext } from '../context';
import { CliError } from '../errors';
import { formatCheckJson, formatCheckText } from '../report';
import type { CheckReport } from '../report';
import type { Typescript } from '../scan/ast';
import { scanProject } from '../scan/project';

const OUTPUT_FORMATS = ['text', 'json'] as const;

async function loadTypescript(): Promise<Typescript> {
    try {
        const module = await import('typescript');
        return module.default ?? module;
    } catch {
        throw new CliError('`sapar check` needs the `typescript` package. Install it as a dev dependency: pnpm add -D typescript');
    }
}

const failed = ({ errors, warnings }: CheckReport, strict: boolean): boolean =>
    errors.length > 0 || (strict && warnings.length > 0);

export async function checkCommand(args: readonly string[], context: CliContext): Promise<number> {
    const { values } = parseCommandArgs(args, {
        cwd: { type: 'string' },
        format: { type: 'string', default: 'text' },
        strict: { type: 'boolean' },
        verbose: { type: 'boolean' },
    });
    const format = parseChoice('format', values.format, OUTPUT_FORMATS);
    const cwd = resolveCwd(context, values.cwd);

    const config = await readConfig(cwd);
    const scan = await scanProject(await loadTypescript(), cwd, config);
    const report = analyze(scan, config, { verbose: values.verbose ?? false });

    context.stdout(format === 'json' ? formatCheckJson(report) : formatCheckText(report));
    return failed(report, values.strict ?? false) ? 1 : 0;
}
