/** Story scenes: completion, choices, unlocks, and trigger lookup. */
import type { ContentIndex, StoryScene } from "../content/index.ts";
import type { GameState } from "./state.ts";
import type { DomainEvent } from "./events.ts";
import { addItem } from "./inventory.ts";
import { grantRewards, type ActionResult } from "./actions.ts";

export function applyUnlock(s: GameState, content: ContentIndex, id: string, out: DomainEvent[]): void {
  if (id.startsWith("method.")) { if (s.character.methodMastery[id] === undefined) s.character.methodMastery[id] = 0; }
  else if (id.startsWith("tech.")) { if (s.techniques.known[id] === undefined) s.techniques.known[id] = 0; }
  else if (content.has(id) && /^(mat|cons|gift|book|blueprint|qitem|egg|bfood|junk)\./.test(id)) { addItem(s, content, id, 1); out.push({ type: "item_gained", id, qty: 1 }); }
  else if (!s.progress.unlocks.includes(id)) s.progress.unlocks.push(id);
  out.push({ type: "unlock", id });
}

/** Finish a scene (after its lines, with the chosen option if it has choices). Returns the next scene, if any. */
export function completeScene(s: GameState, content: ContentIndex, sceneId: string, choice: number | null, now: number): ActionResult<{ next?: string }> {
  const scene = content.get<StoryScene>(sceneId);
  const events: DomainEvent[] = [];
  let next = scene.next;
  if (scene.choices?.length) {
    if (choice === null || !scene.choices[choice]) return { ok: false, reason: "Choose an answer" };
    const c = scene.choices[choice]!;
    grantRewards(s, content, c.effects, events);
    s.progress.storyChoices[sceneId] = String(choice);
    if (c.next) next = c.next;
  }
  if (!s.progress.storySeen[sceneId]) for (const u of scene.unlocks) applyUnlock(s, content, u, events);
  s.progress.storySeen[sceneId] = now;
  events.push({ type: "unlock", id: sceneId });
  return { ok: true, events, next };
}

/** Scenes whose trigger matches an event and that have not been seen yet. */
export function scenesFor(s: GameState, content: ContentIndex, match: (t: StoryScene["trigger"]) => boolean): StoryScene[] {
  return content.byPrefix<StoryScene>("story").filter((sc) => !s.progress.storySeen[sc.id] && match(sc.trigger));
}

export const firstScene = (content: ContentIndex) => content.byPrefix<StoryScene>("story").find((sc) => sc.trigger.on === "new_game");
