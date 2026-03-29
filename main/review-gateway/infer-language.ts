const LANG_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  json: 'json',
  yml: 'yaml',
  yaml: 'yaml',
  md: 'markdown',
  css: 'css',
  html: 'html',
};

export function inferLanguage(filePath: string): string {
  const ext = filePath.split('.').pop() ?? '';
  return LANG_MAP[ext] ?? ext;
}
