import {install, cli} from '../scripts/install.mjs';
if (process.env.CI !== 'true' || !process.env.OPENCLAW_STATE_DIR?.endsWith('gear-engine-openclaw')) {
  throw new Error('This test must run in the isolated CI Gateway.');
}
const run = args => {
  const result = cli(args);
  console.log('Fixture CLI:', args.join(' '));
  // The isolated Gateway has only synthetic configuration and no real credentials.
  console.log(result.stdout); console.error(result.stderr);
  return result;
};
install({run});
install({run,action:'rollback'});
install({run});
