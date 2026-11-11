import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { ParseArgsConfig } from 'node:util';
import type { CliContext } from './context';
import { CliError } from './errors';

type OptionsConfig = NonNullable<ParseArgsConfig['options']>;

export function parseCommandArgs<const Options extends OptionsConfig>(args: readonly string[], options: Options) {
    try {
        return parseArgs({ args: [...args], options, allowPositionals: true });
    } catch (error) {
        throw new CliError(error instanceof Error ? error.message : String(error));
    }
}

export function resolveCwd(context: CliContext, cwdFlag: string | undefined): string {
    return cwdFlag === undefined ? context.cwd : resolve(context.cwd, cwdFlag);
}
