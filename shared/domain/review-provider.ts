// ── GitHub REST API response types ──
// GET /repos/{owner}/{repo}/pulls/{number}/files
export interface GitHubPRFile {
  sha: string;
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  previous_filename?: string;
  contents_url: string;
  blob_url: string;
  raw_url: string;
}

// GET /repos/{owner}/{repo}/pulls/{number}/comments
export interface GitHubPRReviewComment {
  id: number;
  body: string;
  path: string;
  line: number | null;
  side: 'LEFT' | 'RIGHT';
  start_line: number | null;
  start_side: 'LEFT' | 'RIGHT' | null;
  commit_id?: string;
  original_commit_id?: string;
  diff_hunk?: string;
  in_reply_to_id?: number;
  user: GitHubUser;
  created_at: string;
  updated_at: string;
}

export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
}

// ── GitLab REST API response types ──
// GET /projects/:id/merge_requests/:iid/diffs
export interface GitLabMRDiff {
  old_path: string;
  new_path: string;
  a_mode: string;
  b_mode: string;
  diff: string;
  new_file: boolean;
  renamed_file: boolean;
  deleted_file: boolean;
  collapsed: boolean;
  too_large: boolean;
}

// GET /projects/:id/merge_requests/:iid/discussions
export interface GitLabDiscussion {
  id: string;
  notes: GitLabNote[];
}

export interface GitLabNote {
  id: number;
  body: string;
  author: GitLabAuthor;
  position?: GitLabPosition;
  resolved: boolean;
  created_at: string;
  updated_at: string;
}

export interface GitLabAuthor {
  username: string;
  id: number;
  avatar_url: string;
}

export interface GitLabPosition {
  base_sha: string;
  start_sha: string;
  head_sha: string;
  position_type: 'text' | 'image';
  old_path: string;
  new_path: string;
  old_line: number | null;
  new_line: number | null;
  line_range?: GitLabLineRange;
}

export interface GitLabLineRange {
  start: GitLabLineRangeRef;
  end: GitLabLineRangeRef;
}

export interface GitLabLineRangeRef {
  line_code: string;
  type: 'new' | 'old';
  old_line: number | null;
  new_line: number | null;
}
