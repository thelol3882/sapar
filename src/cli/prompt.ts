import { createInterface } from 'node:readline/promises';
import type { Interface } from 'node:readline/promises';
import type { Prompt } from './context';

/** Opens the terminal only when the first question is asked. */
export function createPrompter(): { ask: Prompt; close: () => void } {
    let readline: Interface | undefined;
    return {
        async ask(question, defaultAnswer) {
            readline ??= createInterface({ input: process.stdin, output: process.stdout });
            const answer = await readline.question(`${question} [${defaultAnswer}] `);
            return answer.trim() || defaultAnswer;
        },
        close: () => readline?.close(),
    };
}
