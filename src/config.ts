import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CONFIG_DIR = join(homedir(), '.config', 'ghp-cli');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export interface PlanShortcut {
    status?: string;
    mine?: boolean;
    unassigned?: boolean;
    slice?: string[];
    project?: string;
    sort?: string;
}

export interface Config {
    // General settings
    mainBranch: string;
    branchPattern: string;
    startWorkingStatus: string;
    doneStatus: string;

    // Command defaults
    defaults?: {
        plan?: PlanShortcut;
        addIssue?: {
            template?: string;  // default template name from .github/ISSUE_TEMPLATE/
            project?: string;   // default project
            status?: string;    // default initial status
        };
    };

    // Named shortcuts for plan command
    shortcuts?: {
        [name: string]: PlanShortcut;
    };
}

const DEFAULT_CONFIG: Config = {
    mainBranch: 'main',
    branchPattern: '{user}/{number}-{title}',
    startWorkingStatus: 'In Progress',
    doneStatus: 'Done',
    defaults: {},
    shortcuts: {},
};

export function loadConfig(): Config {
    try {
        if (existsSync(CONFIG_FILE)) {
            const data = readFileSync(CONFIG_FILE, 'utf-8');
            return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
        }
    } catch {
        // Ignore errors, use defaults
    }
    return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: Partial<Config>): void {
    const current = loadConfig();
    const merged = { ...current, ...config };

    if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true });
    }

    writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
}

export function getConfig<K extends keyof Config>(key: K): Config[K] {
    const config = loadConfig();
    return config[key];
}

export function setConfig<K extends keyof Config>(key: K, value: Config[K]): void {
    saveConfig({ [key]: value });
}

export function getShortcut(name: string): PlanShortcut | undefined {
    const config = loadConfig();
    return config.shortcuts?.[name];
}

export function setShortcut(name: string, shortcut: PlanShortcut): void {
    const config = loadConfig();
    const shortcuts = { ...config.shortcuts, [name]: shortcut };
    saveConfig({ shortcuts });
}

export function deleteShortcut(name: string): void {
    const config = loadConfig();
    if (config.shortcuts) {
        delete config.shortcuts[name];
        saveConfig({ shortcuts: config.shortcuts });
    }
}

export function listShortcuts(): Record<string, PlanShortcut> {
    const config = loadConfig();
    return config.shortcuts || {};
}

export function getPlanDefaults(): PlanShortcut {
    const config = loadConfig();
    return config.defaults?.plan || {};
}

export function setPlanDefaults(defaults: PlanShortcut): void {
    const config = loadConfig();
    saveConfig({
        defaults: { ...config.defaults, plan: defaults }
    });
}

export function getConfigPath(): string {
    return CONFIG_FILE;
}

export function getAddIssueDefaults(): { template?: string; project?: string; status?: string } {
    const config = loadConfig();
    return config.defaults?.addIssue || {};
}

export const CONFIG_KEYS = ['mainBranch', 'branchPattern', 'startWorkingStatus', 'doneStatus'] as const;

export function listConfig(): Record<string, string | undefined> {
    const config = loadConfig();
    return {
        mainBranch: config.mainBranch,
        branchPattern: config.branchPattern,
        startWorkingStatus: config.startWorkingStatus,
        doneStatus: config.doneStatus,
    };
}
