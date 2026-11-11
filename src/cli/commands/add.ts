import { join } from 'node:path';
import { parseCommandArgs, resolveCwd } from '../args';
import { STYLES, parseChoice, readConfig } from '../config';
import type { CliContext } from '../context';
import { CliError } from '../errors';
import { reportWrites } from '../format';
import { readPackageInfo } from '../packageInfo';
import { copyTemplates, listTemplates, matchTemplateNames } from '../templates';

export async function addCommand(args: readonly string[], context: CliContext): Promise<number> {
    const { values, positionals } = parseCommandArgs(args, {
        cwd: { type: 'string' },
        all: { type: 'boolean' },
        list: { type: 'boolean' },
        force: { type: 'boolean' },
        style: { type: 'string' },
        'no-format': { type: 'boolean' },
    });
    const cwd = resolveCwd(context, values.cwd);
    const config = await readConfig(cwd);
    const style = values.style === undefined ? config.style : parseChoice('style', values.style, STYLES);

    const packageInfo = await readPackageInfo();
    const available = await listTemplates(packageInfo, style);
    if (values.list) {
        context.stdout(available.join('\n'));
        return 0;
    }

    const names = values.all ? available : matchTemplateNames(positionals, available);
    if (names.length === 0) {
        throw new CliError(`Name the components to add, or use --all. Available: ${available.join(', ')}.`);
    }

    const records = await copyTemplates({
        packageInfo,
        style,
        names,
        destination: join(cwd, config.componentsDir),
        importBase: config.importBase,
        force: values.force ?? false,
    });
    context.stdout(await reportWrites(cwd, records, context, !values['no-format']));
    return 0;
}
