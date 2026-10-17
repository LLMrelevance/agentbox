// Neo is an alpha for one Mac. It is on only where the file `neo-alpha` sits
// in the app's data folder, which nothing in the app ever creates: a person
// creates it by hand. This is an opt-in, not a lock; the point is that no one
// gets Neo by updating, and nothing of it starts where the file is absent.
import fs from 'node:fs';
import path from 'node:path';

export const FLAG = 'neo-alpha';

export function neoEnabled({ userData, platform = process.platform, exists = fs.existsSync } = {}) {
  if (platform !== 'darwin' || !userData) return false;
  return exists(path.join(userData, FLAG));
}
