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
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const _ = require("lodash");
const yazl = require("yazl");
const nls_1 = require("./nls");
const util = require("./util");
const _glob = require("glob");
const minimatch = require("minimatch");
const denodeify = require("denodeify");
const markdownit = require("markdown-it");
const cheerio = require("cheerio");
const url = require("url");
const mime_1 = require("mime");
const urljoin = require("url-join");
const validation_1 = require("./validation");
const npm_1 = require("./npm");
const readFile = denodeify(fs.readFile);
const unlink = denodeify(fs.unlink);
const stat = denodeify(fs.stat);
const glob = denodeify(_glob);
const resourcesPath = path.join(path.dirname(__dirname), 'resources');
const vsixManifestTemplatePath = path.join(resourcesPath, 'extension.vsixmanifest');
const contentTypesTemplatePath = path.join(resourcesPath, '[Content_Types].xml');
const MinimatchOptions = { dot: true };
function isInMemoryFile(file) {
    return !!file.contents;
}
function read(file) {
    if (isInMemoryFile(file)) {
        return Promise.resolve(file.contents).then(b => (typeof b === 'string' ? b : b.toString('utf8')));
    }
    else {
        return readFile(file.localPath, 'utf8');
    }
}
exports.read = read;
class BaseProcessor {
    constructor(manifest) {
        this.manifest = manifest;
        this.assets = [];
        this.tags = [];
        this.vsix = Object.create(null);
    }
    onFile(file) {
        return Promise.resolve(file);
    }
    onEnd() {
        return Promise.resolve(null);
    }
}
exports.BaseProcessor = BaseProcessor;
function getUrl(url) {
    if (!url) {
        return null;
    }
    if (typeof url === 'string') {
        return url;
    }
    return url.url;
}
function getRepositoryUrl(url) {
    const result = getUrl(url);
    if (/^[^\/]+\/[^\/]+$/.test(result)) {
        return `https://github.com/${result}.git`;
    }
    return result;
}
// Contributed by Mozilla develpoer authors
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}
function toExtensionTags(extensions) {
    return extensions
        .map(s => s.replace(/\W/g, ''))
        .filter(s => !!s)
        .map(s => `__ext_${s}`);
}
function toLanguagePackTags(translations, languageId) {
    return (translations || [])
        .map(({ id }) => [`__lp_${id}`, `__lp-${languageId}_${id}`])
        .reduce((r, t) => [...r, ...t], []);
}
/* This list is also maintained by the Marketplace team.
 * Remember to reach out to them when adding new domains.
 */
