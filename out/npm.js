"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
// import * as path from 'path';
// import * as fs from 'fs';
const cp = require("child_process");
function parseStdout({ stdout }) {
    return stdout.split(/[\r\n]/).filter(line => !!line)[0];
}
function exec(command, options = {}, cancellationToken) {
    return new Promise((c, e) => {
        let disposeCancellationListener = null;
        const child = cp.exec(command, Object.assign({}, options, { encoding: 'utf8' }), (err, stdout, stderr) => {
            if (disposeCancellationListener) {
                disposeCancellationListener();
                disposeCancellationListener = null;
            }
            if (err) {
                return e(err);
            }
            c({ stdout, stderr });
        });
        if (cancellationToken) {
            disposeCancellationListener = cancellationToken.subscribe(err => {
                child.kill();
                e(err);
            });
        }
    });
}
function checkNPM(cancellationToken) {
    return exec('npm -v', {}, cancellationToken).then(({ stdout }) => {
        const version = stdout.trim();
        if (/^3\.7\.[0123]$/.test(version)) {
            return Promise.reject(`npm@${version} doesn't work with vsce. Please update npm: npm install -g npm`);
        }
    });
}
/*
function asYarnDependency(prefix: string, tree: YarnTreeNode, prune: boolean): YarnDependency | null {
    if (prune && /@[\^~]/.test(tree.name)) {
        return null;
    }

    let name: string;

    try {
        const parseResult = parseSemver(tree.name);
        name = parseResult.name;
    } catch (err) {
        name = tree.name.replace(/^([^@+])@.*$/, '$1');
    }

    const dependencyPath = path.join(prefix, name);
    const children: YarnDependency[] = [];

    for (const child of tree.children || []) {
        const dep = asYarnDependency(path.join(prefix, name, 'node_modules'), child, prune);

        if (dep) {
            children.push(dep);
        }
    }

    return { name, path: dependencyPath, children };
}

function selectYarnDependencies(deps: YarnDependency[], packagedDependencies: string[]): YarnDependency[] {
    const index = new (class {
        private data: { [name: string]: YarnDependency } = Object.create(null);
        constructor() {
            for (const dep of deps) {
                if (this.data[dep.name]) {
                    throw Error(`Dependency seen more than once: ${dep.name}`);
                }
                this.data[dep.name] = dep;
            }
        }
        find(name: string): YarnDependency {
            let result = this.data[name];
            if (!result) {
                throw new Error(`Could not find dependency: ${name}`);
            }
            return result;
        }
    })();

    const reached = new (class {
        values: YarnDependency[] = [];
        add(dep: YarnDependency): boolean {
            if (this.values.indexOf(dep) < 0) {
                this.values.push(dep);
                return true;
            }
            return false;
        }
    })();

    const visit = (name: string) => {
        let dep = index.find(name);
        if (!reached.add(dep)) {
            // already seen -> done
            return;
        }
        for (const child of dep.children) {
            visit(child.name);
        }
    };
    packagedDependencies.forEach(visit);
    return reached.values;
}

async function getYarnProductionDependencies(cwd: string, packagedDependencies?: string[]): Promise<YarnDependency[]> {
    const raw = await new Promise<string>((c, e) =>
        cp.exec(
            'yarn list --prod --json',
            { cwd, encoding: 'utf8', env: { ...process.env }, maxBuffer: 5000 * 1024 },
            (err, stdout) => (err ? e(err) : c(stdout))
        )
    );
    const match = /^{"type":"tree".*$/m.exec(raw);

    if (!match || match.length !== 1) {
        throw new Error('Could not parse result of `yarn list --json`');
    }

    const usingPackagedDependencies = Array.isArray(packagedDependencies);
    const trees = JSON.parse(match[0]).data.trees as YarnTreeNode[];

    let result = trees
        .map(tree => asYarnDependency(path.join(cwd, 'node_modules'), tree, !usingPackagedDependencies))
        .filter(dep => !!dep);

    if (usingPackagedDependencies) {
        result = selectYarnDependencies(result, packagedDependencies);
    }

    return result;
}

async function getYarnDependencies(cwd: string, packagedDependencies?: string[]): Promise<string[]> {
    const result: string[] = [cwd];

    if (await new Promise(c => fs.exists(path.join(cwd, 'yarn.lock'), c))) {
        const deps = await getYarnProductionDependencies(cwd, packagedDependencies);
        const flatten = (dep: YarnDependency) => {
            result.push(dep.path);
            dep.children.forEach(flatten);
        };
        deps.forEach(flatten);
    }

    return _.uniq(result);
}*/
function getDependencies(cwd, useYarn = false, packagedDependencies) {
    return __awaiter(this, void 0, void 0, function* () {
        cwd && useYarn && packagedDependencies;
        return [];
    });
}
exports.getDependencies = getDependencies;
function getLatestVersion(name, cancellationToken) {
    return checkNPM(cancellationToken)
        .then(() => exec(`npm show ${name} version`, {}, cancellationToken))
        .then(parseStdout);
}
exports.getLatestVersion = getLatestVersion;