# Open Design Plugins - Quick Reference

## 📦 Installation Summary
- **Total Plugins**: 231
- **Total Files**: 1,575
- **Total Size**: 69 MB
- **Documentation Files**: 439 markdown files
- **Location**: `.claude/skills/open-design-plugins/`

## 🚀 Quick Commands

### Ask Claude to use a plugin:
```
"Use the dashboard plugin to create an analytics dashboard"
"Read examples/landing-page and create a landing page for my product"
"Extract design tokens using atoms/design-extract"
```

### Browse available plugins:
```
"Show me all dashboard-related plugins"
"What marketing templates are available?"
"List all design system plugins"
```

## 📁 Plugin Categories

| Category | Count | Purpose |
|----------|-------|---------|
| **Atoms** | 13 | Core building blocks for workflows |
| **Design Systems** | 143 | Pre-configured visual systems |
| **Examples** | 182 | Ready-to-use templates |
| **Scenarios** | 13 | Complete end-to-end workflows |
| **Image Templates** | 15 | Branded image generation |
| **Video Templates** | 8 | Video content generation |

## 🎯 Most Useful Plugins

### For UI Development
- `examples/dashboard` - Analytics dashboards
- `examples/landing-page` - Product landing pages
- `examples/docs-page` - Documentation pages
- `examples/blog-post` - Blog layouts

### For Design System Work
- `atoms/design-extract` - Extract tokens from code
- `atoms/token-map` - Map tokens between systems
- `atoms/figma-extract` - Import from Figma
- `scenarios/od-code-migration` - Migrate with design system

### For Business Documents
- `examples/deck-*` - Presentation decks (3 styles)
- `examples/finance-report` - Financial reports
- `examples/dcf-valuation` - DCF valuations
- `examples/data-report` - Data reports

### For Marketing
- `examples/email-marketing` - Email templates
- `examples/card-twitter` - Twitter cards
- `examples/card-xiaohongshu` - Xiaohongshu cards

### For Content
- `examples/article-magazine` - Magazine articles
- `examples/clinical-case-report` - Case reports
- `examples/eng-runbook` - Engineering runbooks

## 🔄 Common Workflows

### 1. Create New UI Component
```
User: Create a [component] for [purpose]
Claude: Uses examples/[component] → Generates HTML/CSS
```

### 2. Extract & Migrate Design
```
User: Extract design tokens from my code
Claude: Uses atoms/design-extract → Creates tokens.json

User: Map to Material Design
Claude: Uses atoms/token-map → Maps tokens
```

### 3. Complete Project Generation
```
User: Generate a complete [project] with design system
Claude: Uses scenarios/od-new-generation → Full workflow
```

## 📖 Documentation Files

- **[README.md](README.md)** - Overview and installation
- **[PLUGIN_INDEX.md](PLUGIN_INDEX.md)** - Complete plugin list with descriptions
- **[USAGE_GUIDE.md](USAGE_GUIDE.md)** - Detailed usage examples and best practices
- **THIS_FILE.md** - Quick reference (you are here)

## 💡 Tips

1. **Start with Examples**: Fastest way to get results
2. **Use Scenarios for Complex Work**: Complete workflows for big tasks
3. **Combine Plugins**: Chain multiple plugins for custom workflows
4. **Be Specific**: More details = better results
5. **Check SKILL.md**: Each plugin's SKILL.md has detailed instructions

## 🔍 Finding the Right Plugin

### By Task Type
- **Dashboard/Admin** → examples/dashboard
- **Landing Page** → examples/landing-page  
- **Documentation** → examples/docs-page
- **Presentation** → examples/deck-*
- **Blog/Article** → examples/blog-post, article-magazine
- **Email** → examples/email-marketing
- **Report** → examples/data-report, finance-report

### By Workflow Stage
- **Discovery** → atoms/discovery-question-form
- **Design** → atoms/direction-picker
- **Extract** → atoms/design-extract, figma-extract
- **Build** → examples/* (182 templates)
- **Review** → atoms/critique-theater, diff-review
- **Export** → scenarios/od-react-export, od-nextjs-export
- **Handoff** → atoms/handoff

## ✅ Verification

Installation complete! You can verify by asking Claude:
```
"List plugins in open-design-plugins/examples/"
"Read the dashboard plugin SKILL.md"
"What open-design plugins are available for creating landing pages?"
```

## 🆘 Troubleshooting

**Plugin not working?**
1. Check it exists in PLUGIN_INDEX.md
2. Ask Claude to read its SKILL.md first
3. Provide more context in your request

**Need help?**
- Browse [PLUGIN_INDEX.md](PLUGIN_INDEX.md) for complete list
- Read [USAGE_GUIDE.md](USAGE_GUIDE.md) for examples
- Check plugin's SKILL.md for specific instructions

## 🔗 Resources

- **Source**: https://github.com/nexu-io/open-design
- **Plugin Spec**: https://github.com/nexu-io/open-design/tree/main/plugins/spec
- **Open Design Docs**: https://open-design.ai

---

**Status**: ✅ Successfully installed and ready to use!
