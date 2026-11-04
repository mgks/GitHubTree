export interface TreeItem {
    path: string;
    mode: string;
    type: 'blob' | 'tree' | string;
    sha: string;
    size?: number;
    url?: string;
}

export interface TreeResult {
    tree: TreeItem[];
    truncated: boolean;
    branch: string;
}

export interface SortOptions {
    depth?: number;
    ignore?: string[];
}

export interface AsciiTreeOptions {
    icons?: boolean;
    json?: boolean;
    style?: 'classic' | 'bulleted' | string;
}

export interface TreeStats {
    totalFiles: number;
    totalDirs: number;
    totalBytes: number;
    extensions: Record<string, number>;
}

export class GitHubTree {
    token: string | null;
    apiBase: string;

    constructor(token?: string | null);

    getTree(repo: string, branch?: string): Promise<TreeResult>;

    sortTree(
        flatTree: TreeItem[],
        method?: 'folder-az' | 'folder-za' | 'alpha-az' | 'alpha-za',
        options?: SortOptions
    ): TreeItem[];

    generateAsciiTree(flatTree: TreeItem[], options?: AsciiTreeOptions): string;

    getTreeStats(flatTree: TreeItem[]): TreeStats;
}
