// The renderer's fixture snapshot as JSON, for a stage outside the app.
import fs from 'node:fs';
import { fixtureSnapshot } from '../../renderer/src/fixtures';

fs.writeFileSync(process.argv[2], JSON.stringify(fixtureSnapshot));
