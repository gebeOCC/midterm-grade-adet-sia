# Midterm Grade Portal — GitHub + Vercel

This project keeps the grade roster on the backend. The browser sends one student ID to `POST /api/grade` and receives only that student's matching record. The one-click reveal and 50 playful suspense messages are preserved.

## Files to download

- `midterm-vercel.zip`: application source. Extract it and upload the contents of its `midterm-vercel` folder to your GitHub repository.
- `private-grades.json`: your 95 supplied student records. Keep this separate from the repository. Its entire contents become the Vercel environment variable value.

Do not upload the old standalone HTML or `private-grades.json` to GitHub. The project ZIP contains no student roster. `.gitignore` and `.vercelignore` also exclude common private roster and environment-file names, but GitHub's browser upload can still upload files you manually select.

## Deploy

1. Extract `midterm-vercel.zip`.
2. Create a GitHub repository and upload the project files. Put `package.json`, `vercel.json`, `api`, `lib`, and `public` at the repository root. Include the supplied `.gitignore` and `.vercelignore` when using Git.
3. In Vercel, import that repository as a new project. Choose **Other** as the framework if asked. The included configuration sets the output directory to `public` and skips a frontend build. Leave the root directory at the folder containing `package.json`; do not set it to `public`.
4. Add a server environment variable named **`GRADES_JSON`**. Open `private-grades.json` in a text editor and paste its full contents, from `[` through `]`, into the value. Paste the JSON itself, not the filename, not a path, and not an extra quoted JSON string. Select **Production**. Enable **Preview** too only if those deployments should support grade lookups.
5. Deploy. If the deployment already happened before adding the variable, redeploy after saving it.
6. Open the Vercel website URL. Enter a student ID and click once; suspense plays and the backend result appears automatically.

Vercel documents [static output and skipping builds](https://vercel.com/docs/builds/configure-a-build), [Node.js functions in `api/`](https://vercel.com/docs/functions/runtimes/node-js), and [adding environment variables and redeploying](https://vercel.com/docs/environment-variables/managing-environment-variables).

## Run locally

Use Node.js 24 (the project’s pinned Vercel runtime). No third-party dependencies are required.

With `private-grades.json` beside the extracted `midterm-vercel` folder:

```sh
cd midterm-vercel
npm run dev -- --grades-file ../private-grades.json
```

Open the local URL printed by the server. Open that URL instead of double-clicking the HTML file. The local server serves only the public frontend and the grade API.

If `GRADES_JSON` is already set in your shell, `npm run dev` can use that instead. The private JSON file is a local development input; production reads `GRADES_JSON` from Vercel.

Run backend tests:

```sh
npm test
```

## API

```http
POST /api/grade
Content-Type: application/json

{"studentId":"2024-1-00000"}
```

Use a real supplied ID when testing; the example above is a placeholder. Spaces and hyphens are normalized. Original IDs and one-decimal grade strings are preserved, including six-digit final ID groups.

A successful response is shaped like:

```json
{
  "record": {
    "id": "2024-1-00000",
    "lastName": "Example",
    "firstName": "Student",
    "middleInitial": "",
    "section": "3C",
    "subject": "Application Development and Emerging Technologies",
    "grade": "1.7"
  }
}
```

The endpoint returns `400` for invalid input, `404` for no matching student, `405` for other methods, `413` for oversized requests, `415` for unsupported content types, and `503` when the server roster is missing or invalid. API responses use `Cache-Control: no-store`. There is no endpoint to list all records. The app does not log submitted IDs or the roster.

## Update grades

Edit your private JSON file, replace the `GRADES_JSON` value in Vercel, and redeploy. Student fields are `id`, `lastName`, `firstName`, `middleInitial`, `section`, `subject`, and `grade`. Keep grades as strings such as `"1.0"`; use `""` for a blank middle initial. Each normalized ID must be unique.

The supplied roster is about 17 KB. This uses an environment variable because the roster is small and fixed; there is no database or admin editing screen.

## Access limit

Moving grades to the backend removes the full roster from page source and the GitHub project. Student IDs are still the only lookup input. Someone who knows or guesses another student's ID can request that student's grade. There is no login or durable rate limit in this version. If each student must be restricted to their own result, add authentication before using it for confidential grade access.

## Troubleshooting

- **A little technical pause / 503**: check that `GRADES_JSON` contains valid JSON, all required fields are present, IDs are unique, and the variable applies to the deployment environment. Redeploy after changing it.
- **API 404 on Vercel for every lookup**: confirm `api/grade.js` is at the project root and the Vercel root directory is the folder containing `package.json`.
- **HTML opened from your disk**: this version requires the local server or a deployed Vercel URL.
- **Old grade data still visible in GitHub**: remove the old embedded HTML and roster files from the repository. Existing Git history may retain earlier committed data.

Prepared and locally tested; no GitHub upload or Vercel deployment has been performed for you.
