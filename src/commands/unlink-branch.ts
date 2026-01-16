import chalk from 'chalk';
import { detectRepository } from '../git-utils.js';
import { unlinkBranch, getBranchForIssue } from '../branch-linker.js';

export async function unlinkBranchCommand(issue: string): Promise<void> {
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

    // Check if linked
    const branchName = getBranchForIssue(repo.fullName, issueNumber);
    if (!branchName) {
        console.log(chalk.yellow('No branch linked to issue'), `#${issueNumber}`);
        return;
    }

    // Unlink
    const removed = unlinkBranch(repo.fullName, issueNumber);
    if (removed) {
        console.log(chalk.green('✓'), `Unlinked "${branchName}" from #${issueNumber}`);
    }
}
