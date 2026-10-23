import type { JiraIssue, JiraTodo } from '../types'

export const JIRA_ISSUE_TOOL = 'mcp__claude_ai_Atlassian__getJiraIssue'
export const JIRA_SITES_TOOL = 'mcp__claude_ai_Atlassian__getAccessibleAtlassianResources'
export const JIRA_FIELDS = ['summary', 'status', 'issuetype', 'priority', 'assignee', 'parent', 'description', 'updated']

// Uppercase only: a lowercase match would read `hotfix-1` as a ticket.
const TICKET_KEY = /(?:^|[^A-Za-z0-9])([A-Z][A-Z0-9]+-\d+)(?!\d)/

const TODO_LINE = /^\s*[-*]\s+\[( |x|X)\]\s+(.+)$/

type Fields = Record<string, unknown>

const record = (value: unknown): Fields | null => (value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Fields) : null)
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null)

export function isConnectorMissing(failure: string): boolean {
  return failure.includes('no tool named')
}

export function ticketKey(...names: readonly (string | null)[]): string | null {
  for (const name of names) {
    const match = name === null ? null : TICKET_KEY.exec(name)
    if (match?.[1] !== undefined) return match[1]
  }

  return null
}

export function pickJiraSite(answer: string): string | null {
  let sites: unknown

  try {
    sites = JSON.parse(answer)
  } catch {
    return null
  }

  if (!Array.isArray(sites)) return null

  const jira = sites.map(record).find(site => Array.isArray(site?.scopes) && (site.scopes as unknown[]).includes('read:jira-work'))

  return text(jira?.id)
}

function plainLine(line: string): string {
  return line
    .replace(/<custom[^>]*>.*?<\/custom>/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*(?:[-*]\s+|\d+\.\s+|>\s*)/, '')
    .replace(/[`*_]/g, '')
    .trim()
}

export function parseTodos(description: string): JiraTodo[] {
  return description.split('\n').flatMap(line => {
    const match = TODO_LINE.exec(line)

    return match === null ? [] : [{ text: plainLine(match[2] ?? ''), isDone: match[1] !== ' ' }]
  })
}

// Headings, checklist lines and bare links are left out: the checklist is
// drawn on its own and a link cannot be opened from the pane.
export function descriptionExcerpt(description: string, count: number): string[] {
  return description
    .split('\n')
    .filter(line => !/^\s*#{1,6}\s/.test(line) && !TODO_LINE.test(line))
    .map(plainLine)
    .filter(line => line !== '' && !/^https?:\/\/\S+$/.test(line) && !/^[-=]{3,}$/.test(line))
    .slice(0, count)
}

// getJiraIssue answers { issues: { nodes: [issue] } }; a bare issue is read too.
export function parseJiraIssue(answer: string, readAt: number): JiraIssue | null {
  let parsed: unknown

  try {
    parsed = JSON.parse(answer)
  } catch {
    return null
  }

  const nodes = record(record(parsed)?.issues)?.nodes
  const issue = Array.isArray(nodes) ? record(nodes[0]) : record(parsed)
  const fields = record(issue?.fields)
  const key = text(issue?.key)

  if (issue === null || fields === null || key === null) return null

  const status = record(fields.status)
  const parent = record(fields.parent)
  const description = text(fields.description) ?? ''

  return {
    key,
    summary: text(fields.summary) ?? '',
    status: text(status?.name) ?? 'unknown',
    statusCategory: text(record(status?.statusCategory)?.key) ?? 'indeterminate',
    type: text(record(fields.issuetype)?.name),
    priority: text(record(fields.priority)?.name),
    assignee: text(record(fields.assignee)?.displayName),
    parentKey: text(parent?.key),
    parentSummary: text(record(parent?.fields)?.summary),
    url: text(issue.webUrl),
    todos: parseTodos(description),
    excerpt: descriptionExcerpt(description, 3),
    readAt,
  }
}
