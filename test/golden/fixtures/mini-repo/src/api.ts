/**
 * API module - target for API-related tasks
 */

export function getUsers(): string[] {
  return ['alice', 'bob'];
}

export function getUser(id: string): { id: string; name: string } | null {
  const users: Record<string, string> = {
    '1': 'alice',
    '2': 'bob'
  };
  const name = users[id];
  return name ? { id, name } : null;
}
