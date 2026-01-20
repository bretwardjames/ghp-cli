import chalk from 'chalk';
import { api } from '../github-api.js';
import { resolveTargetRepo } from '../config.js';
import { spawn } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

interface CommentOptions {
    message?: string;
    repo?: string;
}

export async function commentCommand(issue: string, options: CommentOptions): Promise<void> {
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

    const issueNumber = parseInt(issue.replace(/^#/, ''), 10);
    if (isNaN(issueNumber)) {
        console.error(chalk.red('Invalid issue number:'), issue);
        process.exit(1);
    }

    // Get issue details to show context
    let details;
    try {
        details = await api.getIssueDetails(repo, issueNumber);
    } catch (error) {
        if (error instanceof Error && error.message.includes('Repository not found')) {
            console.error(chalk.red('Error:'), `Repository not found: ${repo.owner}/${repo.name}`);
            console.log(chalk.dim('Check that the repository exists and you have access to it.'));
            process.exit(1);
        }
        throw error;
    }
    if (!details) {
        console.error(chalk.red('Issue not found:'), `#${issueNumber}`);
        process.exit(1);
    }

    let commentBody: string;

    if (options.message) {
        // Inline comment
        commentBody = options.message;
    } else {
        // Open editor
        console.log(chalk.dim(`Commenting on #${issueNumber}: ${details.title}`));
        commentBody = await openEditor(issueNumber);
    }

    // Trim and validate
    commentBody = commentBody.trim();
    if (!commentBody) {
        console.log(chalk.yellow('Aborted:'), 'Empty comment');
        return;
    }

    // Post the comment
    console.log(chalk.dim('Posting comment...'));
    const success = await api.addComment(repo, issueNumber, commentBody);

    if (success) {
        console.log(chalk.green('Comment added to'), `#${issueNumber}`);
    } else {
        console.error(chalk.red('Failed to add comment'));
        process.exit(1);
    }
}

async function openEditor(issueNumber: number): Promise<string> {
    const editor = process.env.EDITOR || process.env.VISUAL || 'vim';
    const tmpFile = join(tmpdir(), `ghp-comment-${issueNumber}-${Date.now()}.md`);

    writeFileSync(tmpFile, '');

    return new Promise((resolve, reject) => {
        const child = spawn(editor, [tmpFile], {
            stdio: 'inherit',
        });

        child.on('exit', (code) => {
            if (code !== 0) {
                if (existsSync(tmpFile)) unlinkSync(tmpFile);
                reject(new Error(`Editor exited with code ${code}`));
                return;
            }

            try {
                const content = readFileSync(tmpFile, 'utf-8');
                unlinkSync(tmpFile);
                resolve(content);
            } catch (err) {
                reject(err);
            }
        });
    });
}
