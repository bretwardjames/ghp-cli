import chalk from 'chalk';
import { api } from '../github-api.js';
import { detectRepository } from '../git-utils.js';
import { getShortcut, getPlanDefaults, listShortcuts } from '../config.js';
import type { ProjectItem } from '../types.js';

interface PlanOptions {
    project?: string;
    status?: string;
    mine?: boolean;
    unassigned?: boolean;
    list?: boolean;
    sort?: string;
    slice?: string[];
}

export async function planCommand(shortcut?: string, command?: any): Promise<void> {
    // Commander passes (shortcut, options) for optional positional args
    // The options object is passed directly, not as command.opts()
    const cliOpts: PlanOptions = command?.opts?.() || command || {};

    let options: PlanOptions;
    let shortcutName: string | undefined = shortcut;

    // Load defaults first
    const defaults = getPlanDefaults();

    // If shortcut specified, load and merge it
    if (shortcutName) {
        const shortcut = getShortcut(shortcutName);
        if (!shortcut) {
            console.error(chalk.red('Unknown shortcut:'), shortcutName);
            console.log();
            const shortcuts = listShortcuts();
            if (Object.keys(shortcuts).length > 0) {
                console.log(chalk.dim('Available shortcuts:'));
                for (const [name, sc] of Object.entries(shortcuts)) {
                    const parts: string[] = [];
                    if (sc.project) parts.push(`--project ${sc.project}`);
                    if (sc.status) parts.push(`--status ${sc.status}`);
                    if (sc.mine) parts.push('--mine');
                    if (sc.unassigned) parts.push('--unassigned');
                    if (sc.slice) parts.push(...sc.slice.map(s => `--slice ${s}`));
                    if (sc.sort) parts.push(`--sort ${sc.sort}`);
                    console.log(`  ${chalk.cyan(name)}: ${parts.join(' ')}`);
                }
            } else {
                console.log(chalk.dim('No shortcuts configured. Add them to ~/.config/ghp-cli/config.json'));
            }
            process.exit(1);
        }
        // Merge: defaults < shortcut < CLI options
        options = {
            ...defaults,
            ...shortcut,
            ...cliOpts,
            // Merge slice arrays
            slice: [...(defaults.slice || []), ...(shortcut.slice || []), ...(cliOpts.slice || [])],
        };
    } else {
        // Merge: defaults < CLI options
        options = {
            ...defaults,
            ...cliOpts,
            slice: [...(defaults.slice || []), ...(cliOpts.slice || [])],
        };
    }

    // Remove duplicate slices
    if (options.slice) {
        options.slice = [...new Set(options.slice)];
    }
    const repo = await detectRepository();
    if (!repo) {
        console.error(chalk.red('Error:'), 'Not in a git repository with a GitHub remote');
        process.exit(1);
    }

    const authenticated = await api.authenticate();
    if (!authenticated) {
        console.error(chalk.red('Error:'), 'Not authenticated. Run', chalk.cyan('ghp auth'));
        process.exit(1);
    }

    const projects = await api.getProjects(repo);
    if (projects.length === 0) {
        console.log(chalk.yellow('No GitHub Projects found for this repository.'));
        return;
    }

    // Filter by project if specified
    const targetProjects = options.project
        ? projects.filter(p => p.title.toLowerCase().includes(options.project!.toLowerCase()))
        : projects;

    if (targetProjects.length === 0) {
        console.log(chalk.yellow(`No project matching "${options.project}" found.`));
        return;
    }

    // Collect all items from target projects
    let allItems: ProjectItem[] = [];
    for (const project of targetProjects) {
        const items = await api.getProjectItems(project.id, project.title);
        allItems = allItems.concat(items);
    }

    // Apply filters
    let filteredItems = allItems;

    // --mine: filter to current user
    if (options.mine) {
        filteredItems = filteredItems.filter(item =>
            item.assignees.includes(api.username || '')
        );
    }

    // --unassigned: filter to items with no assignees
    if (options.unassigned) {
        filteredItems = filteredItems.filter(item =>
            item.assignees.length === 0
        );
    }

    // --status: filter by status
    if (options.status) {
        filteredItems = filteredItems.filter(item =>
            item.status?.toLowerCase() === options.status!.toLowerCase()
        );
    }

    // --slice: filter by field=value pairs
    if (options.slice && options.slice.length > 0) {
        for (const slice of options.slice) {
            const [field, value] = slice.split('=');
            if (!field || !value) {
                console.error(chalk.red('Invalid slice format:'), slice);
                console.log(chalk.dim('Use: --slice field=value'));
                continue;
            }

            const fieldLower = field.toLowerCase();
            const valueLower = value.toLowerCase();

            filteredItems = filteredItems.filter(item => {
                // Check built-in fields
                if (fieldLower === 'assignee' || fieldLower === 'user') {
                    return item.assignees.some(a => a.toLowerCase().includes(valueLower));
                }
                if (fieldLower === 'label') {
                    return item.labels.some(l => l.name.toLowerCase().includes(valueLower));
                }
                if (fieldLower === 'type' || fieldLower === 'issuetype' || fieldLower === 'issue-type') {
                    return item.issueType?.toLowerCase().includes(valueLower) || false;
                }
                if (fieldLower === 'repo' || fieldLower === 'repository') {
                    return item.repository?.toLowerCase().includes(valueLower);
                }
                if (fieldLower === 'project') {
                    return item.projectTitle.toLowerCase().includes(valueLower);
                }

                // Check custom project fields
                const fieldValue = item.fields[field] || item.fields[fieldLower];
                if (fieldValue) {
                    return fieldValue.toLowerCase().includes(valueLower);
                }

                // Check with case-insensitive field name match
                const matchingField = Object.entries(item.fields).find(
                    ([k]) => k.toLowerCase() === fieldLower
                );
                if (matchingField) {
                    return matchingField[1].toLowerCase().includes(valueLower);
                }

                return false;
            });
        }
    }

    // Sort items if requested
    if (options.sort) {
        const sortFields = options.sort.split(',').map(f => f.trim());
        filteredItems.sort((a, b) => {
            for (const field of sortFields) {
                const ascending = field.startsWith('-');
                const fieldName = ascending ? field.slice(1) : field;

                // Get field values (handle special fields and custom fields)
                let aVal: any = getFieldValue(a, fieldName);
                let bVal: any = getFieldValue(b, fieldName);

                // Compare
                if (aVal === bVal) continue;
                if (aVal === null || aVal === undefined) return ascending ? -1 : 1;
                if (bVal === null || bVal === undefined) return ascending ? 1 : -1;

                // String comparison
                if (typeof aVal === 'string' && typeof bVal === 'string') {
                    const cmp = aVal.localeCompare(bVal);
                    return ascending ? cmp : -cmp;
                }

                // Number comparison
                if (aVal < bVal) return ascending ? -1 : 1;
                if (aVal > bVal) return ascending ? 1 : -1;
            }
            return 0;
        });
    }

    // Display based on mode
    if (options.list) {
        // Simple list view (one item per line, for pickers)
        displaySimpleList(filteredItems);
    } else if (options.status) {
        // List view for single status
        displayListView(filteredItems, options.status, options);
    } else {
        // Board view
        displayBoardView(filteredItems, targetProjects, options);
    }
}

