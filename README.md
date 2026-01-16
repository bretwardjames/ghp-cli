# ghp-cli

GitHub Projects CLI - manage project boards from your terminal.

## Installation

```bash
npm install -g ghp-cli
```

## Quick Start

```bash
# Authenticate with GitHub
ghp auth

# View your assigned items
ghp work

# View project board
ghp plan

# Create an issue
ghp add "Fix login bug"
```

## Commands

### Views

```bash
# Your work (sidebar view)
ghp work
ghp work --status "In Progress"
ghp work --hide-done

# Project board
ghp plan
ghp plan --mine                    # Only my items
ghp plan --status Backlog          # List view for single status
ghp plan --slice type=Bug          # Filter by field
ghp plan bugs                      # Use configured shortcut
```

### Issue Management

```bash
# Create issue (opens editor with template)
ghp add "Issue title"
ghp add -t bug_report              # Use specific template
ghp add --list-templates           # List available templates

# View issue details
ghp open 123
ghp open 123 --browser             # Open in browser

# Add comment
ghp comment 123 -m "Fixed in latest commit"
ghp comment 123                    # Opens editor
```

### Workflow

```bash
# Start working on an issue (creates branch, updates status)
ghp start 123

# Mark as done
ghp done 123

# Move to different status
ghp move 123 "In Review"

# Assign users
ghp assign 123 @username
ghp assign 123                     # Assign to self
```

### Branch Management

```bash
# Switch to issue's branch
ghp switch 123

# Link current branch to issue
ghp link-branch 123

# Unlink branch
ghp unlink-branch 123
```

### Configuration

```bash
# View config
ghp config --list

# Edit config file
ghp config --edit

# Set individual values
ghp config mainBranch main
```

## Configuration

Config file: `~/.config/ghp-cli/config.json`

```json
{
  "mainBranch": "main",
  "branchPattern": "{user}/{number}-{title}",
  "startWorkingStatus": "In Progress",
  "doneStatus": "Done",

  "defaults": {
    "plan": {
      "mine": true
    },
    "addIssue": {
      "template": "bug_report",
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
    }
  }
}
```

### Shortcuts

Define shortcuts for common `ghp plan` filters:

```bash
ghp plan bugs      # Expands to: ghp plan --status Backlog --slice type=Bug
ghp plan mywork    # Expands to: ghp plan --status "In Progress" --mine
```

### Slice Filters

Filter by any field:

```bash
--slice type=Bug           # Issue type (org-level)
--slice label=frontend     # Labels
--slice assignee=username  # Assignee
--slice Priority=High      # Custom project fields
--slice Size=Small         # Custom project fields
```

## Issue Templates

Place templates in `.github/ISSUE_TEMPLATE/` in your repo. When creating issues, you can:

- Select a template interactively (if no default set)
- Use `-t <name>` to specify a template
- Set `defaults.addIssue.template` in config for auto-selection

## Requirements

- Node.js >= 18
- GitHub account with Projects access
- `gh` CLI recommended (for auth token)

## License

MIT
