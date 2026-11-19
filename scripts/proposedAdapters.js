'use strict';

/**
 * Which adapters can a scan propose, and does every one of them exist? (#508)
 *
 * A proposal names the adapter admin is to install. An adapter that has left the ioBroker
 * repository - or never was in it - cannot be installed by anybody, and its detection module is
 * dead code. So the names are read from the sources and compared with `sources-dist.json` of
 * ioBroker.repositories, the latest repository.
 *
 * Latest, not stable, on purpose: a detection may come before its adapter reaches stable. Whether
 * the adapter is in the repository *this* installation uses is decided at run time, against the
 * active repository - see `src/lib/repository.ts`.
 *
 * The names are not listed anywhere, they are read from the two helpers every proposal goes
 * through: `tools.getNextInstanceID(name, options)` (the `_id` of a new proposal) and
 * `tools.proposeSharedInstance(name, ...)`. The TypeScript checker resolves their first argument,
 * so `const adapterName = 'shelly'` counts as well as a literal. An argument it cannot resolve to
 * one or more string literals is an error in its own right: the check would otherwise go blind
 * for that module without anybody noticing.
 *
 *   node scripts/proposedAdapters.js                    check against the latest repository
 *   node scripts/proposedAdapters.js --list             only print what the sources propose
 *   node scripts/proposedAdapters.js --repo <url|file>  check against another repository
 *   node scripts/proposedAdapters.js --report <file>    also write the result as Markdown
 *
 * Exit codes: 0 all present, 1 missing or unresolved names, 2 the repository could not be loaded.
 * The weekly workflow opens an issue on 1 only - a repository that did not answer says nothing
 * about the adapters.
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const LATEST_REPOSITORY = 'https://raw.githubusercontent.com/ioBroker/ioBroker.repositories/master/sources-dist.json';

/** The helpers whose first argument is the name of the proposed adapter */
const HELPERS = ['getNextInstanceID', 'proposeSharedInstance'];

/** Where the helpers are defined - their own parameter is no proposal */
const HELPER_SOURCE = path.join('src', 'lib', 'tools.ts');

const ROOT = path.join(__dirname, '..');

/**
 * Every adapter name the sources can propose.
 *
 * @param {string} [rootDir] the root of this repository
 * @returns {{ names: Map<string, string[]>, unresolved: { file: string, line: number, text: string }[] }}
 *   `names` maps an adapter to the source files proposing it, `unresolved` lists the calls whose
 *   name the checker could not pin down
 */
function proposedAdapters(rootDir = ROOT) {
    const configFile = path.join(rootDir, 'tsconfig.json');
    const { config, error } = ts.readConfigFile(configFile, ts.sys.readFile);
    if (error) {
        throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
    }
    const parsed = ts.parseJsonConfigFileContent(config, ts.sys, rootDir);
    const program = ts.createProgram(parsed.fileNames, parsed.options);
    const checker = program.getTypeChecker();

    const names = new Map();
    const unresolved = [];

    for (const sourceFile of program.getSourceFiles()) {
        const file = path.relative(rootDir, sourceFile.fileName);
        if (sourceFile.isDeclarationFile || !file.startsWith(`src${path.sep}`) || file === HELPER_SOURCE) {
            continue;
        }
        const visit = node => {
            const argument = ts.isCallExpression(node) && HELPERS.includes(calleeName(node)) && node.arguments[0];
            if (argument) {
                const values = stringLiterals(checker.getTypeAtLocation(argument));
                if (values) {
                    for (const value of values) {
                        if (!names.has(value)) {
                            names.set(value, new Set());
                        }
                        names.get(value).add(file.replace(/\\/g, '/'));
                    }
                } else {
                    unresolved.push({
                        file: file.replace(/\\/g, '/'),
                        line: sourceFile.getLineAndCharacterOfPosition(argument.getStart()).line + 1,
                        text: argument.getText(),
                    });
                }
            }
            ts.forEachChild(node, visit);
        };
        visit(sourceFile);
    }

    return {
        names: new Map([...names.keys()].sort().map(name => [name, [...names.get(name)].sort()])),
        unresolved,
    };
}

/** `getNextInstanceID(...)`, `tools.getNextInstanceID(...)` and `tools!.getNextInstanceID(...)` alike */
function calleeName(call) {
    const callee = call.expression;
    if (ts.isIdentifier(callee)) {
        return callee.text;
    }
    if (ts.isPropertyAccessExpression(callee)) {
        return callee.name.text;
    }
    return '';
}

