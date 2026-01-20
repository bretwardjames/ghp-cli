import chalk from 'chalk';
import { api } from '../github-api.js';
import { resolveTargetRepo } from '../config.js';

interface SetFieldOptions {
    repo?: string;
}

export async function setFieldCommand(issue: string, field: string, value: string, options: SetFieldOptions): Promise<void> {
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

    const authenticated = await api.authenticate();
    if (!authenticated) {
        console.error(chalk.red('Error:'), 'Not authenticated. Run', chalk.cyan('ghp auth'));
        process.exit(1);
    }

    // Handle issue type separately (it's an issue property, not a project field)
    const fieldLower = field.toLowerCase();
    if (fieldLower === 'type' || fieldLower === 'issuetype' || fieldLower === 'issue-type') {
        const issueTypes = await api.getIssueTypes(repo);

        if (issueTypes.length === 0) {
            console.error(chalk.red('Error:'), 'Issue types are not enabled for this repository');
            process.exit(1);
        }

        const targetType = issueTypes.find(t =>
            t.name.toLowerCase() === value.toLowerCase()
        );

        if (!targetType) {
            console.error(chalk.red('Error:'), `Invalid issue type "${value}"`);
            console.log('Available types:', issueTypes.map(t => t.name).join(', '));
            process.exit(1);
        }

        const success = await api.setIssueType(repo, issueNumber, targetType.id);
        if (success) {
            console.log(chalk.green('Updated:'), `#${issueNumber} Type = ${targetType.name}`);
        } else {
            console.error(chalk.red('Error:'), 'Failed to update issue type');
            process.exit(1);
        }
        return;
    }

    // Find the item in a project (needed for project field updates)
    let item;
    try {
        item = await api.findItemByNumber(repo, issueNumber);
    } catch (error) {
        if (error instanceof Error && error.message.includes('Repository not found')) {
            console.error(chalk.red('Error:'), `Repository not found: ${repo.owner}/${repo.name}`);
            console.log(chalk.dim('Check that the repository exists and you have access to it.'));
            process.exit(1);
        }
        throw error;
    }
    if (!item) {
        console.error(chalk.red('Error:'), `Issue #${issueNumber} not found in any project`);
        process.exit(1);
    }

    // Get project fields
    const fields = await api.getProjectFields(item.projectId);
    const targetField = fields.find(f =>
        f.name.toLowerCase() === field.toLowerCase()
    );

    if (!targetField) {
        console.error(chalk.red('Error:'), `Field "${field}" not found`);
        console.log('Available fields:', fields.map(f => f.name).join(', '));
        process.exit(1);
    }

    // Build the value object based on field type
    let fieldValue: { text?: string; number?: number; singleSelectOptionId?: string };

    if (targetField.type === 'SingleSelect' && targetField.options) {
        const option = targetField.options.find(o =>
            o.name.toLowerCase() === value.toLowerCase()
        );
        if (!option) {
            console.error(chalk.red('Error:'), `Invalid value "${value}" for field "${field}"`);
            console.log('Available options:', targetField.options.map(o => o.name).join(', '));
            process.exit(1);
        }
        fieldValue = { singleSelectOptionId: option.id };
    } else if (targetField.type === '' || targetField.type === 'Text') {
        fieldValue = { text: value };
    } else if (targetField.type === 'Number') {
        const num = parseFloat(value);
        if (isNaN(num)) {
            console.error(chalk.red('Error:'), 'Value must be a number for this field');
            process.exit(1);
        }
        fieldValue = { number: num };
    } else {
        console.error(chalk.red('Error:'), `Unsupported field type: ${targetField.type}`);
        process.exit(1);
    }

    const success = await api.setFieldValue(item.projectId, item.id, targetField.id, fieldValue);

    if (success) {
        console.log(chalk.green('Updated:'), `#${issueNumber} ${targetField.name} = ${value}`);
    } else {
        console.error(chalk.red('Error:'), 'Failed to update field');
        process.exit(1);
    }
}
