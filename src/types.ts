export interface TreeNode {
  name: string;
  path: string;
  size: number;
  is_dir: boolean;
  children: TreeNode[];
  other: number;
  other_count: number;
  files: number;
}

export interface Drive {
  mount: string;
  name: string;
  fs: string;
  total: number;
  free: number;
  removable: boolean;
}

export interface Progress {
  files: number;
  dirs: number;
  bytes: number;
  errors: number;
  current: string;
  elapsed_ms: number;
}

export interface ScanResult {
  root: TreeNode;
  files: number;
  dirs: number;
  errors: number;
  elapsed_ms: number;
  cancelled: boolean;
}

export type Verdict = "safe" | "your-call" | "keep";

export interface Rule {
  id: string;
  app: string;
  title: string;
  paths: string[];
  verdict: Verdict;
  explanation: string;
  how_to_free: string;
  action: string | null;
}

export interface CleanupItem {
  rule: Rule;
  path: string;
  size: number;
  files: number;
  can_delete: boolean;
}

export interface CleanResult {
  freed: number;
  failed: number;
}
