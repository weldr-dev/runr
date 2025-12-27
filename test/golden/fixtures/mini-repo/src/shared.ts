/**
 * Shared module - used by both API and UI
 * This file is designed to cause collisions when both tracks touch it.
 */

export interface User {
  id: string;
  name: string;
}

export function formatUser(user: User): string {
  return `${user.name} (${user.id})`;
}

export const DEFAULT_USER: User = {
  id: '0',
  name: 'guest'
};
