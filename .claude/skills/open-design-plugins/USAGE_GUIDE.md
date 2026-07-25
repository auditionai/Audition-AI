# Open Design Plugins Usage Guide

## Quick Start

These 231 plugins are now integrated with Claude Code and ready to use. Each plugin is a portable agent skill with specific capabilities.

## How to Use Plugins

### Method 1: Direct Reference
Ask Claude to read a specific plugin's SKILL.md:
```
"Read the dashboard plugin from open-design-plugins and create a dashboard for my SaaS app"
```

### Method 2: Natural Language
Claude can automatically discover relevant plugins based on your request:
```
"Create a landing page for my product"
→ Claude will find examples/landing-page

"Extract design tokens from my CSS"
→ Claude will find atoms/design-extract

"Build an analytics dashboard"
→ Claude will find examples/dashboard
```

### Method 3: Scenario Workflows
Use complete workflows for complex tasks:
```
"Use the od-new-generation scenario to create a new design"
"Run od-code-migration to migrate my old code with new design system"
```

## Popular Use Cases

### 🎨 Create UI Components

**Dashboard**
```
Create an analytics dashboard showing:
- User growth metrics
- Revenue charts
- Active users table
Use the open-design dashboard plugin
```

**Landing Page**
```
Create a landing page for [your product]
Use examples/landing-page from open-design-plugins
```

**Blog Post**
```
Create a blog post layout for [topic]
Use examples/blog-post from open-design-plugins
```

### 🔄 Design System Migration

**Extract Design Tokens**
```
Extract design tokens (colors, typography, spacing) from my codebase
Use atoms/design-extract
```

**Map Tokens**
```
Map my existing design tokens to a new design system
Use atoms/token-map
```

### 📊 Data Visualization

**Data Report**
```
Create a data report showing [your metrics]
Use examples/data-report
```

**Charts & Graphs**
```
Create interactive charts for [your data]
Use examples/frame-data-chart-nyt
```

### 💼 Business Documents

**Pitch Deck**
```
Create a pitch deck with:
- Problem/Solution slides
- Market analysis
- Financial projections
Use examples/deck-swiss-international or deck-open-slide-canvas
```

**Financial Report**
```
Create a financial report with [your data]
Use examples/finance-report or examples/dcf-valuation
```

### 🎬 Media Generation

**Image Templates**
```
Generate branded social media images
Use image-templates/[template-name]
```

**Video Templates**
```
Generate video content with [your specifications]
Use video-templates/[template-name]
```

## Plugin Categories Explained

### Atoms (Building Blocks)
Low-level tools for specific tasks:
- `design-extract` - Pull colors/fonts/spacing from code
- `token-map` - Map tokens between design systems
- `figma-extract` - Import from Figma
- `code-import` - Import source code
- `handoff` - Developer handoff documentation

### Design Systems
Pre-configured visual systems:
- Use when you want a specific look (Material, Ant Design, Apple, etc.)
- Example: "Create a dashboard using Material Design system"

### Examples
Ready-to-use templates:
- Fastest way to get started
- Copy and customize for your needs
- Covers most common use cases

### Scenarios
Complete end-to-end workflows:
- `od-new-generation` - Generate new designs from scratch
- `od-design-refine` - Improve existing designs
- `od-code-migration` - Migrate codebases
- `od-react-export` - Export to React components
- `od-nextjs-export` - Export to Next.js

## Example Conversations

### Create a Dashboard
```
User: I need an analytics dashboard for my SaaS app showing user metrics, 
revenue, and activity logs.

Claude: I'll use the dashboard plugin from open-design-plugins. 
[Reads SKILL.md and generates dashboard]
```

### Extract Design System
```
User: Extract the design system from my existing React components in src/components/

Claude: I'll use the design-extract atom to pull colors, typography, and spacing.
[Analyzes code and creates tokens.json]
```

### Create Marketing Materials
```
User: Create a landing page and email template for my product launch

Claude: I'll use:
1. examples/landing-page for the landing page
2. examples/email-marketing for the email template
[Generates both artifacts]
```

## Plugin Structure

Each plugin follows this structure:
```
plugin-name/
├── SKILL.md              # Main instructions (Claude reads this)
├── open-design.json      # Metadata (optional)
├── assets/               # Images, fonts (if needed)
└── examples/             # Usage examples (if applicable)
```

## Tips for Best Results

1. **Be Specific**: Include details about your use case
   - Bad: "Create a dashboard"
   - Good: "Create a sales analytics dashboard showing monthly revenue, conversion rates, and top products"

2. **Reference Design Systems**: If you have preferences
   - "Use Material Design style"
   - "Match Apple's design language"

3. **Combine Plugins**: Chain multiple plugins
   - Extract tokens → Map to new system → Generate components

4. **Use Scenarios for Complex Work**: For multi-step processes
   - "Use od-code-migration to migrate my Vue app to React with new design system"

## Integration with Your Project

These plugins work seamlessly with your Audition-AI project:

```bash
# Project structure
Audition-AI/
├── .claude/
│   └── skills/
│       └── open-design-plugins/  # ← 231 plugins installed here
├── components/                    # Your React components
├── views/                         # Your views
└── ...
```

Claude can now:
- Generate UI components matching your style
- Extract design patterns from your existing code
- Create new pages/features using proven templates
- Export designs in your preferred framework

## Troubleshooting

**Plugin not found?**
- Check the plugin exists: Browse [PLUGIN_INDEX.md](PLUGIN_INDEX.md)
- Use full path: `open-design-plugins/examples/dashboard`

**Results not matching expectations?**
- Read the SKILL.md first to understand what the plugin does
- Provide more context in your request
- Check if there's a better-matching plugin

**Need custom behavior?**
- Plugins are starting points - ask Claude to customize the output
- Combine multiple plugins for complex needs

## Resources

- [Plugin Index](PLUGIN_INDEX.md) - Complete list of all 231 plugins
- [Open Design GitHub](https://github.com/nexu-io/open-design)
- [Plugin Specification](https://github.com/nexu-io/open-design/tree/main/plugins/spec)

## Next Steps

1. Browse [PLUGIN_INDEX.md](PLUGIN_INDEX.md) to see all available plugins
2. Try a simple example like `examples/dashboard`
3. Explore scenarios for complete workflows
4. Combine plugins for your specific needs

---

**Pro Tip**: Start with examples for quick results, then dive into atoms when you need fine-grained control over the design process.
