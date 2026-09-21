import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const packageRules = {
  contracts: [], core: ["contracts"], application: ["contracts", "core"], ui: ["contracts"],
};
const coreRules = { geometry: [], brain: [], engine: ["geometry", "brain"], replay: ["engine"] };
const forbiddenGlobals = new Set([
  "Date", "performance", "fetch", "XMLHttpRequest", "WebSocket", "window", "document", "navigator",
  "process", "globalThis", "global", "eval", "Function", "setTimeout", "setInterval", "requestAnimationFrame",
]);
const slash = path => path.replaceAll("\\", "/");

function sourceFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}

function findCycles(graph, errors) {
  const done = new Set();
  const active = [];
  function visit(node) {
    if (active.includes(node)) {
      errors.push(`Dependency cycle: ${[...active.slice(active.indexOf(node)), node].join(" -> ")}`);
      return;
    }
    if (done.has(node)) return;
    active.push(node);
    for (const dependency of graph.get(node) ?? []) visit(dependency);
    active.pop();
    done.add(node);
  }
  for (const node of graph.keys()) visit(node);
}

export function checkBoundaries(root) {
  const errors = [];
  const packages = new Map();
  const packageGraph = new Map();
  const graph = new Map();
  for (const folder of readdirSync(join(root, "packages"))) {
    const directory = join(root, "packages", folder);
    const manifestPath = join(directory, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (!(folder in packageRules)) errors.push(`Undeclared module: ${folder}`);
    packages.set(manifest.name, { folder, directory, manifest });
  }
  for (const [name, pkg] of packages) {
    const dependencies = { ...pkg.manifest.dependencies, ...pkg.manifest.devDependencies, ...pkg.manifest.peerDependencies, ...pkg.manifest.optionalDependencies };
    const edges = new Set();
    for (const dependency of Object.keys(dependencies)) {
      const target = packages.get(dependency);
      if (target) {
        edges.add(dependency);
        if (!(packageRules[pkg.folder] ?? []).includes(target.folder)) errors.push(`${name}: forbidden dependency ${dependency}`);
        if (!dependencies[dependency].startsWith("workspace:")) errors.push(`${name}: ${dependency} must use workspace:`);
      } else if (pkg.folder !== "contracts" || dependency !== "ajv") {
        errors.push(`${name}: external dependency ${dependency} needs an explicit boundary decision`);
      }
    }
    packageGraph.set(name, edges);
    for (const path of sourceFiles(join(pkg.directory, "src"))) {
      const label = slash(relative(root, path));
      const module = slash(relative(join(pkg.directory, "src"), path)).split("/")[0];
      if (pkg.folder === "core" && !(module in coreRules)) errors.push(`${label}: undeclared core module`);
      const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
      const imports = [];
      const report = (node, message) => errors.push(`${label}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}: ${message}`);
      function addImport(node) {
        if (node && ts.isStringLiteralLike(node)) imports.push({ node, specifier: node.text });
        else report(node ?? source, "Computed import/require is not allowed");
      }
      function visit(node) {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) addImport(node.moduleSpecifier);
        if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) addImport(node.argument.literal);
        if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) addImport(node.moduleReference.expression);
        if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) addImport(node.arguments[0]);
        if (pkg.folder === "core") {
          if (ts.isIdentifier(node) && forbiddenGlobals.has(node.text)) report(node, `Forbidden simulation global: ${node.text}`);
          if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Math" && ["random", "cos", "sin", "tan", "atan2"].includes(node.name.text)) report(node, `Use seeded RNG/integer lookup tables instead of Math.${node.name.text}`);
          if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Math") report(node, "Computed Math access is not allowed in simulation");
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
      const fileEdges = new Set();
      for (const { node, specifier } of imports) {
        if (specifier.startsWith(".")) {
          const resolved = resolve(dirname(path), specifier).replace(/\.js$/, ".ts").replace(/\.mjs$/, ".mts");
          const within = slash(relative(join(pkg.directory, "src"), resolved));
          if (within.startsWith("../") || within === "..") report(node, "Cross-package relative import; use public package exports");
          else if (!existsSync(resolved)) report(node, `Unresolved import: ${specifier}`);
          else {
            fileEdges.add(resolved);
            if (pkg.folder === "core") {
              const targetModule = within.split("/")[0];
              if (targetModule !== module && (!(coreRules[module] ?? []).includes(targetModule) || within !== `${targetModule}/index.ts`)) report(node, `Forbidden core import: ${module} -> ${within}`);
            }
          }
        } else {
          const targetEntry = [...packages.entries()].find(([targetName]) => specifier === targetName || specifier.startsWith(`${targetName}/`));
          if (!targetEntry) {
            const external = Object.keys(dependencies).some(dependency => specifier === dependency || specifier.startsWith(`${dependency}/`));
            if (!external || pkg.folder !== "contracts" || !/^ajv(?:\/|$)/.test(specifier)) report(node, `Forbidden external import: ${specifier}`);
            continue;
          }
          const [targetName, target] = targetEntry;
          if (targetName === name || !(packageRules[pkg.folder] ?? []).includes(target.folder)) report(node, `Forbidden package import: ${name} -> ${targetName}`);
          if (!(targetName in dependencies)) report(node, `Undeclared dependency: ${targetName}`);
          const subpath = specifier === targetName ? "." : `.${specifier.slice(targetName.length)}`;
          if (!(subpath in (target.manifest.exports ?? {}))) report(node, `Private package import: ${specifier}`);
        }
      }
      graph.set(path, fileEdges);
    }
  }
  findCycles(packageGraph, errors);
  findCycles(graph, errors);
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = checkBoundaries(fileURLToPath(new URL("..", import.meta.url)));
  if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
  else console.log("Module boundaries: OK (packages, core modules, public exports, cycles, simulation globals)");
}