function getFieldValue(item: ProjectItem, fieldName: string): any {
    const lower = fieldName.toLowerCase();

    // Built-in fields
    switch (lower) {
        case 'number':
            return item.number;
        case 'title':
            return item.title;
        case 'status':
            return item.status;
        case 'type':
            return item.type;
        case 'issuetype':
        case 'issue-type':
        case 'issue_type':
            return item.issueType;
        case 'assignee':
        case 'assignees':
        case 'user':
            // Return first assignee for sorting, or empty string if none
            return item.assignees[0] || '';
        case 'repo':
        case 'repository':
            return item.repository;
        case 'label':
        case 'labels':
            // Return first label name for sorting
            return item.labels[0]?.name || '';
        case 'project':
            return item.projectTitle;
        default:
            // Check custom fields (exact match first, then case-insensitive)
            if (item.fields[fieldName]) {
                return item.fields[fieldName];
            }
            const customField = Object.entries(item.fields || {}).find(
                ([k]) => k.toLowerCase() === lower
            );
            return customField ? customField[1] : null;
    }
}

function displaySimpleList(items: ProjectItem[]): void {
    for (const item of items) {
        const num = item.number ? `#${item.number}` : '';
        const status = item.status ? `[${item.status}]` : '';
        console.log(`${num} ${item.title} ${status}`);
    }
}

