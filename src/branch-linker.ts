import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

interface BranchLink {
    branch: string;
    issueNumber: number;
    issueTitle: string;
    itemId: string;
    repo: string;
    linkedAt: string;
}

const DATA_DIR = join(homedir(), '.config', 'ghp-cli');
const LINKS_FILE = join(DATA_DIR, 'branch-links.json');

function loadLinks(): BranchLink[] {
    try {
        if (existsSync(LINKS_FILE)) {
            const data = readFileSync(LINKS_FILE, 'utf-8');
            return JSON.parse(data);
        }
    } catch {
        // Ignore errors
    }
    return [];
}

function saveLinks(links: BranchLink[]): void {
    if (!existsSync(DATA_DIR)) {
        mkdirSync(DATA_DIR, { recursive: true });
    }
    writeFileSync(LINKS_FILE, JSON.stringify(links, null, 2));
}

export function linkBranch(
    branch: string,
    issueNumber: number,
    issueTitle: string,
    itemId: string,
    repo: string
): void {
    const links = loadLinks();
    
    // Remove existing link for this branch or issue in this repo
    const filtered = links.filter(l => 
        !(l.repo === repo && (l.branch === branch || l.issueNumber === issueNumber))
    );
    
    filtered.push({
        branch,
        issueNumber,
        issueTitle,
        itemId,
        repo,
        linkedAt: new Date().toISOString(),
    });
    
    saveLinks(filtered);
}

export function unlinkBranch(repo: string, issueNumber: number): boolean {
    const links = loadLinks();
    const filtered = links.filter(l => !(l.repo === repo && l.issueNumber === issueNumber));
    
    if (filtered.length === links.length) {
        return false; // Nothing was removed
    }
    
    saveLinks(filtered);
    return true;
}

export function getBranchForIssue(repo: string, issueNumber: number): string | null {
    const links = loadLinks();
    const link = links.find(l => l.repo === repo && l.issueNumber === issueNumber);
    return link?.branch || null;
}

export function getIssueForBranch(repo: string, branch: string): BranchLink | null {
    const links = loadLinks();
    return links.find(l => l.repo === repo && l.branch === branch) || null;
}

export function getAllLinksForRepo(repo: string): BranchLink[] {
    const links = loadLinks();
    return links.filter(l => l.repo === repo);
}
