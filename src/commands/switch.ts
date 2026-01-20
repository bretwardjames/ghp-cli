import chalk from 'chalk';
import { api } from '../github-api.js';
import { detectRepository, checkoutBranch, branchExists, getCurrentBranch } from '../git-utils.js';
import { getBranchForIssue } from '../branch-linker.js';
import { getActiveLabelScope } from '../config.js';

export async function switchCommand(issue: string): Promise<void> {
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

    // Authenticate (needed to read issue body)
    const authenticated = await api.authenticate();
    if (!authenticated) {
        console.error(chalk.red('Error:'), 'Not authenticated. Run', chalk.cyan('ghp auth'));
        process.exit(1);
    }

    // Find linked branch
    const branchName = await getBranchForIssue(repo, issueNumber);
    if (!branchName) {
        console.error(chalk.red('Error:'), `No branch linked to issue #${issueNumber}`);
        console.log(chalk.dim('Use'), chalk.cyan(`ghp link-branch ${issueNumber}`), chalk.dim('to link a branch'));
        process.exit(1);
    }

    // Check if branch exists
    if (!(await branchExists(branchName))) {
        console.error(chalk.red('Error:'), `Branch "${branchName}" no longer exists`);
        process.exit(1);
    }

    // Check if already on that branch
    const currentBranch = await getCurrentBranch();
    if (currentBranch === branchName) {
        console.log(chalk.yellow('Already on branch:'), branchName);
        return;
    }

    // Switch to branch
    try {
        await checkoutBranch(branchName);
        console.log(chalk.green('✓'), `Switched to branch: ${branchName}`);
    } catch (error) {
        console.error(chalk.red('Error:'), 'Failed to switch branch:', error);
        process.exit(1);
    }

    // Update active label using core method
    const activeLabel = api.getActiveLabelName();
    const scope = getActiveLabelScope();

    // For project scope, we need to fetch the item to get projectId
    let projectId: string | undefined;
    if (scope === 'project') {
        const item = await api.findItemByNumber(repo, issueNumber);
        projectId = item?.projectId;
    }

    const result = await api.transferActiveLabel({
        repo,
        issueNumber,
        scope,
        projectId,
        labelName: activeLabel,
    });

    // Log what was removed
    for (const item of result.removed) {
        if (scope === 'project') {
            console.log(chalk.dim(`Removed ${activeLabel} from ${item.repo.fullName}#${item.number}`));
        } else {
            console.log(chalk.dim(`Removed ${activeLabel} from #${item.number}`));
        }
    }

    // Log if label was added
    if (result.added) {
        console.log(chalk.green('✓'), `Applied "${activeLabel}" label`);
    }
}