function displayListView(items: ProjectItem[], status: string, opts: PlanOptions): void {
    const label = opts.mine ? `My ${status}` : opts.unassigned ? `Unassigned ${status}` : status;
    console.log(chalk.bold(label), chalk.dim(`(${items.length} items)`));
    console.log();

    if (items.length === 0) {
        console.log(chalk.dim('No items found.'));
        return;
    }

    // Build rows with raw data for width calculation
    const rows: Array<{
        num: string;
        type: string;
        title: string;
        assignees: string;
        priority: string;
        size: string;
        labels: Array<{ name: string; color: string }>;
    }> = items.map(item => ({
        num: item.number ? `#${item.number}` : 'draft',
        type: item.issueType || '',
        title: item.title,
        assignees: item.assignees.map(a => '@' + a).join(' '),
        priority: item.fields['Priority'] || item.fields['priority'] || '',
        size: item.fields['Size'] || item.fields['size'] || item.fields['Estimate'] || item.fields['estimate'] || '',
        labels: item.labels,
    }));

    // Calculate column widths
    const numWidth = Math.max(...rows.map(r => r.num.length), 5);
    const typeWidth = Math.max(...rows.map(r => r.type.length), 0);
    const assigneeWidth = Math.max(...rows.map(r => r.assignees.length), 0);
    const priorityWidth = Math.max(...rows.map(r => r.priority.length), 0);
    const sizeWidth = Math.max(...rows.map(r => r.size.length), 0);

    // Calculate title width (remaining space, min 20, max 60)
    const termWidth = process.stdout.columns || 120;
    const fixedWidth = numWidth + typeWidth + assigneeWidth + priorityWidth + sizeWidth + 12; // spacing
    const titleWidth = Math.max(20, Math.min(60, termWidth - fixedWidth - 4));

    // Print header row
    const headerParts: string[] = [];
    headerParts.push(chalk.dim('#'.padEnd(numWidth)));
    if (typeWidth > 0) {
        headerParts.push(chalk.dim('Type'.padEnd(typeWidth)));
    }
    headerParts.push(chalk.dim('Title'.padEnd(titleWidth)));
    if (assigneeWidth > 0) {
        headerParts.push(chalk.dim('Assignee'.padEnd(assigneeWidth)));
    }
    if (priorityWidth > 0) {
        headerParts.push(chalk.dim('Priority'.padEnd(priorityWidth)));
    }
    if (sizeWidth > 0) {
        headerParts.push(chalk.dim('Size'.padEnd(sizeWidth)));
    }
    const hasLabels = rows.some(r => r.labels.length > 0);
    if (hasLabels) {
        headerParts.push(chalk.dim('Labels'));
    }
    console.log(`  ${headerParts.join('  ')}`);
    console.log(chalk.dim('  ' + '─'.repeat(Math.min(termWidth - 4, fixedWidth + titleWidth + 10))));

    // Print rows
    for (const row of rows) {
        const parts: string[] = [];

        // Number
        parts.push(row.num === 'draft'
            ? chalk.dim(row.num.padEnd(numWidth))
            : chalk.cyan(row.num.padEnd(numWidth)));

        // Issue Type
        if (typeWidth > 0) {
            parts.push(chalk.yellow(row.type.padEnd(typeWidth)));
        }

        // Title (truncated if needed)
        const truncTitle = row.title.length > titleWidth
            ? row.title.substring(0, titleWidth - 1) + '…'
            : row.title.padEnd(titleWidth);
        parts.push(truncTitle);

        // Assignees
        if (assigneeWidth > 0) {
            parts.push(chalk.cyan(row.assignees.padEnd(assigneeWidth)));
        }

        // Priority
        if (priorityWidth > 0) {
            parts.push(chalk.magenta(row.priority.padEnd(priorityWidth)));
        }

        // Size
        if (sizeWidth > 0) {
            parts.push(chalk.blue(row.size.padEnd(sizeWidth)));
        }

        // Labels (not padded, at the end)
        if (row.labels.length > 0) {
            const labelStr = row.labels.map(l => {
                const bg = hexToChalk(l.color);
                return bg(` ${l.name} `);
            }).join(' ');
            parts.push(labelStr);
        }

        console.log(`  ${parts.join('  ')}`);
    }
    console.log();
}

