import chalk from 'chalk';
import { api } from '../github-api.js';
import { detectRepository, getCurrentBranch } from '../git-utils.js';
import { linkBranch, getBranchForIssue } from '../branch-linker.js';

export async function linkBranchCommand(issue: string, branch?: string): Promise<void> {
    const issueNumber = parseInt(issue, 10);
    if (isNaN(issueNumber)) {
        console.error(chalk.red('Error:'), 'Issue must be a number');
        process.exit(1);
    }

    // Detect repository
    const repo = await detectRepository();
    if (!repo) {
        console.error(chalk.red('Error:'), 'Not in a git repository with a GitHub remote');
        process.exit(1);
    }

    // Get branch name (default to current branch)
    const branchName = branch || await getCurrentBranch();
    if (!branchName) {
        console.error(chalk.red('Error:'), 'Could not determine branch. Specify a branch name.');
        process.exit(1);
    }

    // Authenticate
    const authenticated = await api.authenticate();
    if (!authenticated) {
        console.error(chalk.red('Error:'), 'Not authenticated. Run', chalk.cyan('ghp auth'));
        process.exit(1);
    }

    // Find the issue
    const item = await api.findItemByNumber(repo, issueNumber);
    if (!item) {
        console.error(chalk.red('Error:'), `Issue #${issueNumber} not found in any project`);
        process.exit(1);
    }

    // Check for existing link
    const existingBranch = getBranchForIssue(repo.fullName, issueNumber);
    if (existingBranch) {
        console.log(chalk.yellow('Note:'), `Issue #${issueNumber} was linked to "${existingBranch}"`);
    }

    // Create link
    linkBranch(branchName, issueNumber, item.title, item.id, repo.fullName);
    console.log(chalk.green('✓'), `Linked "${branchName}" to #${issueNumber}: ${item.title}`);
}
