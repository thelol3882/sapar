export const GENERAL_HELP = `Usage: sapar <command> [options]

Commands:
  init     Create sapar.json, a sample definitions file, and a provider
  add      Copy UI components into your project
  check    Verify that every tour anchor exists in your source

Run \`sapar <command> --help\` for details.

Options:
  -h, --help     Show help
  -v, --version  Show the version`;

export const INIT_HELP = `Usage: sapar init [options]

Detects your setup, writes sapar.json, <toursDir>/definitions.ts, anchors.ts and
SaparProvider.tsx, then copies the TourCard component. Existing files are kept.
Written files are formatted with your project's Prettier when it has a config.

Options:
  --cwd <dir>               Project root (default: current directory)
  --yes                     Accept detected values without asking
  --framework <name>        next | expo | react
  --style <name>            tailwind | mantine | native
  --source <name>           memory | http | rtk
  --import-base <specifier> Package name or alias of a copied src folder
  --components-dir <dir>    Where components are copied
  --tours-dir <dir>         Where definitions, anchors and the provider go
  --no-format               Do not format the written files with Prettier
  --force                   Overwrite existing files`;

export const ADD_HELP = `Usage: sapar add [names...] [options]

Copies components from the template set of your style into componentsDir.
Names are case-insensitive; kebab-case works (whats-new-panel).
Copied files are formatted with your project's Prettier when it has a config.

Options:
  --cwd <dir>      Project root (default: current directory)
  --all            Copy every component
  --list           List the available components
  --style <name>   Use another template set than sapar.json
  --no-format      Do not format the copied files with Prettier
  --force          Overwrite existing files`;

export const CHECK_HELP = `Usage: sapar check [options]

Reads tour definitions and anchor declarations from your source and fails when
a step points at an anchor that does not exist on a platform the tour targets.
Needs the \`typescript\` package.

Options:
  --cwd <dir>        Project root (default: current directory)
  --format <format>  text | json (default: text)
  --strict           Treat warnings as errors
  --verbose          Also list declared anchors that no tour uses`;
