# Contributing to CrowdSense AI

Thank you for contributing! Please adhere to the following coding standards, workflows, and testing procedures when contributing to this codebase.

## Code Standards
- **Python**: Enforce type hints on all public function signatures. Document all major functions with Google-style docstrings explaining the purpose, parameters, and return values.
- **Frontend (React)**: Maintain clean Google-Maps-style UI elements. Keep component structures consistent, optimize rendering maps/lists using memoization hook patterns (`useMemo` and `useCallback`), and avoid console logs.

## Security Practices
- Never hardcode or commit credentials. Store API keys in `.env` files which are tracked in `.gitignore`.
- Sanitize input parameters at endpoint levels and enforce length restrictions.

## Verification
Before creating a pull request, run all automated test suites to ensure zero regression:

### Backend (Python pytest)
```bash
cd backend
.venv\Scripts\pytest -v
```

### Frontend (Vitest)
```bash
cd frontend
npm run test
```
