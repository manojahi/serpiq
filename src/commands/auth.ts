import chalk from 'chalk';
import { runOAuthFlow, listSites } from '../lib/gsc.js';

export async function authCommand(): Promise<void> {
  await runOAuthFlow();
  try {
    const sites = await listSites();
    if (sites.length === 0) {
      console.log(chalk.yellow('No verified Search Console properties found on this Google account.'));
      console.log(`Add and verify your site at ${chalk.cyan('https://search.google.com/search-console')} first.`);
      return;
    }
    console.log(chalk.bold('\nAvailable GSC properties:'));
    for (const s of sites) console.log(`  - ${s}`);
    console.log(chalk.dim('\nPass one to --gsc-site when running the audit, e.g.:'));
    console.log(chalk.dim(`  npx serpiq audit --gsc-site ${sites[0]}`));
  } catch (e) {
    console.error(chalk.red('Could not list properties:'), (e as Error).message);
  }
}
