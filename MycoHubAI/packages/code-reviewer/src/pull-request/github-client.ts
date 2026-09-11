import { LABEL_DETAILS, type ResultLabel } from "./labels.js";

export interface PullRequestComment {
  id: number;
  body: string;
  userType: string;
}
export interface PullRequestGitHubClient {
  findMarkedComment(marker: string): Promise<PullRequestComment | undefined>;
  createComment(body: string): Promise<void>;
  updateComment(commentId: number, body: string): Promise<void>;
  getCurrentHeadSha(): Promise<string>;
  getLabels(): Promise<string[]>;
  ensureLabel(name: ResultLabel | "ai-cr:review"): Promise<void>;
  addLabel(name: string): Promise<void>;
  removeLabel(name: string): Promise<void>;
}

export class GitHubApiError extends Error {
  constructor(message: string) {
    super(message.replace(/(token|secret|authorization)\s*[:=]\s*\S+/giu, "$1=[redacted]"));
  }
}

export class GitHubClient implements PullRequestGitHubClient {
  constructor(
    private readonly input: { token: string; repository: string; pullRequestNumber: number; fetch?: typeof fetch },
  ) {}
  private get fetcher() {
    return this.input.fetch ?? fetch;
  }
  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/vnd.github+json");
    headers.set("Authorization", `Bearer ${this.input.token}`);
    const response = await this.fetcher(`https://api.github.com/repos/${this.input.repository}${path}`, {
      ...init,
      headers,
    });
    if (!response.ok) throw new GitHubApiError(`GitHub API ${response.status}: ${await response.text()}`);
    return response;
  }
  async findMarkedComment(marker: string): Promise<PullRequestComment | undefined> {
    for (let page = 1; ; page += 1) {
      const comments = (await (
        await this.request(`/issues/${this.input.pullRequestNumber}/comments?per_page=100&page=${page}`)
      ).json()) as { id: number; body: string; user?: { type?: string } }[];
      const comment = comments.find((candidate) => candidate.user?.type === "Bot" && candidate.body.includes(marker));
      if (comment) return { id: comment.id, body: comment.body, userType: "Bot" };
      if (comments.length < 100) return undefined;
    }
  }
  async createComment(body: string): Promise<void> {
    await this.request(`/issues/${this.input.pullRequestNumber}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  }
  async updateComment(commentId: number, body: string): Promise<void> {
    await this.request(`/issues/comments/${commentId}`, { method: "PATCH", body: JSON.stringify({ body }) });
  }
  async getCurrentHeadSha(): Promise<string> {
    return ((await (await this.request(`/pulls/${this.input.pullRequestNumber}`)).json()) as { head: { sha: string } })
      .head.sha;
  }
  async getLabels(): Promise<string[]> {
    return (
      (await (await this.request(`/issues/${this.input.pullRequestNumber}/labels`)).json()) as { name: string }[]
    ).map(({ name }) => name);
  }
  async ensureLabel(name: ResultLabel | "ai-cr:review"): Promise<void> {
    try {
      await this.request(`/labels/${encodeURIComponent(name)}`);
    } catch (error) {
      if (!(error instanceof GitHubApiError) || !error.message.includes("404")) throw error;
      const details = LABEL_DETAILS[name];
      await this.request("/labels", {
        method: "POST",
        body: JSON.stringify({ name, color: details.color, description: details.description }),
      });
    }
  }
  async addLabel(name: string): Promise<void> {
    await this.request(`/issues/${this.input.pullRequestNumber}/labels`, {
      method: "POST",
      body: JSON.stringify({ labels: [name] }),
    });
  }
  async removeLabel(name: string): Promise<void> {
    await this.request(`/issues/${this.input.pullRequestNumber}/labels/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
  }
}
