/**
 * UI module - target for UI-related tasks
 */

export function renderUserList(users: string[]): string {
  return `<ul>${users.map(u => `<li>${u}</li>`).join('')}</ul>`;
}

export function renderUser(user: { id: string; name: string }): string {
  return `<div class="user" data-id="${user.id}">${user.name}</div>`;
}
