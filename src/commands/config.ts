import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { spawn } from 'child_process';
import { dirname } from 'path';
import { getConfig, setConfig, listConfig, CONFIG_KEYS, getConfigPath, type Config } from '../config.js';

type ConfigKey = typeof CONFIG_KEYS[number];

function isValidKey(key: string): key is ConfigKey {
    return (CONFIG_KEYS as readonly string[]).includes(key);
}

const CONFIG_TEMPLATE = `{
  "_comment": "ghp-cli configuration - see https://github.com/your/ghp-cli for docs",

  "mainBranch": "main",
  "branchPattern": "{user}/{number}-{title}",
  "startWorkingStatus": "In Progress",
  "doneStatus": "Done",

  "defaults": {
    "plan": {},
    "addIssue": {
      "template": "",
      "project": "",
      "status": "Backlog"
    }
  },

  "shortcuts": {
    "bugs": {
      "status": "Backlog",
      "slice": ["type=Bug"]
    },
    "mywork": {
      "status": "In Progress",
      "mine": true
    },
    "todo": {
      "status": "Todo",
      "unassigned": true
    }
  }
}
`;

function openInEditor(filePath: string): void {
    const editor = process.env.EDITOR || process.env.VISUAL || 'vi';
    const child = spawn(editor, [filePath], {
        stdio: 'inherit',
        shell: true,
    });
    child.on('error', (err) => {
        console.error(`Failed to open editor: ${err.message}`);
        console.log(`Config file is at: ${filePath}`);
    });
}

export async function configCommand(
    key?: string,
    value?: string,
    options: { list?: boolean; edit?: boolean } = {}
): Promise<void> {
    if (options.edit) {
        const configPath = getConfigPath();

        // Create config with template if it doesn't exist
        if (!existsSync(configPath)) {
            mkdirSync(dirname(configPath), { recursive: true });
            writeFileSync(configPath, CONFIG_TEMPLATE);
            console.log(`Created config file: ${configPath}`);
        }

        openInEditor(configPath);
        return;
    }

    if (options.list || (!key && !value)) {
        const config = listConfig();
        console.log('\nConfiguration:');
        console.log('─'.repeat(40));
        for (const [k, v] of Object.entries(config)) {
            console.log(`  ${k}: ${v || '(not set)'}`);
        }
        console.log('\nAvailable keys:', CONFIG_KEYS.join(', '));
        return;
    }

    if (key && !isValidKey(key)) {
        console.log(`Unknown config key: "${key}"`);
        console.log('Available keys:', CONFIG_KEYS.join(', '));
        return;
    }

    if (key && !value) {
        const val = getConfig(key as keyof Config);
        if (val !== undefined) {
            console.log(val);
        } else {
            console.log(`Config key "${key}" is not set`);
        }
        return;
    }

    if (key && value) {
        setConfig(key as keyof Config, value as Config[keyof Config]);
        console.log(`Set ${key} = ${value}`);
    }
}
