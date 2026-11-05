import type { PlannedSession } from './types';

export function validateDependencyGraph(items: PlannedSession[]): void {
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const item of items) {
    if (!item.predecessorId) continue;
    if (item.predecessorId === item.id) throw new Error('An activity cannot depend on itself.');
    if (!byId.has(item.predecessorId)) throw new Error('A dependency references a missing activity.');
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error('Study plan dependencies cannot contain cycles.');
    if (visited.has(id)) return;
    visiting.add(id);
    const predecessor = byId.get(id)?.predecessorId;
    if (predecessor) visit(predecessor);
    visiting.delete(id);
    visited.add(id);
  };
  for (const item of items) visit(item.id);
}

export function topologicalOrder(items: PlannedSession[]): PlannedSession[] {
  validateDependencyGraph(items);
  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered: PlannedSession[] = [];
  const visited = new Set<string>();
  const visit = (item: PlannedSession): void => {
    if (visited.has(item.id)) return;
    if (item.predecessorId) visit(byId.get(item.predecessorId)!);
    visited.add(item.id);
    ordered.push(item);
  };
  for (const item of items) visit(item);
  return ordered;
}
