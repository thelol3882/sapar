export type Prompt = (question: string, defaultAnswer: string) => Promise<string>;

export interface CliContext {
    cwd: string;
    stdout: (line: string) => void;
    stderr: (line: string) => void;
    /** Absent when there is nobody to ask (non-TTY, tests). */
    prompt?: Prompt;
}
