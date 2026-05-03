export function extractPoc3SourceLineInfoFromPoint(
  clientX: number,
  clientY: number,
): { filePath: string; side: 'LEFT' | 'RIGHT'; line: number } | null {
  let element = document.elementFromPoint(clientX, clientY);
  while (element) {
    if (element instanceof HTMLElement && element.dataset.poc3SourceLine === 'true') {
      if (element.dataset.providerSelectable !== 'true') return null;
      const side = element.dataset.side;
      const line = Number(element.dataset.line);
      const filePath = element.dataset.filePath;
      if ((side === 'LEFT' || side === 'RIGHT') && Number.isFinite(line) && line > 0 && filePath) {
        return { filePath, side, line };
      }
      return null;
    }
    element = element.parentElement;
  }
  return null;
}
