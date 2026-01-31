import chalk from 'chalk';
import { api } from '../github-api.js';
import { getCurrentBranch } from '../git-utils.js';
import { linkBranch, getBranchForIssue } from '../branch-linker.js';
import { resolveTargetRepo } from '../config.js';

interface LinkBranchOptions {
    repo?: string;
}

export async function linkBranchCommand(issue: string, branch: string | undefined, options: LinkBranchOptions): Promise<void> {
    const issueNumber = parseInt(issue, 10);
    if (isNaN(issueNumber)) {
        console.error(chalk.red('Error:'), 'Issue must be a number');
        process.exit(1);
    }

    // Resolve target repository (--repo flag > config.defaultRepo > detect from cwd)
    const repo = await resolveTargetRepo(options.repo);
    if (!repo) {
        if (options.repo) {
            console.error(chalk.red('Error:'), `Invalid repo format: ${options.repo}`);
            console.log(chalk.dim('Expected format: owner/name (e.g., bretwardjames/ghp-core)'));
        } else {
            console.error(chalk.red('Error:'), 'Could not determine target repository.');
            console.log(chalk.dim('Use --repo owner/name or set defaultRepo in config'));
        }
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
    const existingBranch = await getBranchForIssue(repo, issueNumber);
    if (existingBranch) {
        console.log(chalk.yellow('Note:'), `Issue #${issueNumber} was linked to "${existingBranch}"`);
    }

    // Create link (stores in issue body)
    const success = await linkBranch(repo, issueNumber, branchName);
    if (!success) {
        console.error(chalk.red('Error:'), 'Failed to link branch');
        process.exit(1);
    }
    console.log(chalk.green('✓'), `Linked "${branchName}" to #${issueNumber}: ${item.title}`);

    // If this branch is currently checked out, apply active label
    const currentBranch = await getCurrentBranch();
    if (currentBranch === branchName) {
        const activeLabel = api.getActiveLabelName();

        // Ensure the label exists
        await api.ensureLabel(repo, activeLabel);

        // Remove label from any other issues that have it
        const issuesWithLabel = await api.findIssuesWithLabel(repo, activeLabel);
        for (const otherIssue of issuesWithLabel) {
            if (otherIssue !== issueNumber) {
                await api.removeLabelFromIssue(repo, otherIssue, activeLabel);
                console.log(chalk.dim(`Removed ${activeLabel} from #${otherIssue}`));
            }
        }

        // Add label to current issue
        const labelAdded = await api.addLabelToIssue(repo, issueNumber, activeLabel);
        if (labelAdded) {
            console.log(chalk.green('✓'), `Applied "${activeLabel}" label (branch is checked out)`);
        }
    }
}
