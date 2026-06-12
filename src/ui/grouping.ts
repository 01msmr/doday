// Gruppierungslogik: verteilt Aufgaben & Termine auf den Bereichs-Baum.
// Objekte mit Untertag (z. B. #Zuhause.Aufräumen) hängen im Kind-Knoten,
// zählen über totalCount aber auch zur Eltern-Gruppe – wie in der Konzept-Skizze.
import { buildHierarchy, type TagNode } from '../services/tagService';
import type { CalendarEvent, Task } from '../models/types';

/** Ein Bereich in der UI: eigener Inhalt + Unterbereiche */
export interface AreaGroup {
  node: TagNode;
  tasks: Task[];
  events: CalendarEvent[];
  children: AreaGroup[];
  /** Aufgaben + Termine in diesem Bereich inklusive aller Unterbereiche */
  totalCount: number;
}

/** Ergebnis der Gruppierung: Bereichs-Gruppen + Objekte ohne Tag */
export interface GroupedDay {
  groups: AreaGroup[];
  untagged: { tasks: Task[]; events: CalendarEvent[] };
}

export function groupByArea(
  tasks: Task[],
  events: CalendarEvent[],
  orderOf?: (path: string) => number | undefined,
): GroupedDay {
  // 1. Objekte ohne Tag aussortieren – sie landen unten in "Ohne Bereich"
  const untagged = {
    tasks: tasks.filter((task) => task.tags.length === 0),
    events: events.filter((event) => event.tags.length === 0),
  };

  // 2. Aus allen verwendeten Tags den Bereichs-Baum bauen
  //    (buildHierarchy legt fehlende Eltern automatisch an)
  const allTags = [...tasks, ...events].flatMap((item) => item.tags);
  const hierarchy = buildHierarchy(allTags);

  // 3. Items pro exaktem Tag-Pfad sammeln – Mehrfach-Tags landen in mehreren Gruppen
  const tasksByPath = new Map<string, Task[]>();
  const eventsByPath = new Map<string, CalendarEvent[]>();
  for (const task of tasks) {
    for (const tag of task.tags) {
      tasksByPath.set(tag, [...(tasksByPath.get(tag) ?? []), task]);
    }
  }
  for (const event of events) {
    for (const tag of event.tags) {
      eventsByPath.set(tag, [...(eventsByPath.get(tag) ?? []), event]);
    }
  }

  // 4. Baum rekursiv in AreaGroups übersetzen und Zähler aufsummieren
  function toGroup(node: TagNode): AreaGroup {
    const ownTasks = tasksByPath.get(node.path) ?? [];
    const ownEvents = eventsByPath.get(node.path) ?? [];
    const children = sortSiblings(node.children.map(toGroup));
    const childCount = children.reduce((sum, child) => sum + child.totalCount, 0);
    return {
      node,
      tasks: ownTasks,
      events: ownEvents,
      children,
      totalCount: ownTasks.length + ownEvents.length + childCount,
    };
  }

  // Geschwister sortieren: zuerst nach Registry-Reihenfolge, ohne order alphabetisch dahinter
  function sortSiblings(groups: AreaGroup[]): AreaGroup[] {
    return groups.sort((a, b) => {
      const orderA = orderOf?.(a.node.path) ?? Number.POSITIVE_INFINITY;
      const orderB = orderOf?.(b.node.path) ?? Number.POSITIVE_INFINITY;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.node.path.localeCompare(b.node.path, 'de');
    });
  }

  return { groups: sortSiblings(hierarchy.map(toGroup)), untagged };
}
