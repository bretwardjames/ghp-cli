import chalk from 'chalk';
import { api } from '../github-api.js';
import { getAddIssueDefaults, resolveTargetRepo } from '../config.js';
import { spawn } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync, existsSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
    parseIssueMetadata,
    parseFieldsOption,
    mergeMetadata,
    generateMetadataTemplate,
    type IssueMetadata,
} from '@bretwardjames/ghp-core';

interface AddIssueOptions {
    body?: string;
    project?: string;
    status?: string;
    edit?: boolean;
    template?: string;
    listTemplates?: boolean;
    repo?: string;
    labels?: string;
    assignees?: string;
    type?: string;
    fields?: string;
}

async function openEditor(initialContent: string): Promise<string> {
    const editor = process.env.EDITOR || process.env.VISUAL || 'vim';
    const tmpFile = join(tmpdir(), `ghp-issue-${Date.now()}.md`);

    writeFileSync(tmpFile, initialContent);

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

function getTemplates(): Array<{ name: string; filename: string; content: string }> {
    const templateDir = join(process.cwd(), '.github', 'ISSUE_TEMPLATE');
    const templates: Array<{ name: string; filename: string; content: string }> = [];

    try {
        if (!existsSync(templateDir)) return templates;
        const files = readdirSync(templateDir);

        for (const file of files) {
            if (file === 'config.yml' || file === 'config.yaml') continue;
            if (!file.endsWith('.md') && !file.endsWith('.yml') && !file.endsWith('.yaml')) continue;

            const content = readFileSync(join(templateDir, file), 'utf-8');

            // Parse name from frontmatter
            const nameMatch = content.match(/^name:\s*["']?(.+?)["']?\s*$/m);
            const name = nameMatch ? nameMatch[1] : file.replace(/\.(md|ya?ml)$/, '');

            // Remove frontmatter for body
            const bodyContent = content.replace(/^---[\s\S]*?---\n?/, '');

            templates.push({ name, filename: file, content: bodyContent });
        }
    } catch {
        // No templates directory or error reading
    }

    return templates;
}

export async function addIssueCommand(title: string, options: AddIssueOptions): Promise<void> {
    // Handle --list-templates
    if (options.listTemplates) {
        const templates = getTemplates();
        if (templates.length === 0) {
            console.log(chalk.dim('No templates found in .github/ISSUE_TEMPLATE/'));
        } else {
            console.log(chalk.bold('Available templates:'));
            for (const t of templates) {
                const preview = t.content.trim().split('\n')[0].substring(0, 50);
                console.log(`  ${chalk.cyan(t.name)} ${chalk.dim(`(${t.filename})`)}`);
                if (preview) console.log(`    ${chalk.dim(preview)}...`);
            }
        }
        return;
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

    // Load defaults from config
    const defaults = getAddIssueDefaults();

    // Get projects
    let projects;
    try {
        projects = await api.getProjects(repo);
    } catch (error) {
        if (error instanceof Error && error.message.includes('Repository not found')) {
            console.error(chalk.red('Error:'), `Repository not found: ${repo.owner}/${repo.name}`);
            console.log(chalk.dim('Check that the repository exists and you have access to it.'));
            process.exit(1);
        }
        throw error;
    }
    if (projects.length === 0) {
        console.error(chalk.red('Error:'), 'No GitHub Projects found for this repository');
        process.exit(1);
    }

    // Select project (CLI > config default > first project)
    const projectName = options.project || defaults.project;
    let project = projects[0];
    if (projectName) {
        const found = projects.find(p =>
            p.title.toLowerCase().includes(projectName.toLowerCase())
        );
        if (!found) {
            console.error(chalk.red('Error:'), `Project "${projectName}" not found`);
            console.log('Available projects:', projects.map(p => p.title).join(', '));
            process.exit(1);
        }
        project = found;
    }

    // Handle template and editor
    let body = options.body || '';
    const templates = getTemplates();

    // Determine which template to use (CLI > config default)
    let templateName = options.template || defaults.template;

    // If no template specified and templates exist, prompt user to pick one
    if (!templateName && templates.length > 0 && !options.body) {
        console.log(chalk.bold('Select a template:'));
        templates.forEach((t, i) => console.log(`  ${i + 1}. ${t.name}`));
        console.log(`  ${templates.length + 1}. ${chalk.dim('Blank issue')}`);
        console.log();

        const readline = await import('readline');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const choice = await new Promise<string>(resolve => {
            rl.question('Template number: ', (answer: string) => {
                rl.close();
                resolve(answer.trim());
            });
        });

        const idx = parseInt(choice, 10) - 1;
        if (idx >= 0 && idx < templates.length) {
            templateName = templates[idx].name;
        }
        console.log();
    }

    let usingTemplate = false;
    if (templateName) {
        const template = templates.find(t =>
            t.filename.toLowerCase().includes(templateName!.toLowerCase()) ||
            t.name.toLowerCase().includes(templateName!.toLowerCase())
        );
        if (template) {
            body = template.content;
            usingTemplate = true;
        } else if (templates.length > 0) {
            console.error(chalk.red('Error:'), `Template "${templateName}" not found`);
            console.log('Available templates:', templates.map(t => t.name).join(', '));
            process.exit(1);
        } else {
            console.error(chalk.red('Error:'), `Template "${templateName}" not found`);
            console.log(chalk.dim('No templates in .github/ISSUE_TEMPLATE/'));
            process.exit(1);
        }
    }

    // Build initial metadata from CLI flags
    const flagMetadata: Partial<IssueMetadata> = {
        labels: options.labels ? options.labels.split(',').map(l => l.trim()) : [],
        assignees: options.assignees ? options.assignees.split(',').map(a => a.trim()) : [],
        type: options.type || null,
        fields: options.fields ? parseFieldsOption(options.fields) : {},
    };

    // If status was provided via CLI, add it to fields
    if (options.status) {
        flagMetadata.fields = { ...flagMetadata.fields, status: options.status };
    }

    // Open editor if: using template (always), -e flag, or no body provided
    let contentMetadata: IssueMetadata = { labels: [], assignees: [], type: null, fields: {} };

    if (usingTemplate || options.edit || !options.body) {
        // Generate metadata template with any CLI-provided values
        const metadataBlock = generateMetadataTemplate(flagMetadata);

        const instructions = [
            `# ${title || '<Replace with issue title>'}`,
            '',
            '<!-- ─────────────────────────────────────────────────────────',
            '     First line (after #) = Issue title',
            '     Metadata block (between ---) = labels, assignees, fields',
            '     Everything after metadata = Issue description',
            '     Delete any metadata lines you don\'t need',
            '     These comment lines will be removed',
            '─────────────────────────────────────────────────────────── -->',
            '',
            metadataBlock,
            '',
        ].join('\n');

        try {
            const edited = await openEditor(instructions + body);
            // Extract title from first line if it changed
            const lines = edited.split('\n');
            let contentAfterTitle: string;

            if (lines[0].startsWith('# ')) {
                title = lines[0].slice(2).trim();
                contentAfterTitle = lines.slice(1).join('\n');
            } else {
                contentAfterTitle = edited;
            }

            // Remove HTML comments
            contentAfterTitle = contentAfterTitle.replace(/<!--[\s\S]*?-->/g, '').trim();

            // Parse metadata from content
            const parsed = parseIssueMetadata(contentAfterTitle);
            contentMetadata = parsed.metadata;
            body = parsed.body;
        } catch (err) {
            console.error(chalk.red('Error:'), 'Editor failed:', err);
            process.exit(1);
        }
    }

    // Merge metadata: CLI flags override content metadata
    const finalMetadata = mergeMetadata(contentMetadata, flagMetadata);

    // Validate title
    if (!title || title === 'Issue Title' || title === '<Replace with issue title>') {
        console.error(chalk.red('Error:'), 'Issue title is required');
        process.exit(1);
    }

    // Get status from metadata fields or config default
    let statusName = finalMetadata.fields.status || defaults.status;
    const statusField = await api.getStatusField(project.id);

    // Interactive status picker if not specified
    if (!statusName && statusField && statusField.options.length > 0) {
        console.log(chalk.bold('Select initial status:'));
        statusField.options.forEach((opt, i) => console.log(`  ${i + 1}. ${opt.name}`));
        console.log();

        const readline = await import('readline');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const choice = await new Promise<string>(resolve => {
            rl.question('Status number: ', (answer: string) => {
                rl.close();
                resolve(answer.trim());
            });
        });

        const idx = parseInt(choice, 10) - 1;
        if (idx >= 0 && idx < statusField.options.length) {
            statusName = statusField.options[idx].name;
        }
        console.log();
    }

    console.log(chalk.dim(`Creating issue in ${project.title}...`));

    // Create the issue
    const issue = await api.createIssue(repo, title, body);
    if (!issue) {
        console.error(chalk.red('Error:'), 'Failed to create issue');
        process.exit(1);
    }

    console.log(chalk.green('Created:'), `#${issue.number} ${title}`);

    // Apply labels
    if (finalMetadata.labels.length > 0) {
        for (const label of finalMetadata.labels) {
            await api.ensureLabel(repo, label);
            const added = await api.addLabelToIssue(repo, issue.number, label);
            if (added) {
                console.log(chalk.green('Label:'), label);
            } else {
                console.log(chalk.yellow('Warning:'), `Failed to add label "${label}"`);
            }
        }
    }

    // Apply assignees
    if (finalMetadata.assignees.length > 0) {
        const success = await api.updateAssignees(repo, issue.number, finalMetadata.assignees);
        if (success) {
            console.log(chalk.green('Assignees:'), finalMetadata.assignees.join(', '));
        } else {
            console.log(chalk.yellow('Warning:'), 'Failed to set assignees');
        }
    }

    // Apply issue type
    if (finalMetadata.type) {
        const issueTypes = await api.getIssueTypes(repo);
        const issueType = issueTypes.find(t =>
            t.name.toLowerCase() === finalMetadata.type!.toLowerCase()
        );
        if (issueType) {
            const success = await api.setIssueType(repo, issue.number, issueType.id);
            if (success) {
                console.log(chalk.green('Type:'), finalMetadata.type);
            } else {
                console.log(chalk.yellow('Warning:'), `Failed to set type "${finalMetadata.type}"`);
            }
        } else {
            console.log(chalk.yellow('Warning:'), `Issue type "${finalMetadata.type}" not found`);
        }
    }

    // Add to project
    const itemId = await api.addToProject(project.id, issue.id);
    if (!itemId) {
        console.error(chalk.yellow('Warning:'), 'Issue created but failed to add to project');
        return;
    }

    console.log(chalk.green('Added to:'), project.title);

    // Set project fields (including status)
    const projectFields = await api.getProjectFields(project.id);

    for (const [fieldName, fieldValue] of Object.entries(finalMetadata.fields)) {
        // Find matching field (case-insensitive)
        const field = projectFields.find(f =>
            f.name.toLowerCase() === fieldName.toLowerCase()
        );

        if (!field) {
            if (fieldName.toLowerCase() !== 'status') {
                console.log(chalk.yellow('Warning:'), `Field "${fieldName}" not found in project`);
            }
            continue;
        }

        // Handle different field types
        if (field.type === 'SingleSelect' && field.options) {
            const option = field.options.find(o =>
                o.name.toLowerCase() === fieldValue.toLowerCase()
            );
            if (option) {
                await api.setFieldValue(project.id, itemId, field.id, { singleSelectOptionId: option.id });
                console.log(chalk.green(`${field.name}:`), fieldValue);
            } else {
                console.log(chalk.yellow('Warning:'), `Option "${fieldValue}" not found for field "${fieldName}"`);
            }
        } else if (field.type === '' || field.type === 'Text') {
            // Text field
            await api.setFieldValue(project.id, itemId, field.id, { text: fieldValue });
            console.log(chalk.green(`${field.name}:`), fieldValue);
        } else if (field.type === 'Number') {
            // Number field
            const numValue = parseFloat(fieldValue);
            if (!isNaN(numValue)) {
                await api.setFieldValue(project.id, itemId, field.id, { number: numValue });
                console.log(chalk.green(`${field.name}:`), fieldValue);
            } else {
                console.log(chalk.yellow('Warning:'), `Invalid number value "${fieldValue}" for field "${fieldName}"`);
            }
        } else {
            console.log(chalk.yellow('Warning:'), `Unsupported field type "${field.type}" for field "${fieldName}"`);
        }
    }

    console.log();
    console.log(chalk.dim(`Start working: ${chalk.cyan(`ghp start ${issue.number}`)}`));
}
