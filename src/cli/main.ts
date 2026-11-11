import { ADD_HELP, CHECK_HELP, GENERAL_HELP, INIT_HELP } from './help';
import { addCommand } from './commands/add';
import { checkCommand } from './commands/check';
import { initCommand } from './commands/init';
import type { CliContext } from './context';
import { CliError } from './errors';
import { readPackageInfo } from './packageInfo';

type Command = (args: readonly string[], context: CliContext) => Promise<number>;

const COMMANDS = new Map<string, { run: Command; help: string }>([
    ['init', { run: initCommand, help: INIT_HELP }],
    ['add', { run: addCommand, help: ADD_HELP }],
    ['check', { run: checkCommand, help: CHECK_HELP }],
]);

const isHelpFlag = (arg: string | undefined): boolean => arg === '--help' || arg === '-h';

async function dispatch(argv: readonly string[], context: CliContext): Promise<number> {
    const [name, ...args] = argv;
    if (name === '--version' || name === '-v') {
        context.stdout((await readPackageInfo()).version);
        return 0;
    }
    if (isHelpFlag(name)) {
        context.stdout(GENERAL_HELP);
        return 0;
    }

    const command = name === undefined ? undefined : COMMANDS.get(name);
    if (command === undefined) {
        context.stderr(name === undefined ? GENERAL_HELP : `Unknown command "${name}".\n\n${GENERAL_HELP}`);
        return 1;
    }
    if (args.some(isHelpFlag)) {
        context.stdout(command.help);
        return 0;
    }
    return command.run(args, context);
}

export async function runCli(argv: readonly string[], context: CliContext): Promise<number> {
    try {
        return await dispatch(argv, context);
    } catch (error) {
        if (!(error instanceof CliError)) throw error;
        context.stderr(`error: ${error.message}`);
        return 1;
    }
}
