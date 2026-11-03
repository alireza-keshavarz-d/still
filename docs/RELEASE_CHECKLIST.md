# Release and deployment checklist

## Required repository configuration

1. Keep `main` as the production/default branch unless the repository itself is intentionally renamed/reconfigured.
2. Open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
3. Confirm the account plan permits GitHub Pages for this private repository. GitHub Pages is available for private repositories on Pro, Team, and Enterprise plans; GitHub Free supports Pages for public repositories.
4. Review the `github-pages` environment. Restrict deployment to `main` if environment protection rules are configured.
5. Keep GitHub Actions enabled for the repository.

## CI behavior

Every branch push triggers the quality job:

- TypeScript type-check
- Unit tests
- Production build
- Pages artifact upload

Pull requests targeting `main` also run the quality job. Feature-branch runs do not deploy.

## Production deployment

A successful push to `main` runs the deployment job after quality checks complete. The workflow uses the `github-pages` environment and GitHub's Pages deployment permissions; no deployment secret is required.

The project site path is `/still/`. The Vite build receives `VITE_BASE_PATH=/still/` to produce correct asset and service-worker paths for a GitHub Pages project site.

## Verification after deployment

- Open the Pages URL from the successful deployment job.
- Verify the home screen loads directly and after refresh.
- Verify assets and service worker load under the `/still/` path.
- Create, pause, resume, rename, and stop a test session.
- Refresh and verify records remain in IndexedDB.
- Test the interrupted-session recovery prompt.
- Verify date grouping and daily totals around midnight in `Asia/Tehran`.
- Install the PWA on representative desktop and mobile browsers.

## Privacy

GitHub Pages sites are publicly accessible, even when their source repository is private. Still stores study records in each user's browser and does not send those records to GitHub Pages. Do not add secrets or private user data to the static application bundle or repository.

If the application later gains account-based or server-side features, choose an authenticated hosting and API architecture separately rather than treating a public static Pages site as private application hosting.
