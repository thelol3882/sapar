import { createPrompter } from './prompt';
import { runCli } from './main';

const prompter = process.stdin.isTTY ? createPrompter() : undefined;

process.exitCode = await runCli(process.argv.slice(2), {
    cwd: process.cwd(),
    stdout: (line) => process.stdout.write(`${line}\n`),
    stderr: (line) => process.stderr.write(`${line}\n`),
    ...(prompter && { prompt: prompter.ask }),
}).finally(() => prompter?.close());
