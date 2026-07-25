# Open Design Plugins Index

Total plugins installed: **231**

## Quick Reference

### 🧩 Atoms (13 plugins)
Core building blocks for design workflows:

| Plugin | Description |
|--------|-------------|
| build-test | Test and validate build outputs |
| code-import | Import source code for analysis |
| critique-theater | Review and critique designs |
| design-extract | Extract design tokens from code/Figma |
| diff-review | Review design changes |
| direction-picker | Choose design direction |
| discovery-question-form | Gather design requirements |
| figma-extract | Extract design from Figma files |
| handoff | Handoff designs to developers |
| patch-edit | Edit and patch designs |
| rewrite-plan | Plan design rewrites |
| todo-write | Write design todos |
| token-map | Map design tokens across systems |

### 🎨 Design Systems (143 plugins)
Pre-configured design systems from popular frameworks including:
- Agentic, Airbnb, Airtable, Ant Design, Apple, Atlassian
- Bootstrap, Material Design, Tailwind
- And 136+ more design systems

### 📋 Examples (182 plugins)
Ready-to-use templates for common use cases:
- **Articles & Content**: blog-post, article-magazine, clinical-case-report
- **Marketing**: landing-page, email-marketing, card-twitter, card-xiaohongshu
- **Business**: dashboard, data-report, finance-report, dcf-valuation
- **Presentations**: deck-* templates (Swiss, Editorial, Open Slide Canvas)
- **Documentation**: docs-page, eng-runbook, design-brief
- **Animations**: frame-* templates (charts, flowcharts, effects)
- And 150+ more examples

### 🎬 Scenarios (13 plugins)
Complete workflow orchestrations:
- **od-default** - Standard design generation
- **od-new-generation** - Create new designs from scratch
- **od-design-refine** - Refine existing designs
- **od-code-migration** - Migrate code with design system
- **od-figma-migration** - Migrate from Figma
- **od-media-generation** - Generate images/videos
- **od-nextjs-export** - Export to Next.js
- **od-react-export** - Export to React
- **od-vue-export** - Export to Vue
- **od-plugin-authoring** - Create new plugins
- **od-tune-collab** - Collaborative tuning
- **od-web-effect-extractor** - Extract web effects
- **od-share-to-community** - Share to community

### 🖼️ Image Templates (15 plugins)
Templates for generating branded images

### 🎥 Video Templates (8 plugins)
Templates for generating video content

## Usage Examples

### Generate a landing page
```bash
# Use the landing-page example
cd examples/landing-page
# Read SKILL.md for instructions
```

### Extract design tokens from existing code
```bash
# Use the design-extract atom
cd atoms/design-extract
# Follow SKILL.md to extract colors, typography, spacing
```

### Create a dashboard
```bash
# Use the dashboard example
cd examples/dashboard
# Generates interactive data dashboard
```

## Integration with Claude

These plugins are now available in your `.claude/skills/` directory. Claude can:
1. Read any plugin's `SKILL.md` to understand its capabilities
2. Execute plugin workflows
3. Combine multiple plugins for complex tasks

## Directory Structure

```
open-design-plugins/
├── atoms/              # 13 workflow building blocks
├── design-systems/     # 143 pre-configured design systems
├── examples/           # 182 ready-to-use templates
├── scenarios/          # 13 complete workflows
├── image-templates/    # 15 image generation templates
├── video-templates/    # 8 video generation templates
└── README.md           # This file
```

## Next Steps

1. **Browse examples**: Check `examples/` for ready-to-use templates
2. **Explore scenarios**: Check `scenarios/` for complete workflows
3. **Read plugin specs**: Each plugin has a `SKILL.md` with detailed instructions
4. **Combine plugins**: Use atoms to build custom workflows

## Resources

- [Open Design GitHub](https://github.com/nexu-io/open-design)
- [Plugin Specification](https://github.com/nexu-io/open-design/tree/main/plugins/spec)
- [Open Design Documentation](https://open-design.ai)