function hexToChalk(hex: string): (text: string) => string {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const textColor = luminance > 0.5 ? chalk.black : chalk.white;
    return (text: string) => textColor.bgRgb(r, g, b)(text);
}

async function displayBoardView(
    items: ProjectItem[],
    projects: Array<{ id: string; title: string; url: string }>,
    opts: PlanOptions
): Promise<void> {
    for (const project of projects) {
        const projectItems = items.filter(i => i.projectId === project.id);

        console.log(chalk.bold.underline(project.title));
        if (opts.mine) {
            console.log(chalk.dim('Filtered to: my items'));
        }
        console.log();

        const statusField = await api.getStatusField(project.id);
        if (!statusField) {
            console.log(chalk.yellow('No Status field found in this project.'));
            continue;
        }

        // Group items by status
        const byStatus = new Map<string, ProjectItem[]>();
        for (const status of statusField.options) {
            byStatus.set(status.name, []);
        }
        byStatus.set('No Status', []);

        for (const item of projectItems) {
            const status = item.status || 'No Status';
            if (!byStatus.has(status)) {
                byStatus.set(status, []);
            }
            byStatus.get(status)!.push(item);
        }

        // Calculate column widths
        const termWidth = process.stdout.columns || 120;
        const numColumns = statusField.options.length;
        const colWidth = Math.floor((termWidth - 4) / Math.min(numColumns, 4)) - 2;

        const statuses = statusField.options.map((o: { id: string; name: string }) => o.name);

        // Print headers with counts
        const headers = statuses.map(s => {
            const statusItems = byStatus.get(s) || [];
            const header = `${s} (${statusItems.length})`;
            return chalk.bold(header.padEnd(colWidth).substring(0, colWidth));
        });
        console.log(headers.join('  '));
        console.log(chalk.dim('─'.repeat(termWidth - 4)));

        // Find max items in any column
        const maxItems = Math.max(...statuses.map(s => (byStatus.get(s) || []).length), 1);

        // Print rows
        for (let i = 0; i < Math.min(maxItems, 15); i++) {
            const row = statuses.map(s => {
                const statusItems = byStatus.get(s) || [];
                if (i < statusItems.length) {
                    const item = statusItems[i];
                    const num = item.number ? `#${item.number}` : '';
                    const text = `${num} ${item.title}`.substring(0, colWidth - 1);
                    const color = item.assignees.includes(api.username || '')
                        ? chalk.cyan
                        : chalk.white;
                    return color(text.padEnd(colWidth));
                }
                return ' '.repeat(colWidth);
            });
            console.log(row.join('  '));
        }

        if (maxItems > 15) {
            console.log(chalk.dim(`... and ${maxItems - 15} more items`));
        }

        console.log();
    }
}
