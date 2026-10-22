// Neo is an alpha, on only where its switch in Alpha features is on. Nothing
// else may turn it on: Settings draws the switch from this one setting, so a
// second way on runs Neo behind a switch that reads off.
export function neoEnabled({ platform = process.platform, config = null } = {}) {
  return platform === 'darwin' && config?.alphaNeo === true;
}
