import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { posix } from 'node:path';

const workspaceRoot = new URL('../', import.meta.url);
const requireFromSite = createRequire(new URL('../site/package.json', import.meta.url));
const ts = requireFromSite('typescript');
const productionRoots = ['shared', 'site/src', 'workers/api/src'];
const consumerRoots = [...productionRoots, 'site/e2e', 'workers/api/tests'];
const consumerEntryFiles = ['site/alchemy.run.ts', 'tools/check-source-policy.mjs'];
const sourceExtensions = ['.js', '.mjs', '.svelte', '.ts'];
const sourceExtensionSet = new Set(sourceExtensions);
const frameworkEntries = new Set(['site/src/hooks.server.ts', 'workers/api/src/worker.ts']);

async function sourceFiles(directory) {
  const entries = await readdir(new URL(`${directory}/`, workspaceRoot), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await sourceFiles(path)));
    } else if (
      entry.isFile() &&
      sourceExtensionSet.has(posix.extname(entry.name)) &&
      !entry.name.endsWith('.d.ts')
    ) {
      files.push(path);
    }
  }
  return files;
}

function scriptSource(path, source) {
  if (!path.endsWith('.svelte')) return source;
  return [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gu)]
    .map(match => match[1] ?? '')
    .join('\n');
}

function scriptKind(path) {
  if (path.endsWith('.js') || path.endsWith('.mjs')) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function resolveImport(importer, specifier, files) {
  let unresolved;
  if (specifier.startsWith('$lib/')) {
    unresolved = `site/src/lib/${specifier.slice(5)}`;
  } else if (specifier.startsWith('.')) {
    unresolved = posix.normalize(posix.join(posix.dirname(importer), specifier));
  } else {
    return null;
  }

  const base = unresolved.replace(/\.(?:js|jsx|mjs)$/u, '');
  const candidates = [
    unresolved,
    base,
    ...sourceExtensions.map(suffix => `${base}${suffix}`),
    ...sourceExtensions.map(suffix => `${base}/index${suffix}`),
  ];
  return candidates.find(candidate => files.has(candidate)) ?? null;
}

function hasModifier(statement, kind) {
  return (statement.modifiers ?? []).some(modifier => modifier.kind === kind);
}

function exportedNames(sourceFile) {
  const names = new Set();
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement)) {
      names.add('default');
      continue;
    }
    if (ts.isExportDeclaration(statement)) {
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) names.add(element.name.text);
      }
      continue;
    }
    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;
    if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
      names.add('default');
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
      }
      continue;
    }
    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name
    ) {
      names.add(statement.name.text);
    }
  }
  return names;
}

function isRuntimeEntry(path) {
  return frameworkEntries.has(path) || path.startsWith('site/src/routes/');
}

const files = new Set([
  ...(await Promise.all(consumerRoots.map(sourceFiles))).flat(),
  ...consumerEntryFiles,
]);
const productionFiles = new Set((await Promise.all(productionRoots.map(sourceFiles))).flat());
const syntaxTrees = new Map();
const exportsByFile = new Map();
const usedByFile = new Map([...files].map(path => [path, new Set()]));

for (const path of files) {
  const source = await readFile(new URL(path, workspaceRoot), 'utf8');
  const sourceFile = ts.createSourceFile(
    path,
    scriptSource(path, source),
    ts.ScriptTarget.Latest,
    true,
    scriptKind(path)
  );
  syntaxTrees.set(path, sourceFile);
  exportsByFile.set(path, exportedNames(sourceFile));
}

function markAllUsed(target) {
  const used = usedByFile.get(target);
  if (used === undefined) return;
  for (const name of exportsByFile.get(target) ?? []) used.add(name);
}

for (const [path, sourceFile] of syntaxTrees) {
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
    const moduleSpecifier = statement.moduleSpecifier;
    if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier)) continue;
    const target = resolveImport(path, moduleSpecifier.text, files);
    if (target === null) continue;
    const used = usedByFile.get(target);
    if (used === undefined) continue;

    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (!clause) continue;
      if (clause.name) used.add('default');
      const bindings = clause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) {
        markAllUsed(target);
      } else if (bindings) {
        for (const element of bindings.elements) {
          used.add((element.propertyName ?? element.name).text);
        }
      }
    } else if (!statement.exportClause) {
      markAllUsed(target);
    } else if (ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        used.add((element.propertyName ?? element.name).text);
      }
    }
  }

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1
    ) {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteral(argument)) {
        const target = resolveImport(path, argument.text, files);
        if (target !== null) markAllUsed(target);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

const violations = [];
for (const path of productionFiles) {
  if (isRuntimeEntry(path) || /\.(?:test|spec)\.[^.]+$/u.test(path)) continue;
  const used = usedByFile.get(path) ?? new Set();
  const unused = [...(exportsByFile.get(path) ?? [])].filter(name => !used.has(name)).toSorted();
  if (unused.length > 0) violations.push({ path, unused });
}

for (const violation of violations.toSorted((left, right) => left.path.localeCompare(right.path))) {
  process.stderr.write(
    `[unused-exports] ${violation.path}: ${violation.unused.join(', ')} has no repository caller\n`
  );
}

if (violations.length > 0) process.exitCode = 1;
else process.stdout.write(`[unused-exports] verified ${productionFiles.size} production modules\n`);
