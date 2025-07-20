# 🔍 GitHub Actions Workflows

This directory contains comprehensive GitHub Actions workflows for code quality, linting, and validation across all technologies used in the Factory Dashboard project.

## 📋 Workflow Overview

### 🔍 Comprehensive Linting (`lint.yml`)
**Triggers:** Push to main branches, Pull Requests
**Purpose:** Complete linting for all project technologies

**Technologies Covered:**
- **Frontend:** TypeScript, React, ESLint, Vite build validation
- **Backend:** Node.js services (auth-service, plc-emulator, queue-consumer)
- **Docker:** Dockerfile linting with Hadolint, Docker Compose validation
- **Shell Scripts:** ShellCheck analysis for all `.sh` files
- **Configuration:** JSON/YAML validation, Prettier formatting
- **Documentation:** Markdown linting, broken link detection
- **Security:** npm audit, secret scanning with TruffleHog

### ⚡ Quick Lint Check (`quick-lint.yml`)
**Triggers:** Every push and PR on any branch
**Purpose:** Fast feedback for basic linting errors

**Includes:**
- ESLint check
- TypeScript compilation
- Build validation
- Docker checks (when Docker files change)

### 📊 Code Quality Analysis (`code-quality.yml`)
**Triggers:** Push to main/develop, PRs, daily schedule
**Purpose:** Deep code quality analysis and metrics

**Features:**
- TypeScript strict mode checking
- Test coverage analysis
- Dependency vulnerability scanning
- Bundle size analysis
- SonarCloud integration
- Performance analysis with Lighthouse
- Documentation coverage

### 🏗️ Infrastructure & Deployment Validation (`infrastructure-lint.yml`)
**Triggers:** Changes to infrastructure files
**Purpose:** Validate deployment and infrastructure configuration

**Validates:**
- Docker security scanning with Trivy
- Docker Compose security best practices
- Shell script security analysis
- Grafana dashboard configuration
- Alert rules validation
- Deployment smoke tests

## 🔧 Setup Requirements

### Required Secrets
Add these secrets to your GitHub repository:

```bash
# For SonarCloud integration (optional)
SONAR_TOKEN=your_sonarcloud_token

# Other secrets are handled by GitHub automatically:
# GITHUB_TOKEN (automatically provided)
```

### Required Tools Versions
- **Node.js:** 20
- **Python:** 3.11 (for some linting tools)
- **Docker:** Latest stable

## 📈 Workflow Results

### Status Badges
Add these badges to your main README.md:

```markdown
[![Comprehensive Linting](https://github.com/handrades/factory-dashboard-test-01/actions/workflows/lint.yml/badge.svg)](https://github.com/handrades/factory-dashboard-test-01/actions/workflows/lint.yml)
[![Code Quality](https://github.com/handrades/factory-dashboard-test-01/actions/workflows/code-quality.yml/badge.svg)](https://github.com/handrades/factory-dashboard-test-01/actions/workflows/code-quality.yml)
[![Infrastructure Validation](https://github.com/handrades/factory-dashboard-test-01/actions/workflows/infrastructure-lint.yml/badge.svg)](https://github.com/handrades/factory-dashboard-test-01/actions/workflows/infrastructure-lint.yml)
```

### Workflow Outputs
- **SARIF Reports:** Security scan results uploaded to GitHub Security tab
- **Coverage Reports:** Test coverage metrics
- **Performance Reports:** Lighthouse performance scores
- **Quality Summary:** Detailed quality metrics in workflow summaries

## 🚀 Local Development

### Running Lints Locally
Before pushing code, run these commands:

```bash
# Frontend linting
npm run lint
npx tsc -b config/tsconfig.json --noEmit
npm run build

# Docker linting
docker run --rm -i hadolint/hadolint < Dockerfile

# Shell script linting
shellcheck scripts/*.sh

# YAML/JSON validation
find . -name "*.json" -not -path "./node_modules/*" -exec jsonlint {} \;
find . -name "*.yml" -exec yamllint {} \;
```

### Pre-commit Setup
Consider installing pre-commit hooks:

```bash
# Install pre-commit
pip install pre-commit

# Create .pre-commit-config.yaml (example)
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.4.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-json
      - id: check-yaml
  - repo: local
    hooks:
      - id: eslint
        name: ESLint
        entry: npm run lint
        language: system
        pass_filenames: false
```

## 🔍 Troubleshooting

### Common Issues

1. **ESLint Errors:** Check `config/eslint.config.js` configuration
2. **TypeScript Errors:** Verify `config/tsconfig.json` settings
3. **Docker Build Failures:** Ensure all dependencies are correctly specified
4. **Test Failures:** Check service-specific test configurations

### Workflow Failures
- Check the **Actions** tab for detailed error logs
- Review the **Security** tab for security scan results
- Check **Pull Request** comments for automated feedback

### Performance Optimization
- Use branch protection rules to require passing checks
- Cache dependencies for faster workflow runs
- Use conditional workflows to skip unnecessary checks

## 📚 Additional Resources

- [ESLint Configuration](../config/eslint.config.js)
- [TypeScript Configuration](../config/tsconfig.json)
- [Docker Best Practices](../docs/deployment-guide.md)
- [Security Guidelines](../docs/SECURITY.md)

## 🤝 Contributing

When adding new linting rules or workflows:

1. Test workflows locally when possible
2. Use conditional execution to avoid unnecessary runs
3. Add appropriate documentation
4. Consider impact on CI/CD performance
5. Follow the existing naming conventions

---

*This linting infrastructure ensures code quality, security, and maintainability across all technologies in the Factory Dashboard project.*