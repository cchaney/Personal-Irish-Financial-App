# Contributing

Thanks for helping improve PIFA.

1. For anything bigger than a small fix, open an issue first so we can agree on the approach.
2. Fork the repo and create a branch from `main`.
3. Make your change. If you change the maths or tax rules, add or update a test in `backend/tests/`.
4. Check it works:
   ```
   cd backend && pip install -r requirements.txt pytest && pytest
   cd ../frontend && npm ci && npm run build
   ```
5. Open a pull request into `main` and fill in the template.

All pull requests need the automated checks to pass and an approval from the maintainer before they can be merged.

**Irish tax figures** live in `backend/app/services/irish_tax.py`. If you update them after a Budget, please link the official source (revenue.ie, gov.ie or citizensinformation.ie) in your pull request.

**Never include real financial data** in issues, pull requests, screenshots or test files.
