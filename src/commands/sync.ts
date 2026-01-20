import chalk from 'chalk';
import { api } from '../github-api.js';
import { detectRepository, getCurrentBranch } from '../git-utils.js';
import { getIssueForBranch } from '../branch-linker.js';
import { getActiveLabelScope } from '../config.js';

export async function syncCommand(): Promise<void> {
    // Detect repository
    const repo = await detectRepository();
    if (!repo) {
        console.error(chalk.red('Error:'), 'Not in a git repository with a GitHub remote');
        process.exit(1);
    }

    // Authenticate
    const authenticated = await api.authenticate();
    if (!authenticated) {
        console.error(chalk.red('Error:'), 'Not authenticated. Run', chalk.cyan('ghp auth'));
        process.exit(1);
    }

    const activeLabel = api.getActiveLabelName();
    const currentBranch = await getCurrentBranch();
    const scope = getActiveLabelScope();

    console.log(chalk.bold('Syncing active label:'), activeLabel);
    console.log(chalk.dim(`Current branch: ${currentBranch}`));
    console.log(chalk.dim(`Scope: ${scope}`));
    console.log();

    // Find issue linked to current branch (via branch name pattern + issue body verification)
    const linkedIssue = await getIssueForBranch(repo, currentBranch || '');

    // Ensure label exists first
    await api.ensureLabel(repo, activeLabel);

    if (scope === 'project' && linkedIssue) {
        // Project scope: sync across all repos in the project
        const item = await api.findItemByNumber(repo, linkedIssue.issueNumber);
        if (!item) {
            console.log(chalk.yellow('Warning:'), `Issue #${linkedIssue.issueNumber} not found in any project`);
            return;
        }

        const itemsWithLabel = await api.findProjectItemsWithLabel(item.projectId, activeLabel);

        // Determine what needs to change
        const toRemove = itemsWithLabel.filter(
            i => !(i.number === linkedIssue.issueNumber && i.repo.fullName === repo.fullName)
        );
        const hasLabel = itemsWithLabel.some(
            i => i.number === linkedIssue.issueNumber && i.repo.fullName === repo.fullName
        );

        if (toRemove.length === 0 && hasLabel) {
            console.log(chalk.green('✓'), `Active label is correctly on #${linkedIssue.issueNumber}`);
            return;
        }

        console.log(chalk.bold('Changes needed:'));
        for (const i of toRemove) {
            console.log(chalk.red('  - Remove'), activeLabel, chalk.dim(`from ${i.repo.fullName}#${i.number}`));
        }
        if (!hasLabel) {
            console.log(chalk.green('  + Add'), activeLabel, chalk.dim(`to #${linkedIssue.issueNumber} (${linkedIssue.issueTitle})`));
        }
        console.log();

        for (const i of toRemove) {
            await api.ensureLabel(i.repo, activeLabel);
            const removed = await api.removeLabelFromIssue(i.repo, i.number, activeLabel);
            if (removed) {
                console.log(chalk.green('✓'), `Removed from ${i.repo.fullName}#${i.number}`);
            } else {
                console.log(chalk.yellow('⚠'), `Could not remove from ${i.repo.fullName}#${i.number}`);
            }
        }

        if (!hasLabel) {
            const added = await api.addLabelToIssue(repo, linkedIssue.issueNumber, activeLabel);
            if (added) {
                console.log(chalk.green('✓'), `Added to #${linkedIssue.issueNumber}`);
            } else {
                console.log(chalk.yellow('⚠'), `Could not add to #${linkedIssue.issueNumber}`);
            }
        }
    } else {
        // Repo scope: only sync within current repo
        const issuesWithLabel = await api.findIssuesWithLabel(repo, activeLabel);

        // Determine what needs to change
        const toRemove = linkedIssue
            ? issuesWithLabel.filter(n => n !== linkedIssue.issueNumber)
            : issuesWithLabel;
        const needsAdd = linkedIssue && !issuesWithLabel.includes(linkedIssue.issueNumber);

        // Show what will happen
        if (toRemove.length === 0 && !needsAdd) {
            if (linkedIssue) {
                console.log(chalk.green('✓'), `Active label is correctly on #${linkedIssue.issueNumber}`);
            } else {
                console.log(chalk.yellow('No issue linked to current branch.'));
                if (issuesWithLabel.length === 0) {
                    console.log(chalk.dim('No issues have the active label.'));
                }
            }
            return;
        }

        console.log(chalk.bold('Changes needed:'));

        for (const issueNum of toRemove) {
            console.log(chalk.red('  - Remove'), activeLabel, chalk.dim(`from #${issueNum}`));
        }

        if (needsAdd && linkedIssue) {
            console.log(chalk.green('  + Add'), activeLabel, chalk.dim(`to #${linkedIssue.issueNumber} (${linkedIssue.issueTitle})`));
        }

        console.log();

        for (const issueNum of toRemove) {
            const removed = await api.removeLabelFromIssue(repo, issueNum, activeLabel);
            if (removed) {
                console.log(chalk.green('✓'), `Removed from #${issueNum}`);
            } else {
                console.log(chalk.yellow('⚠'), `Could not remove from #${issueNum}`);
            }
        }

        if (needsAdd && linkedIssue) {
            const added = await api.addLabelToIssue(repo, linkedIssue.issueNumber, activeLabel);
            if (added) {
                console.log(chalk.green('✓'), `Added to #${linkedIssue.issueNumber}`);
            } else {
                console.log(chalk.yellow('⚠'), `Could not add to #${linkedIssue.issueNumber}`);
            }
        }
    }

    console.log();
    console.log(chalk.green('Done!'));
}