/** The values of a string literal type or a union of them, otherwise null */
function stringLiterals(type) {
    const parts = type.isUnion() ? type.types : [type];
    return parts.every(part => part.isStringLiteral()) ? parts.map(part => part.value) : null;
}

/**
 * The adapters a repository has, without its meta entries (`_repoInfo`).
 *
 * @param {Record<string, unknown>} repository the parsed `sources-dist*.json`
 * @returns {Set<string>} the adapter names
 */
function repositoryAdapters(repository) {
    return new Set(Object.keys(repository).filter(name => !name.startsWith('_')));
}

/**
 * The proposed adapters the repository does not have.
 *
 * @param {Map<string, string[]>} names what {@link proposedAdapters} found
 * @param {Set<string>} available what {@link repositoryAdapters} returned
 * @returns {{ name: string, files: string[] }[]} the missing adapters with the modules proposing them
 */
function missingAdapters(names, available) {
    return [...names].filter(([name]) => !available.has(name)).map(([name, files]) => ({ name, files }));
}

/**
 * The result as the body of an issue.
 *
 * @param {{ name: string, files: string[] }[]} missing see {@link missingAdapters}
 * @param {{ file: string, line: number, text: string }[]} unresolved see {@link proposedAdapters}
 * @param {string} source where the repository came from
 */
function markdownReport(missing, unresolved, source) {
    const lines = [];
    if (missing.length) {
        const one = missing.length === 1;
        lines.push(
            `Discovery proposes ${one ? 'an adapter that is' : `${missing.length} adapters that are`} not in the ioBroker repository ([${path.basename(source)}](${source})). Nobody can install ${one ? 'it, so its detection is' : 'them, so their detections are'} dead code.`,
            '',
            '| Adapter | Proposed by |',
            '| --- | --- |',
            ...missing.map(({ name, files }) => `| \`${name}\` | ${files.map(file => `\`${file}\``).join(', ')} |`),
            '',
            'Each detection has to go, or propose the adapter that replaced the removed one. Until then every release build fails.',
        );
    }
    if (unresolved.length) {
        lines.push(
            ...(lines.length ? [''] : []),
            'The adapter name of these calls could not be resolved to a string literal, so they were not checked:',
            '',
            ...unresolved.map(({ file, line, text }) => `- \`${file}:${line}\` - \`${text}\``),
        );
    }
    lines.push('', 'Found by `node scripts/proposedAdapters.js` (#508).');
    return `${lines.join('\n')}\n`;
}

/**
 * Load a repository from a URL or a file.
 *
 * @param {string} source URL or path
 * @returns {Promise<Record<string, unknown>>} the parsed repository
 */
async function loadRepository(source) {
    if (!/^https?:\/\//.test(source)) {
        return JSON.parse(fs.readFileSync(source, 'utf8'));
    }
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const response = await fetch(source, { signal: AbortSignal.timeout(30_000) });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            lastError = error;
            await new Promise(resolve => setTimeout(resolve, attempt * 2000));
        }
    }
    throw new Error(`Cannot load ${source}: ${lastError?.message ?? lastError}`);
}

function argumentValue(argv, flag) {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
}

async function main(argv) {
    const { names, unresolved } = proposedAdapters();

    for (const { file, line, text } of unresolved) {
        console.error(`${file}:${line}: cannot resolve the proposed adapter name "${text}" to a string literal`);
    }

    if (argv.includes('--list')) {
        for (const [name, files] of names) {
            console.log(`${name.padEnd(28)} ${files.join(', ')}`);
        }
        console.log(`\n${names.size} adapters can be proposed.`);
        return unresolved.length ? 1 : 0;
    }

    const source = argumentValue(argv, '--repo') || LATEST_REPOSITORY;
    let available;
    try {
        available = repositoryAdapters(await loadRepository(source));
    } catch (error) {
        console.error(error.message);
        return 2;
    }

    const missing = missingAdapters(names, available);
    for (const { name, files } of missing) {
        console.error(`"${name}" is not in the repository, proposed by ${files.join(', ')}`);
    }

    const report = argumentValue(argv, '--report');
    if (report) {
        fs.writeFileSync(
            report,
            missing.length || unresolved.length ? markdownReport(missing, unresolved, source) : '',
        );
    }

    if (missing.length || unresolved.length) {
        return 1;
    }
    console.log(`All ${names.size} proposed adapters are in ${source}`);
    return 0;
}

if (require.main === module) {
    main(process.argv.slice(2)).then(
        code => (process.exitCode = code),
        error => {
            console.error(error);
            process.exitCode = 2;
        },
    );
}

module.exports = { proposedAdapters, repositoryAdapters, missingAdapters, markdownReport, LATEST_REPOSITORY };
