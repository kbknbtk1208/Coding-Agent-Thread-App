export interface ResumeContextTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ResumeContext {
  turns: ResumeContextTurn[];
}
