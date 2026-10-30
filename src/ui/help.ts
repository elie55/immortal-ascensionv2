/**
 * First-time hints and the (?) help sheet. Each system screen has a key: the first time it opens, a one-line
 * hint shows under the title until "Got it" (remembered in the save, progress.hintsSeen); the (?) in the title
 * bar opens the full explanation at any time.
 */
import { h } from "./core/dom.ts";
import { icon } from "./core/icons.ts";
import type { App } from "../app.ts";

export const HELP: Record<string, { title: string; line: string; points: string[] }> = {
  inventory: { title: "Inventory", line: "Your bag has limited slots: one per stack or piece. Store spares in the depot in Your Quarters.", points: [
    "One slot per item stack (any quantity) or per piece of gear; what you wear takes no slot.",
    "Drops that do not fit wait in the overflow pouch at the top. Free a slot and tap Claim.",
    "Expand the bag with spirit stones (the + button); higher ranks add slots too.",
    "Lock gear you want to keep: locked pieces are never sold by Sell all.",
    "Tap an item for Compare (green/red deltas against what you wear), Equip, Use, Use ×N and Sell."] },
  depot: { title: "Storage Chest", line: "Move items between your bag and the depot. Stored items stay safe but must be taken back before use.", points: [
    "The depot has its own slots and expansions.", "Crafting, selling and using only read your bag.", "Store all materials moves every material stack in one press.", "Quest items stay with you."] },
  forge: { title: "Spirit Forge", line: "Enhance for guaranteed power, Refine for a rarity up, Reforge to reroll secondary stats, Awaken for the special effect.", points: [
    "Enhance: +1 per success up to +15; low levels never fail. Enhance ×5 stops at the first failure; To +N keeps going until the target or your materials run out.",
    "Refine: one rarity up (within the base's range); your rolls keep their quality and enhancement.",
    "Reforge: rerolls the secondary attributes; lock the ones you like first (locks cost more).",
    "Awaken: unlocks the piece's special effect permanently.", "Craft: recipes come from blueprints you studied."] },
  alchemy: { title: "Alchemy Hall", line: "Pick a recipe, load materials, refine. Success and yield grow with your furnace grade and proficiency.", points: [
    "Each load has a success chance; failures still give proficiency.", "Proficiency unlocks higher grades of pills; the furnace upgrades with materials.", "Recipes come from manuals and shops; unknown ones show what unlocks them."] },
  autobattle: { title: "Auto-battle", line: "Rules fire top to bottom: the first rule whose condition is true picks the technique. Drag ▲▼ to reorder.", points: [
    "Conditions: Always, My HP below N %, SP above N, No shield, Boss fights, Enemies ≥ N, Big attack coming (an elite or boss is winding up).", "Targets: Default, Lowest HP, Strongest, Weakest, Toughest.", "Up to three presets (Balanced, Boss, Farming); the active one is used in every auto battle.", "Switch Manual in battle to choose every move yourself."] },
  techniques: { title: "Techniques", line: "Four active slots, two passive, one ultimate. Mastery grows with use and raises power.", points: [
    "Learn techniques from manuals (Scripture Pavilion, drops, quests).", "Elements matter: a technique of the element your enemy is weak to deals more.", "Your cultivation method sets your Qi rate; its mastery grows while you cultivate."] },
  beasts: { title: "Spirit Beast Garden", line: "Hatch eggs by winning battles, feed to level, play and train for bond, evolve at the level cap.", points: [
    "Eggs go into incubators and hatch after a number of victories.", "Favourite food gives more XP; bond unlocks stronger passives.", "Evolution needs the level cap, materials and stones; each stage has new stats and abilities.", "One active beast fights beside you."] },
  dungeons: { title: "Dungeons", line: "Resource dungeons have tiers I–V: clear a tier to open the next; higher tiers are harder and pay more.", points: [
    "Rec. CP in green means you are ready, gold is close (≥ 80 %), red is too strong for now.", "Resource dungeons: 3 runs a day shared across tiers; first clear of each tier pays a bonus once.",
    "Endless Tower: climb floor by floor; wardens every 10 floors; milestones pay once.", "Secret realms: branching rooms, your HP carries over; leave and come back later.", "Mega dungeons: bring Dao companions; the only source of Divine gear."] },
  tower: { title: "Heaven-Piercing Tower", line: "Each floor is stronger than the last; your best floor is remembered and milestones pay once.", points: ["No energy, no daily cap.", "Wardens guard every tenth floor.", "Milestone rewards (floors 5, 10, 20…) are paid the first time you clear the floor."] },
  realm: { title: "Secret Realm", line: "Choose a path through the rooms; HP carries over between fights. Leave keeps your progress.", points: ["Trials, elites, chests, merchants, a rest room and the boss.", "Hidden rooms reveal themselves after certain clears.", "Abandon resets the run; the loot you found stays."] },
  shop: { title: "Merchant", line: "Prices drop with Sect Fame; stock restocks on a timer. Sell spare gear by rarity in one press.", points: ["Locked and worn gear is never sold.", "Rare and better pieces ask before selling.", "Sell all junk clears everything marked junk."] },
  missions: { title: "Mission Hall", line: "Accept requests, bring what they ask, earn Sect Fame for ranks. Tap Track to be guided there.", points: ["Fame unlocks ranks and sect areas.", "Tracked quests stay pinned under the header; Go ▸ takes you to the right place.", "Ready quests can be turned in from the Quest Log with Turn in all."] },
  quests: { title: "Quest Log", line: "Track a quest to pin it under the header; Go ▸ leads you to its place. Turn in all hands in every ready quest.", points: ["Main quests track themselves until you choose another.", "Each objective shows where it happens.", "Abandoning a side quest loses its progress; main quests cannot be abandoned."] },
  region: { title: "Region map", line: "Tap a place to see its enemies and rewards. Places open in number order: clear one to open the next.", points: ["Merchants and secret-realm gates open alongside the place before them.", "Hidden places may reveal themselves when you win the battle next to them.", "A tracked quest marks its place; if it is still locked, the place to clear next pulses.", "Rec. CP colours: green ready, gold close, red too strong."] },
  character: { title: "Character", line: "Best equips the strongest loadout from your bag in one tap; tap any stat for its sources.", points: ["A red dot on the tab means your bag holds better gear.", "Slots open with your realm (the artifact slot at Foundation Establishment).", "Compare shows green/red deltas against what you wear."] },
};

