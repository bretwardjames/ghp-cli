/**
 * CLI-specific branch linker with file-based storage.
 *
 * This module wraps the core BranchLinker with a file-based StorageAdapter
 * that stores links in ~/.config/ghp-cli/branch-links.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import {
    BranchLinker,
    type StorageAdapter,
    type BranchLink,
} from '@bretwardjames/ghp-core';

const DATA_DIR = join(homedir(), '.config', 'ghp-cli');
const LINKS_FILE = join(DATA_DIR, 'branch-links.json');

/**
 * File-based storage adapter for CLI usage
 */
const fileStorageAdapter: StorageAdapter = {
    load(): BranchLink[] {
        try {
            if (existsSync(LINKS_FILE)) {
                const data = readFileSync(LINKS_FILE, 'utf-8');
                return JSON.parse(data);
            }
        } catch {
            // Ignore errors, return empty array
        }
        return [];
    },

    save(links: BranchLink[]): void {
        if (!existsSync(DATA_DIR)) {
            mkdirSync(DATA_DIR, { recursive: true });
        }
        writeFileSync(LINKS_FILE, JSON.stringify(links, null, 2));
    },
};

// Create singleton linker instance
const linker = new BranchLinker(fileStorageAdapter);

/**
 * Create a link between a branch and an issue.
 * Backwards-compatible function signature for existing CLI code.
 */
export function linkBranch(
    branch: string,
    issueNumber: number,
    issueTitle: string,
    itemId: string,
    repo: string
): void {
    // Use sync-like behavior for backwards compatibility
    // The file adapter is synchronous so this works
    linker.link(branch, issueNumber, issueTitle, itemId, repo);
}

/**
 * Remove the link for an issue.
 * @returns true if a link was removed, false if no link existed
 */
export function unlinkBranch(repo: string, issueNumber: number): boolean {
    // Load, filter, and save synchronously for backwards compatibility
    const adapter = fileStorageAdapter;
    const links = adapter.load() as BranchLink[];
    const filtered = links.filter(l =>
        !(l.repo === repo && l.issueNumber === issueNumber)
    );

    if (filtered.length === links.length) {
        return false;
    }

    adapter.save(filtered);
    return true;
}

/**
 * Get the branch linked to an issue.
 */
export function getBranchForIssue(repo: string, issueNumber: number): string | null {
    const links = fileStorageAdapter.load() as BranchLink[];
    const link = links.find(l => l.repo === repo && l.issueNumber === issueNumber);
    return link?.branch || null;
}

/**
 * Get the full link info for a branch.
 */
export function getIssueForBranch(repo: string, branch: string): BranchLink | null {
    const links = fileStorageAdapter.load() as BranchLink[];
    return links.find(l => l.repo === repo && l.branch === branch) || null;
}

/**
 * Get all links for a repository.
 */
export function getAllLinksForRepo(repo: string): BranchLink[] {
    const links = fileStorageAdapter.load() as BranchLink[];
    return links.filter(l => l.repo === repo);
}

// Re-export the BranchLink type for consumers
export type { BranchLink } from '@bretwardjames/ghp-core';

// Also export the linker instance and adapter for advanced usage
export { linker, fileStorageAdapter };
