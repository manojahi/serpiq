import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';

const TEMPLATE = `# .serpiq.md

> This file gives serpIQ extra product context that the codebase alone can't reveal.
> Commit this file to your repo. It is read on every \`npx serpiq audit\`.

## What is your product?
<!-- 2 to 3 sentences describing what you do, who it's for, and what problem you solve. -->

## Who is your audience?
<!-- Bullet list. e.g. "indie founders shipping side projects", "marketing teams at SaaS companies under 50 employees". -->
- 

## Core features
<!-- 3 to 7 bullets. -->
- 

## Primary competitors
<!-- The 3 to 5 sites/products users compare you to. serpIQ will use these for "vs" keyword opportunities. -->
- 

## Existing content
<!-- Anything serpIQ can't easily discover from the codebase: do you have a blog? changelog? docs site? -->

## SEO goals
<!-- What do you most want to rank for? Any specific markets/locales? -->

## Anything else?
<!-- Free-form notes for the AI strategist. -->
`;

export async function initCommand(cwd: string): Promise<void> {
  const target = path.join(cwd, '.serpiq.md');
  if (fs.existsSync(target)) {
    console.log(chalk.yellow(`.serpiq.md already exists at ${target}`));
    return;
  }
  fs.writeFileSync(target, TEMPLATE);
  console.log(chalk.green('✔ Created .serpiq.md'));
  console.log(chalk.dim('Fill it in and commit it. Then run: npx serpiq audit --gsc-site sc-domain:yoursite.com'));
}
