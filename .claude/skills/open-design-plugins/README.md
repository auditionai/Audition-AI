# Open Design Official Plugins

This directory contains 231 official plugins from the [Open Design project](https://github.com/nexu-io/open-design).

## Plugin Categories

### Atoms (13 plugins)
Core workflow components for building design systems and migrating code:
- **build-test** - Test and validate build outputs
- **code-import** - Import source code for analysis
- **critique-theater** - Review and critique designs
- **design-extract** - Extract design tokens (colors, typography, spacing) from code
- **diff-review** - Review design changes
- **direction-picker** - Choose design direction
- **discovery-question-form** - Gather design requirements
- **figma-extract** - Extract design from Figma files
- **handoff** - Handoff designs to developers
- **patch-edit** - Edit and patch designs
- **rewrite-plan** - Plan design rewrites
- **todo-write** - Write design todos
- **token-map** - Map design tokens

### Design Systems
Pre-configured design systems from popular frameworks:
- Agentic, Airbnb, Airtable, Ant Design, and many more

### Examples
Example projects demonstrating plugin usage

### Image Templates
Templates for generating images with consistent branding

### Scenarios
Complete workflow scenarios combining multiple plugins

### Video Templates
Templates for generating video content

## Usage

Each plugin is a portable agent skill with a `SKILL.md` file. To use a plugin:

1. Navigate to the plugin directory
2. Read the `SKILL.md` for instructions
3. Invoke the skill via Claude Code's skill system

## Plugin Structure

```
plugin-name/
├── SKILL.md              # Main skill definition
└── open-design.json      # Plugin metadata (optional)
```

## Installation

These plugins are already installed in your `.claude/skills/open-design-plugins/` directory.

## Documentation

- [Open Design GitHub](https://github.com/nexu-io/open-design)
- [Plugin Spec](https://github.com/nexu-io/open-design/tree/main/plugins/spec)