const TrustedSVGSources = [
    'api.bintray.com',
    'api.travis-ci.com',
    'api.travis-ci.org',
    'app.fossa.io',
    'badge.buildkite.com',
    'badge.fury.io',
    'badge.waffle.io',
    'badgen.net',
    'badges.frapsoft.com',
    'badges.gitter.im',
    'badges.greenkeeper.io',
    'cdn.travis-ci.com',
    'cdn.travis-ci.org',
    'ci.appveyor.com',
    'circleci.com',
    'cla.opensource.microsoft.com',
    'codacy.com',
    'codeclimate.com',
    'codecov.io',
    'coveralls.io',
    'david-dm.org',
    'deepscan.io',
    'dev.azure.com',
    'docs.rs',
    'flat.badgen.net',
    'gemnasium.com',
    'githost.io',
    'gitlab.com',
    'godoc.org',
    'goreportcard.com',
    'img.shields.io',
    'isitmaintained.com',
    'marketplace.visualstudio.com',
    'nodesecurity.io',
    'opencollective.com',
    'snyk.io',
    'travis-ci.com',
    'travis-ci.org',
    'visualstudio.com',
    'vsmarketplacebadge.apphb.com',
    'www.bithound.io',
    'www.versioneye.com',
];
function isGitHubRepository(repository) {
    return /^https:\/\/github\.com\/|^git@github\.com:/.test(repository || '');
}
function isGitHubBadge(href) {
    return /^https:\/\/github\.com\/[^/]+\/[^/]+\/workflows\/.*badge\.svg/.test(href || '');
}
function isHostTrusted(url) {
    return TrustedSVGSources.indexOf(url.host.toLowerCase()) > -1 || isGitHubBadge(url.href);
}
class ManifestProcessor extends BaseProcessor {
    constructor(manifest) {
        super(manifest);
        const flags = ['Public'];
        if (manifest.preview) {
            flags.push('Preview');
        }
        const repository = getRepositoryUrl(manifest.repository);
        const isGitHub = isGitHubRepository(repository);
        let enableMarketplaceQnA;
        let customerQnALink;
        if (manifest.qna === 'marketplace') {
            enableMarketplaceQnA = true;
        }
        else if (typeof manifest.qna === 'string') {
            customerQnALink = manifest.qna;
        }
        else if (manifest.qna === false) {
            enableMarketplaceQnA = false;
        }
        const extensionKind = getExtensionKind(manifest);
        this.vsix = Object.assign({}, this.vsix, { id: manifest.name, displayName: manifest.displayName || manifest.name, version: manifest.version, publisher: manifest.publisher, engine: manifest.engines['vscode'], description: manifest.description || '', categories: (manifest.categories || []).join(','), flags: flags.join(' '), links: {
                repository,
                bugs: getUrl(manifest.bugs),
                homepage: manifest.homepage,
            }, galleryBanner: manifest.galleryBanner || {}, badges: manifest.badges, githubMarkdown: manifest.markdown !== 'standard', enableMarketplaceQnA,
            customerQnALink, extensionDependencies: _(manifest.extensionDependencies || [])
                .uniq()
                .join(','), extensionPack: _(manifest.extensionPack || [])
                .uniq()
                .join(','), extensionKind: extensionKind.join(','), localizedLanguages: manifest.contributes && manifest.contributes.localizations
                ? manifest.contributes.localizations
                    .map(loc => loc.localizedLanguageName || loc.languageName || loc.languageId)
                    .join(',')
                : '' });
        if (isGitHub) {
            this.vsix.links.github = repository;
        }
    }
    onEnd() {
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof this.manifest.extensionKind === 'string') {
                util.log.warn(`The 'extensionKind' property should be of type 'string[]'. Learn more at: https://aka.ms/vscode/api/incorrect-execution-location`);
            }
            if (this.manifest.publisher === 'vscode-samples') {
                throw new Error("It's not allowed to use the 'vscode-samples' publisher. Learn more at: https://code.visualstudio.com/api/working-with-extensions/publishing-extension.");
            }
            if (!this.manifest.repository) {
                util.log.warn(`A 'repository' field is missing from the 'package.json' manifest file.`);
                if (!/^y$/i.test(yield util.read('Do you want to continue? [y/N] '))) {
                    throw new Error('Aborted');
                }
            }
        });
    }
}
class TagsProcessor extends BaseProcessor {
    onEnd() {
        const keywords = this.manifest.keywords || [];
        const contributes = this.manifest.contributes;
        const activationEvents = this.manifest.activationEvents || [];
        const doesContribute = name => contributes && contributes[name] && contributes[name].length > 0;
        const colorThemes = doesContribute('themes') ? ['theme', 'color-theme'] : [];
        const iconThemes = doesContribute('iconThemes') ? ['theme', 'icon-theme'] : [];
        const snippets = doesContribute('snippets') ? ['snippet'] : [];
        const keybindings = doesContribute('keybindings') ? ['keybindings'] : [];
        const debuggers = doesContribute('debuggers') ? ['debuggers'] : [];
        const json = doesContribute('jsonValidation') ? ['json'] : [];
        const localizationContributions = ((contributes && contributes['localizations']) || []).reduce((r, l) => [...r, `lp-${l.languageId}`, ...toLanguagePackTags(l.translations, l.languageId)], []);
        const languageContributions = ((contributes && contributes['languages']) || []).reduce((r, l) => [...r, l.id, ...(l.aliases || []), ...toExtensionTags(l.extensions || [])], []);
        const languageActivations = activationEvents
            .map(e => /^onLanguage:(.*)$/.exec(e))
            .filter(r => !!r)
            .map(r => r[1]);
        const grammars = ((contributes && contributes['grammars']) || []).map(g => g.language);
        const description = this.manifest.description || '';
        const descriptionKeywords = Object.keys(TagsProcessor.Keywords).reduce((r, k) => r.concat(new RegExp('\\b(?:' + escapeRegExp(k) + ')(?!\\w)', 'gi').test(description) ? TagsProcessor.Keywords[k] : []), []);
        const tags = [
            ...keywords,
            ...colorThemes,
            ...iconThemes,
            ...snippets,
            ...keybindings,
            ...debuggers,
            ...json,
            ...localizationContributions,
            ...languageContributions,
            ...languageActivations,
            ...grammars,
            ...descriptionKeywords,
        ];
        this.tags = _(tags)
            .uniq() // deduplicate
            .compact() // remove falsey values
            .value();
        return Promise.resolve(null);
    }
}
TagsProcessor.Keywords = {
    git: ['git'],
    npm: ['node'],
    spell: ['markdown'],
    bootstrap: ['bootstrap'],
    lint: ['linters'],
    linting: ['linters'],
    react: ['javascript'],
    js: ['javascript'],
    node: ['javascript', 'node'],
    'c++': ['c++'],
    Cplusplus: ['c++'],
    xml: ['xml'],
    angular: ['javascript'],
    jquery: ['javascript'],
    php: ['php'],
    python: ['python'],
    latex: ['latex'],
    ruby: ['ruby'],
    java: ['java'],
    erlang: ['erlang'],
    sql: ['sql'],
    nodejs: ['node'],
    'c#': ['c#'],
    css: ['css'],
    javascript: ['javascript'],
    ftp: ['ftp'],
    haskell: ['haskell'],
    unity: ['unity'],
    terminal: ['terminal'],
    powershell: ['powershell'],
    laravel: ['laravel'],
    meteor: ['meteor'],
    emmet: ['emmet'],
    eslint: ['linters'],
    tfs: ['tfs'],
    rust: ['rust'],
};
exports.TagsProcessor = TagsProcessor;
class MarkdownProcessor extends BaseProcessor {
    constructor(manifest, name, regexp, assetType, options = {}) {
        super(manifest);
        this.name = name;
        this.regexp = regexp;
        this.assetType = assetType;
        const guess = this.guessBaseUrls(options.githubBranch);
        this.baseContentUrl = options.baseContentUrl || (guess && guess.content);
        this.baseImagesUrl = options.baseImagesUrl || options.baseContentUrl || (guess && guess.images);
        this.repositoryUrl = guess && guess.repository;
        this.isGitHub = isGitHubRepository(this.repositoryUrl);
        this.expandGitHubIssueLinks =
            typeof options.expandGitHubIssueLinks === 'boolean' ? options.expandGitHubIssueLinks : true;
    }
    onFile(file) {
        return __awaiter(this, void 0, void 0, function* () {
            const path = util.normalize(file.path);
            if (!this.regexp.test(path)) {
                return Promise.resolve(file);
            }
            this.assets.push({ type: this.assetType, path });
            let contents = yield read(file);
            if (/This is the README for your extension /.test(contents)) {
                throw new Error(`Make sure to edit the README.md file before you package or publish your extension.`);
            }
            const markdownPathRegex = /(!?)\[([^\]\[]*|!\[[^\]\[]*]\([^\)]+\))\]\(([^\)]+)\)/g;
            const urlReplace = (_, isImage, title, link) => {
                if (/^mailto:/i.test(link)) {
                    return `${isImage}[${title}](${link})`;
                }
                const isLinkRelative = !/^\w+:\/\//.test(link) && link[0] !== '#';
                if (!this.baseContentUrl && !this.baseImagesUrl) {
                    const asset = isImage ? 'image' : 'link';
                    if (isLinkRelative) {
                        throw new Error(`Couldn't detect the repository where this extension is published. The ${asset} '${link}' will be broken in ${this.name}. Please provide the repository URL in package.json or use the --baseContentUrl and --baseImagesUrl options.`);
                    }
                }
                title = title.replace(markdownPathRegex, urlReplace);
                const prefix = isImage ? this.baseImagesUrl : this.baseContentUrl;
                if (!prefix || !isLinkRelative) {
                    return `${isImage}[${title}](${link})`;
                }
                return `${isImage}[${title}](${urljoin(prefix, link)})`;
            };
            // Replace Markdown links with urls
            contents = contents.replace(markdownPathRegex, urlReplace);
            // Replace <img> links with urls
            contents = contents.replace(/<img.+?src=["']([/.\w\s-]+)['"].*?>/g, (all, link) => {
                const isLinkRelative = !/^\w+:\/\//.test(link) && link[0] !== '#';
                if (!this.baseImagesUrl && isLinkRelative) {
                    throw new Error(`Couldn't detect the repository where this extension is published. The image will be broken in ${this.name}. Please provide the repository URL in package.json or use the --baseContentUrl and --baseImagesUrl options.`);
                }
                const prefix = this.baseImagesUrl;
                if (!prefix || !isLinkRelative) {
                    return all;
                }
                return all.replace(link, urljoin(prefix, link));
            });
            if (this.isGitHub && this.expandGitHubIssueLinks) {
                const markdownIssueRegex = /(\s|\n)([\w\d_-]+\/[\w\d_-]+)?#(\d+)\b/g;
                const issueReplace = (all, prefix, ownerAndRepositoryName, issueNumber) => {
                    let result = all;
                    let owner;
                    let repositoryName;
                    if (ownerAndRepositoryName) {
                        [owner, repositoryName] = ownerAndRepositoryName.split('/', 2);
                    }
                    if (owner && repositoryName && issueNumber) {
                        // Issue in external repository
                        const issueUrl = urljoin('https://github.com', owner, repositoryName, 'issues', issueNumber);
                        result = prefix + `[${owner}/${repositoryName}#${issueNumber}](${issueUrl})`;
                    }
                    else if (!owner && !repositoryName && issueNumber) {
                        // Issue in own repository
                        result = prefix + `[#${issueNumber}](${urljoin(this.repositoryUrl, 'issues', issueNumber)})`;
                    }
                    return result;
                };
                // Replace Markdown issue references with urls
                contents = contents.replace(markdownIssueRegex, issueReplace);
            }
            const html = markdownit({ html: true }).render(contents);
            const $ = cheerio.load(html);
            $('img').each((_, img) => {
                const src = decodeURI(img.attribs.src);
                const srcUrl = url.parse(src);
                if (/^data:$/i.test(srcUrl.protocol) && /^image$/i.test(srcUrl.host) && /\/svg/i.test(srcUrl.path)) {
                    throw new Error(`SVG data URLs are not allowed in ${this.name}: ${src}`);
                }
                if (!/^https:$/i.test(srcUrl.protocol)) {
                    throw new Error(`Images in ${this.name} must come from an HTTPS source: ${src}`);
                }
                if (/\.svg$/i.test(srcUrl.pathname) && !isHostTrusted(srcUrl)) {
                    throw new Error(`SVGs are restricted in ${this.name}; please use other file image formats, such as PNG: ${src}`);
                }
            });
            $('svg').each(() => {
                throw new Error(`SVG tags are not allowed in ${this.name}.`);
            });
            return {
                path: file.path,
                contents: Buffer.from(contents, 'utf8'),
            };
        });
    }
    // GitHub heuristics
    guessBaseUrls(githubBranch) {
        let repository = null;
        if (typeof this.manifest.repository === 'string') {
            repository = this.manifest.repository;
        }
        else if (this.manifest.repository && typeof this.manifest.repository['url'] === 'string') {
            repository = this.manifest.repository['url'];
        }
        if (!repository) {
            return null;
        }
        const regex = /github\.com\/([^/]+)\/([^/]+)(\/|$)/;
        const match = regex.exec(repository);
        if (!match) {
            return null;
        }
        const account = match[1];
        const repositoryName = match[2].replace(/\.git$/i, '');
        const branchName = githubBranch ? githubBranch : 'master';
        return {
            content: `https://github.com/${account}/${repositoryName}/blob/${branchName}`,
            images: `https://github.com/${account}/${repositoryName}/raw/${branchName}`,
            repository: `https://github.com/${account}/${repositoryName}`,
        };
    }
}
exports.MarkdownProcessor = MarkdownProcessor;
class ReadmeProcessor extends MarkdownProcessor {
    constructor(manifest, options = {}) {
        super(manifest, 'README.md', /^extension\/readme.md$/i, 'Microsoft.VisualStudio.Services.Content.Details', options);
    }
}
exports.ReadmeProcessor = ReadmeProcessor;
class ChangelogProcessor extends MarkdownProcessor {
    constructor(manifest, options = {}) {
        super(manifest, 'CHANGELOG.md', /^extension\/changelog.md$/i, 'Microsoft.VisualStudio.Services.Content.Changelog', options);
    }
}
exports.ChangelogProcessor = ChangelogProcessor;
class LicenseProcessor extends BaseProcessor {
    constructor(manifest) {
        super(manifest);
        this.didFindLicense = false;
        const match = /^SEE LICENSE IN (.*)$/.exec(manifest.license || '');
        if (!match || !match[1]) {
            this.filter = name => /^extension\/license(\.(md|txt))?$/i.test(name);
        }
        else {
            const regexp = new RegExp('^extension/' + match[1] + '$');
            this.filter = regexp.test.bind(regexp);
        }
        this.vsix.license = null;
    }
    onFile(file) {
        if (!this.didFindLicense) {
            let normalizedPath = util.normalize(file.path);
            if (this.filter(normalizedPath)) {
                if (!path.extname(normalizedPath)) {
                    file.path += '.txt';
                    normalizedPath += '.txt';
                }
                this.assets.push({ type: 'Microsoft.VisualStudio.Services.Content.License', path: normalizedPath });
                this.vsix.license = normalizedPath;
                this.didFindLicense = true;
            }
        }
        return Promise.resolve(file);
    }
}
class IconProcessor extends BaseProcessor {
    constructor(manifest) {
        super(manifest);
        this.didFindIcon = false;
        this.icon = manifest.icon ? `extension/${manifest.icon}` : null;
        this.vsix.icon = null;
    }
    onFile(file) {
        const normalizedPath = util.normalize(file.path);
        if (normalizedPath === this.icon) {
            this.didFindIcon = true;
            this.assets.push({ type: 'Microsoft.VisualStudio.Services.Icons.Default', path: normalizedPath });
            this.vsix.icon = this.icon;
        }
        return Promise.resolve(file);
    }
    onEnd() {
        if (this.icon && !this.didFindIcon) {
            return Promise.reject(new Error(`The specified icon '${this.icon}' wasn't found in the extension.`));
        }
        return Promise.resolve(null);
    }
}
function isSupportedWebExtension(manifest, extensionsReport) {
    const id = `${manifest.publisher}.${manifest.name}`;
    return (extensionsReport.web.publishers.some(publisher => manifest.publisher === publisher) ||
        extensionsReport.web.extensions.some(extension => extension === id));
}
exports.isSupportedWebExtension = isSupportedWebExtension;
function isWebKind(manifest) {
    const extensionKind = getExtensionKind(manifest);
    return extensionKind.some(kind => kind === 'web');
}
exports.isWebKind = isWebKind;
const workspaceExtensionPoints = ['terminal', 'debuggers', 'jsonValidation'];
function getExtensionKind(manifest) {
    // check the manifest
    if (manifest.extensionKind) {
        return Array.isArray(manifest.extensionKind)
            ? manifest.extensionKind
            : manifest.extensionKind === 'ui'
                ? ['ui', 'workspace']
                : [manifest.extensionKind];
    }
    // Not an UI extension if it has main
    if (manifest.main) {
        if (manifest.browser) {
            return ['workspace', 'web'];
        }
        return ['workspace'];
    }
    if (manifest.browser) {
        return ['web'];
    }
    const isNonEmptyArray = obj => Array.isArray(obj) && obj.length > 0;
    // Not an UI nor web extension if it has dependencies or an extension pack
    if (isNonEmptyArray(manifest.extensionDependencies) || isNonEmptyArray(manifest.extensionPack)) {
        return ['workspace'];
    }
    if (manifest.contributes) {
        // Not an UI nor web extension if it has workspace contributions
        for (const contribution of Object.keys(manifest.contributes)) {
            if (workspaceExtensionPoints.indexOf(contribution) !== -1) {
                return ['workspace'];
            }
        }
    }
    return ['ui', 'workspace', 'web'];
}
class WebExtensionProcessor extends BaseProcessor {
    constructor(manifest, options) {
        super(manifest);
        this.isWebKind = false;
        this.isWebKind = options.web && isWebKind(manifest);
    }
    onFile(file) {
        if (this.isWebKind) {
            const path = util.normalize(file.path);
            if (/\.svg$/i.test(path)) {
                throw new Error(`SVGs can't be used in a web extension: ${path}`);
            }
            this.assets.push({ type: `Microsoft.VisualStudio.Code.WebResources/${path}`, path });
        }
        return Promise.resolve(file);
    }
    onEnd() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.assets.length > 25) {
                throw new Error('Cannot pack more than 25 files in a web extension. Use `vsce ls` to see all the files that will be packed and exclude those which are not needed in .vscodeignore.');
            }
            if (this.isWebKind) {
                this.vsix = Object.assign({}, this.vsix, { webExtension: true });
                this.tags = ['__web_extension'];
            }
        });
    }
}
exports.WebExtensionProcessor = WebExtensionProcessor;
class NLSProcessor extends BaseProcessor {
    constructor(manifest) {
        super(manifest);
        this.translations = Object.create(null);
        if (!manifest.contributes ||
            !manifest.contributes.localizations ||
            manifest.contributes.localizations.length === 0) {
            return;
        }
        const localizations = manifest.contributes.localizations;
        const translations = Object.create(null);
        // take last reference in the manifest for any given language
        for (const localization of localizations) {
            for (const translation of localization.translations) {
                if (translation.id === 'vscode' && !!translation.path) {
                    const translationPath = util.normalize(translation.path.replace(/^\.[\/\\]/, ''));
                    translations[localization.languageId.toUpperCase()] = `extension/${translationPath}`;
                }
            }
        }
        // invert the map for later easier retrieval
        for (const languageId of Object.keys(translations)) {
            this.translations[translations[languageId]] = languageId;
        }
    }
    onFile(file) {
        const normalizedPath = util.normalize(file.path);
        const language = this.translations[normalizedPath];
        if (language) {
            this.assets.push({ type: `Microsoft.VisualStudio.Code.Translation.${language}`, path: normalizedPath });
        }
        return Promise.resolve(file);
    }
}
exports.NLSProcessor = NLSProcessor;
class ValidationProcessor extends BaseProcessor {
    constructor() {
        super(...arguments);
        this.files = new Map();
        this.duplicates = new Set();
    }
    onFile(file) {
        return __awaiter(this, void 0, void 0, function* () {
            const lower = file.path.toLowerCase();
            const existing = this.files.get(lower);
            if (existing) {
                this.duplicates.add(lower);
                existing.push(file.path);
            }
            else {
                this.files.set(lower, [file.path]);
            }
            return file;
        });
    }
    onEnd() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.duplicates.size === 0) {
                return;
            }
            const messages = [
                `The following files have the same case insensitive path, which isn't supported by the VSIX format:`,
            ];
            for (const lower of this.duplicates) {
                for (const filePath of this.files.get(lower)) {
                    messages.push(`  - ${filePath}`);
                }
            }
            throw new Error(messages.join('\n'));
        });
    }
}
exports.ValidationProcessor = ValidationProcessor;
function validateManifest(manifest) {
    validation_1.validatePublisher(manifest.publisher);
    validation_1.validateExtensionName(manifest.name);
    if (!manifest.version) {
        throw new Error('Manifest missing field: version');
    }
    validation_1.validateVersion(manifest.version);
    if (!manifest.engines) {
        throw new Error('Manifest missing field: engines');
    }
    if (!manifest.engines['vscode']) {
        throw new Error('Manifest missing field: engines.vscode');
    }
    validation_1.validateEngineCompatibility(manifest.engines['vscode']);
    if (manifest.devDependencies && manifest.devDependencies['@types/vscode']) {
        validation_1.validateVSCodeTypesCompatibility(manifest.engines['vscode'], manifest.devDependencies['@types/vscode']);
    }
    if (/\.svg$/i.test(manifest.icon || '')) {
        throw new Error(`SVGs can't be used as icons: ${manifest.icon}`);
    }
    (manifest.badges || []).forEach(badge => {
        const decodedUrl = decodeURI(badge.url);
        const srcUrl = url.parse(decodedUrl);
        if (!/^https:$/i.test(srcUrl.protocol)) {
            throw new Error(`Badge URLs must come from an HTTPS source: ${badge.url}`);
        }
        if (/\.svg$/i.test(srcUrl.pathname) && !isHostTrusted(srcUrl)) {
            throw new Error(`Badge SVGs are restricted. Please use other file image formats, such as PNG: ${badge.url}`);
        }
    });
    Object.keys(manifest.dependencies || {}).forEach(dep => {
        if (dep === 'vscode') {
            throw new Error(`You should not depend on 'vscode' in your 'dependencies'. Did you mean to add it to 'devDependencies'?`);
        }
    });
    return manifest;
}
exports.validateManifest = validateManifest;
function readManifest(cwd = process.cwd(), nls = true) {
    const manifestPath = path.join(cwd, 'package.json');
    const manifestNLSPath = path.join(cwd, 'package.nls.json');
    const manifest = readFile(manifestPath, 'utf8')
        .catch(() => Promise.reject(`Extension manifest not found: ${manifestPath}`))
        .then(manifestStr => {
        try {
            return Promise.resolve(JSON.parse(manifestStr));
        }
        catch (e) {
            return Promise.reject(`Error parsing 'package.json' manifest file: not a valid JSON file.`);
        }
    })
        .then(validateManifest);
    if (!nls) {
        return manifest;
    }
    const manifestNLS = readFile(manifestNLSPath, 'utf8')
        .catch(err => (err.code !== 'ENOENT' ? Promise.reject(err) : Promise.resolve('{}')))
        .then(raw => {
        try {
            return Promise.resolve(JSON.parse(raw));
        }
        catch (e) {
            return Promise.reject(`Error parsing JSON manifest translations file: ${manifestNLSPath}`);
        }
    });
    return Promise.all([manifest, manifestNLS]).then(([manifest, translations]) => {
        return nls_1.patchNLS(manifest, translations);
    });
}
exports.readManifest = readManifest;
function toVsixManifest(vsix) {
    return readFile(vsixManifestTemplatePath, 'utf8')
        .then(vsixManifestTemplateStr => _.template(vsixManifestTemplateStr))
        .then(vsixManifestTemplate => vsixManifestTemplate(vsix));
}
exports.toVsixManifest = toVsixManifest;
const defaultExtensions = {
    '.json': 'application/json',
    '.vsixmanifest': 'text/xml',
};
function toContentTypes(files) {
    const extensions = Object.keys(_.keyBy(files, f => path.extname(f.path).toLowerCase()))
        .filter(e => !!e)
        .reduce((r, e) => (Object.assign({}, r, { [e]: mime_1.lookup(e) })), {});
    const allExtensions = Object.assign({}, extensions, defaultExtensions);
    const contentTypes = Object.keys(allExtensions).map(extension => ({
        extension,
        contentType: allExtensions[extension],
    }));
    return readFile(contentTypesTemplatePath, 'utf8')
        .then(contentTypesTemplateStr => _.template(contentTypesTemplateStr))
        .then(contentTypesTemplate => contentTypesTemplate({ contentTypes }));
}
exports.toContentTypes = toContentTypes;
const defaultIgnore = [
    '.vscodeignore',
    'package-lock.json',
    'yarn.lock',
    '.editorconfig',
    '.npmrc',
    '.yarnrc',
    '.gitattributes',
    '*.todo',
    'tslint.yaml',
    '.eslintrc*',
    '.babelrc*',
    '.prettierrc',
    'ISSUE_TEMPLATE.md',
    'CONTRIBUTING.md',
    'PULL_REQUEST_TEMPLATE.md',
    'CODE_OF_CONDUCT.md',
    '.github',
    '.travis.yml',
    'appveyor.yml',
    '**/.git/**',
    '**/*.vsix',
    '**/.DS_Store',
    '**/*.vsixmanifest',
    '**/.vscode-test/**',
];
function collectAllFiles(cwd, useYarn = false, dependencyEntryPoints) {
    return npm_1.getDependencies(cwd, useYarn, dependencyEntryPoints).then(deps => {
        const promises = deps.map(dep => {
            return glob('**', { cwd: dep, nodir: true, dot: true, ignore: 'node_modules/**' }).then(files => files.map(f => path.relative(cwd, path.join(dep, f))).map(f => f.replace(/\\/g, '/')));
        });
        return Promise.all(promises).then(util.flatten);
    });
}
function collectFiles(cwd, useYarn = false, dependencyEntryPoints, ignoreFile) {
    return collectAllFiles(cwd, useYarn, dependencyEntryPoints).then(files => {
        files = files.filter(f => !/\r$/m.test(f));
        return (readFile(ignoreFile ? ignoreFile : path.join(cwd, '.vscodeignore'), 'utf8')
            .catch(err => err.code !== 'ENOENT' ? Promise.reject(err) : ignoreFile ? Promise.reject(err) : Promise.resolve(''))
            // Parse raw ignore by splitting output into lines and filtering out empty lines and comments
            .then(rawIgnore => rawIgnore
            .split(/[\n\r]/)
            .map(s => s.trim())
            .filter(s => !!s)
            .filter(i => !/^\s*#/.test(i)))
            // Add '/**' to possible folder names
            .then(ignore => [
            ...ignore,
            ...ignore.filter(i => !/(^|\/)[^/]*\*[^/]*$/.test(i)).map(i => (/\/$/.test(i) ? `${i}**` : `${i}/**`)),
        ])
            // Combine with default ignore list
            .then(ignore => [...defaultIgnore, ...ignore, '!package.json'])
            // Split into ignore and negate list
            .then(ignore => _.partition(ignore, i => !/^\s*!/.test(i)))
            .then(r => ({ ignore: r[0], negate: r[1] }))
            // Filter out files
            .then(({ ignore, negate }) => files.filter(f => !ignore.some(i => minimatch(f, i, MinimatchOptions)) ||
            negate.some(i => minimatch(f, i.substr(1), MinimatchOptions)))));
    });
}
function processFiles(processors, files) {
    const processedFiles = files.map(file => util.chain(file, processors, (file, processor) => processor.onFile(file)));
    return Promise.all(processedFiles).then(files => {
        return util.sequence(processors.map(p => () => p.onEnd())).then(() => {
            const assets = _.flatten(processors.map(p => p.assets));
            const tags = _(_.flatten(processors.map(p => p.tags)))
                .uniq() // deduplicate
                .compact() // remove falsey values
                .join(',');
            const vsix = processors.reduce((r, p) => (Object.assign({}, r, p.vsix)), { assets, tags });
            return Promise.all([toVsixManifest(vsix), toContentTypes(files)]).then(result => {
                return [
                    { path: 'extension.vsixmanifest', contents: Buffer.from(result[0], 'utf8') },
                    { path: '[Content_Types].xml', contents: Buffer.from(result[1], 'utf8') },
                    ...files,
                ];
            });
        });
    });
}
exports.processFiles = processFiles;
function createDefaultProcessors(manifest, options = {}) {
    return [
        new ManifestProcessor(manifest),
        new TagsProcessor(manifest),
        new ReadmeProcessor(manifest, options),
        new ChangelogProcessor(manifest, options),
        new LicenseProcessor(manifest),
        new IconProcessor(manifest),
        new NLSProcessor(manifest),
        new WebExtensionProcessor(manifest, options),
        new ValidationProcessor(manifest),
    ];
}
exports.createDefaultProcessors = createDefaultProcessors;
function collect(manifest, options = {}) {
    const cwd = options.cwd || process.cwd();
    const useYarn = options.useYarn || false;
    const packagedDependencies = options.dependencyEntryPoints || undefined;
    const ignoreFile = options.ignoreFile || undefined;
    const processors = createDefaultProcessors(manifest, options);
    return collectFiles(cwd, useYarn, packagedDependencies, ignoreFile).then(fileNames => {
        const files = fileNames.map(f => ({ path: `extension/${f}`, localPath: path.join(cwd, f) }));
        return processFiles(processors, files);
    });
}
exports.collect = collect;
function writeVsix(files, packagePath) {
    return unlink(packagePath)
        .catch(err => (err.code !== 'ENOENT' ? Promise.reject(err) : Promise.resolve(null)))
        .then(() => new Promise((c, e) => {
        const zip = new yazl.ZipFile();
        files.forEach(f => isInMemoryFile(f)
            ? zip.addBuffer(typeof f.contents === 'string' ? Buffer.from(f.contents, 'utf8') : f.contents, f.path)
            : zip.addFile(f.localPath, f.path));
        zip.end();
        const zipStream = fs.createWriteStream(packagePath);
        zip.outputStream.pipe(zipStream);
        zip.outputStream.once('error', e);
        zipStream.once('error', e);
        zipStream.once('finish', () => c());
    }));
}
function getDefaultPackageName(manifest) {
    return `${manifest.name}-${manifest.version}.vsix`;
}
function prepublish(cwd, manifest, useYarn = false) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!manifest.scripts || !manifest.scripts['vscode:prepublish']) {
            return;
        }
        console.log(`Executing prepublish script '${useYarn ? 'yarn' : 'npm'} run vscode:prepublish'...`);
        yield new Promise((c, e) => {
            const tool = useYarn ? 'yarn' : 'npm';
            const child = cp.spawn(tool, ['run', 'vscode:prepublish'], { cwd, shell: true, stdio: 'inherit' });
            child.on('exit', code => (code === 0 ? c() : e(`${tool} failed with exit code ${code}`)));
            child.on('error', e);
        });
    });
}
function getPackagePath(cwd, manifest, options = {}) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!options.packagePath) {
            return path.join(cwd, getDefaultPackageName(manifest));
        }
        try {
            const _stat = yield stat(options.packagePath);
            if (_stat.isDirectory()) {
                return path.join(options.packagePath, getDefaultPackageName(manifest));
            }
            else {
                return options.packagePath;
            }
        }
        catch (_a) {
            return options.packagePath;
        }
    });
}
function pack(options = {}) {
    return __awaiter(this, void 0, void 0, function* () {
        const cwd = options.cwd || process.cwd();
        const manifest = yield readManifest(cwd);
        yield prepublish(cwd, manifest, options.useYarn);
        const files = yield collect(manifest, options);
        const jsFiles = files.filter(f => /\.js$/i.test(f.path));
        if (files.length > 5000 || jsFiles.length > 100) {
            console.log(`This extension consists of ${files.length} files, out of which ${jsFiles.length} are JavaScript files. For performance reasons, you should bundle your extension: https://aka.ms/vscode-bundle-extension . You should also exclude unnecessary files by adding them to your .vscodeignore: https://aka.ms/vscode-vscodeignore`);
        }
        const packagePath = yield getPackagePath(cwd, manifest, options);
        yield writeVsix(files, path.resolve(packagePath));
        return { manifest, packagePath, files };
    });
}
exports.pack = pack;
function packageCommand(options = {}) {
    return __awaiter(this, void 0, void 0, function* () {
        const { packagePath, files } = yield pack(options);
        const stats = yield stat(packagePath);
        let size = 0;
        let unit = '';
        if (stats.size > 1048576) {
            size = Math.round(stats.size / 10485.76) / 100;
            unit = 'MB';
        }
        else {
            size = Math.round(stats.size / 10.24) / 100;
            unit = 'KB';
        }
        util.log.done(`Packaged: ${packagePath} (${files.length} files, ${size}${unit})`);
    });
}
exports.packageCommand = packageCommand;
/**
 * Lists the files included in the extension's package. Does not run prepublish.
 */
function listFiles(cwd = process.cwd(), useYarn = false, packagedDependencies, ignoreFile) {
    return readManifest(cwd).then(() => collectFiles(cwd, useYarn, packagedDependencies, ignoreFile));
}
exports.listFiles = listFiles;
/**
 * Lists the files included in the extension's package. Runs prepublish.
 */
function ls(cwd = process.cwd(), useYarn = false, packagedDependencies, ignoreFile) {
    return readManifest(cwd)
        .then(manifest => prepublish(cwd, manifest, useYarn))
        .then(() => collectFiles(cwd, useYarn, packagedDependencies, ignoreFile))
        .then(files => files.forEach(f => console.log(`${f}`)));
}
exports.ls = ls;
