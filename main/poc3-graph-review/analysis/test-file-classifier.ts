export function isUnitOrIntegrationTestFile(filePath: string): boolean {
  const normalized = filePath.replaceAll('\\', '/').toLowerCase();
  if (!/\.(test)\.[cm]?[tj]sx?$/.test(normalized)) return false;
  if (/(^|\/)(e2e|fixtures?|__fixtures__|snapshots?|__snapshots__)(\/|$)/.test(normalized)) {
    return false;
  }
  if (/(^|\/)(setup|test-setup|jest\.setup|vitest\.setup)/.test(normalized)) {
    return false;
  }
  if (/\.(stories|story)\.[cm]?[tj]sx?$/.test(normalized)) return false;
  return true;
}