const seen = (app: App, key: string) => app.game.state.progress.hintsSeen.includes(key);

/** One-line hint under the title bar, shown until dismissed; (?) opens the full help. */
export function hintBar(app: App, key: string) {
  const hp = HELP[key];
  if (!hp || seen(app, key)) return null;
  return h("div", { class: "glass hint-bar" },
    h("span", { class: "hint-i" }, icon("info", 14)),
    h("span", { class: "grow" }, hp.line),
    h("button", { class: "btn sm jade", onClick: () => app.game.run("hint", app.now(), (st) => { if (!st.progress.hintsSeen.includes(key)) st.progress.hintsSeen.push(key); return { ok: true, events: [] }; }, false) }, "Got it"));
}

/** (?) button for the title bar. */
export function helpButton(app: App, key: string) {
  const hp = HELP[key];
  if (!hp) return null;
  return h("button", { class: "icon-btn help-btn", "aria-label": `Help: ${hp.title}`, onClick: () => app.router.open({ id: "help", kind: "sheet", render: () => h("div", null,
    h("div", { class: "sec-h" }, h("h3", null, hp.title), h("span", { class: "hint" }, "How it works")),
    h("p", { class: "dim", style: { margin: "0 0 10px" } }, hp.line),
    h("ul", { class: "rules" }, hp.points.map((p) => h("li", null, p)))) }) }, "?");
}
