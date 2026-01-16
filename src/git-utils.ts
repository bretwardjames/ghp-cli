import { exec } from 'child_process';
import { promisify } from 'util';
import type { RepoInfo } from './types.js';

const execAsync = promisify(exec);

/**
 * Detect the GitHub repository from the current directory's git remote
 */
export async function detectRepository(): Promise<RepoInfo | null> {
    try {
        const { stdout } = await execAsync('git remote get-url origin');
        const url = stdout.trim();
        return parseGitHubUrl(url);
    } catch {
        return null;
    }
}

/**
 * Parse a GitHub URL into owner and repo name
 */
export function parseGitHubUrl(url: string): RepoInfo | null {
    // Handle SSH format: git@github.com:owner/repo.git
    const sshMatch = url.match(/git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
    if (sshMatch) {
        return {
            owner: sshMatch[1],
            name: sshMatch[2],
            fullName: `${sshMatch[1]}/${sshMatch[2]}`,
        };
    }

    // Handle HTTPS format: https://github.com/owner/repo.git
    const httpsMatch = url.match(/https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/);
    if (httpsMatch) {
        return {
            owner: httpsMatch[1],
            name: httpsMatch[2],
            fullName: `${httpsMatch[1]}/${httpsMatch[2]}`,
        };
    }

    return null;
}

/**
 * Get the current git branch
 */
export async function getCurrentBranch(): Promise<string | null> {
    try {
        const { stdout } = await execAsync('git branch --show-current');
        return stdout.trim() || null;
    } catch {
        return null;
    }
}

/**
 * Check if there are uncommitted changes
 */
export async function hasUncommittedChanges(): Promise<boolean> {
    try {
        const { stdout } = await execAsync('git status --porcelain');
        return stdout.trim().length > 0;
    } catch {
        return false;
    }
}

/**
 * Check if a branch exists locally
 */
export async function branchExists(branchName: string): Promise<boolean> {
    try {
        await execAsync(`git show-ref --verify --quiet refs/heads/${branchName}`);
        return true;
    } catch {
        return false;
    }
}

/**
 * Create and checkout a new branch
 */
export async function createBranch(branchName: string): Promise<void> {
    await execAsync(`git checkout -b "${branchName}"`);
}

/**
 * Checkout an existing branch
 */
export async function checkoutBranch(branchName: string): Promise<void> {
    await execAsync(`git checkout "${branchName}"`);
}

/**
 * Pull latest from origin
 */
export async function pullLatest(): Promise<void> {
    await execAsync('git pull');
}

/**
 * Fetch from origin
 */
export async function fetchOrigin(): Promise<void> {
    await execAsync('git fetch origin');
}

/**
 * Get number of commits behind origin
 */
export async function getCommitsBehind(branch: string): Promise<number> {
    try {
        await fetchOrigin();
        const { stdout } = await execAsync(`git rev-list --count ${branch}..origin/${branch}`);
        return parseInt(stdout.trim(), 10) || 0;
    } catch {
        return 0;
    }
}

/**
 * Sanitize a string for use in a branch name
 */
export function sanitizeForBranchName(str: string): string {
    return str
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50);
}

/**
 * Generate a branch name from a pattern
 */
export function generateBranchName(
    pattern: string,
    vars: { user: string; number: number | null; title: string; repo: string },
    maxLength: number = 60
): string {
    const sanitizedTitle = sanitizeForBranchName(vars.title);
    
    let branch = pattern
        .replace('{user}', vars.user)
        .replace('{number}', vars.number?.toString() || 'draft')
        .replace('{title}', sanitizedTitle)
        .replace('{repo}', vars.repo);

    if (branch.length > maxLength) {
        branch = branch.substring(0, maxLength).replace(/-$/, '');
    }

    return branch;
}
