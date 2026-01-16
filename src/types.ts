export interface RepoInfo {
    owner: string;
    name: string;
    fullName: string;
}

export interface ProjectItem {
    id: string;
    title: string;
    number: number | null;
    type: 'issue' | 'pull_request' | 'draft';
    issueType: string | null;
    status: string | null;
    assignees: string[];
    labels: Array<{ name: string; color: string }>;
    repository: string | null;
    url: string | null;
    projectId: string;
    projectTitle: string;
    fields: Record<string, string>;
}

export interface Project {
    id: string;
    title: string;
    number: number;
    url: string;
}

export interface StatusField {
    fieldId: string;
    options: Array<{
        id: string;
        name: string;
    }>;
}
