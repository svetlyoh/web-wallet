import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await build({entryPoints:[resolve(root,'src/control-ui.ts')], outfile:resolve(root,'plugin/dist/control-ui/index.js'),
  bundle:true, format:'esm', platform:'browser', target:'es2022', minify:true, legalComments:'inline'});
console.log('Built self-contained native UI bundle. No runtime npm dependencies.');
