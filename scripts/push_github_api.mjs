#!/usr/bin/env node
/**
 * push_github_api.mjs — 用 GitHub REST API (Git Data) 把本地文件作为一个 commit 推到远程分支。
 * 用途：沙箱内 git CLI 连不上 github.com:443，但 api.github.com 可达，走 API 直推。
 *
 * 用法：
 *   GH_TOKEN=xxx node scripts/push_github_api.mjs <owner> <repo> <branch> <commit-message> <file1> [file2 ...]
 *
 * 安全：token 仅从环境变量 GH_TOKEN 读取，本脚本不含任何凭据，不写任何配置。
 * 行为：在远程分支当前 head 之上叠加一个新 commit（base_tree 保留远程已有文件，只增/改传入的文件）。
 */
import { readFileSync } from 'node:fs';

const [owner, repo, branch, message, ...files] = process.argv.slice(2);
const token = process.env.GH_TOKEN;

if (!token) { console.error('FATAL: GH_TOKEN env not set'); process.exit(1); }
if (!owner || !repo || !branch || !message || files.length === 0) {
  console.error('Usage: GH_TOKEN=xxx node push_github_api.mjs <owner> <repo> <branch> <message> <file...>');
  process.exit(1);
}

const API = `https://api.github.com/repos/${owner}/${repo}`;
const HEADERS = {
  'Authorization': `Bearer ${token}`,
  'Accept': 'application/vnd.github+json',
  'User-Agent': 'wb-push-script',
  'Content-Type': 'application/json',
};

async function gh(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json;
}

const main = async () => {
  // 1. 远程分支 head
  const ref = await gh('GET', `/git/ref/${encodeURIComponent('heads/' + branch)}`);
  const headSha = ref.object.sha;
  const headCommit = await gh('GET', `/git/commits/${headSha}`);
  console.log(`remote head: ${headSha.slice(0, 7)}`);

  // 2. 每个文件建 blob（base64，避免任何 JSON 转义问题）
  const treeItems = [];
  for (const f of files) {
    const content = readFileSync(f); // 相对 cwd 的路径 = 仓库内路径
    const blob = await gh('POST', '/git/blobs', {
      content: content.toString('base64'),
      encoding: 'base64',
    });
    const repoPath = f.replace(/\\/g, '/');
    treeItems.push({ path: repoPath, mode: '100644', type: 'blob', sha: blob.sha });
    console.log(`blob ok: ${repoPath} (${content.length}B)`);
  }

  // 3. 基于远程 head tree 建新 tree（只叠加，不动其他文件）
  const tree = await gh('POST', '/git/trees', {
    base_tree: headCommit.tree.sha,
    tree: treeItems,
  });

  // 4. 建 commit + 移 ref
  const commit = await gh('POST', '/git/commits', {
    message,
    tree: tree.sha,
    parents: [headSha],
  });
  await gh('PATCH', `/git/refs/${encodeURIComponent('heads/' + branch)}`, {
    sha: commit.sha,
    force: false,
  });
  console.log(`PUSHED: ${commit.sha.slice(0, 7)} -> ${owner}/${repo}@${branch}`);
};

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
