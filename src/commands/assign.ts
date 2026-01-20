import chalk from 'chalk';
import { exec } from 'child_process';
import { promisify } from 'util';
import { api } from '../github-api.js';
import { resolveTargetRepo } from '../config.js';

const execAsync = promisify(exec);

interface AssignOptions {
    remove?: boolean;
    repo?: string;
}

export async function assignCommand(
    issue: string,
    users: string[],
    options: AssignOptions
): Promise<void> {
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

    // Authenticate
    const authenticated = await api.authenticate();
    if (!authenticated) {
        console.error(chalk.red('Error:'), 'Not authenticated. Run', chalk.cyan('ghp auth'));
        process.exit(1);
    }

    // Default to self if no users specified
    const assignees = users.length > 0 ? users : [api.username!];
    const assigneeList = assignees.join(',');

    try {
        if (options.remove) {
            await execAsync(`gh issue edit ${issueNumber} --repo ${repo.fullName} --remove-assignee "${assigneeList}"`);
            console.log(chalk.green('✓'), `Removed ${assigneeList} from #${issueNumber}`);
        } else {
            await execAsync(`gh issue edit ${issueNumber} --repo ${repo.fullName} --add-assignee "${assigneeList}"`);
            console.log(chalk.green('✓'), `Assigned ${assigneeList} to #${issueNumber}`);
        }
    } catch (error: unknown) {
        const err = error as { stderr?: string };
        console.error(chalk.red('Error:'), err.stderr || 'Failed to update assignees');
        process.exit(1);
    }
}
