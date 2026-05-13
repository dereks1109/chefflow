export function randomId(): string {
  return 'r_' + Math.random().toString(36).slice(2, 10).padEnd(8, '0');
}
