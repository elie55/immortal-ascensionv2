import { test } from "node:test";
import assert from "node:assert/strict";
import { testContent } from "./helpers/content.ts";
import { newGameState, STATE_VERSION } from "../src/engine/state.ts";
import { encode, decode, fnv1a, canonical, migrations } from "../src/save/codec.ts";
import { MemoryStorage } from "../src/save/storage.ts";
import { SaveManager, DEFAULT_SETTINGS } from "../src/save/slots.ts";
import { Autosave } from "../src/save/autosave.ts";
import { Game } from "../src/engine/game.ts";
import { breakThrough } from "../src/engine/actions.ts";
import { qiNeeded } from "../src/engine/cultivation.ts";

const content = testContent();
const T0 = Date.UTC(2026, 9, 29, 12, 0, 0);

test("encode → decode round-trips the state exactly", () => {
  const s = newGameState(content, T0, { seed: 1 });
  const r = decode(encode(s, 0, T0));
  assert.ok(r.ok);
  assert.deepEqual(r.state, s);
  assert.equal(r.slot, 0);
});

test("canonical JSON ignores key order; checksum detects a single flipped character", () => {
  assert.equal(canonical({ b: 1, a: { d: 2, c: 3 } }), canonical({ a: { c: 3, d: 2 }, b: 1 }));
  const s = newGameState(content, T0, { seed: 1 });
  const text = encode(s, 0, T0);
  const i = text.indexOf('"spirit_stones":') + 16;
  const broken = text.slice(0, i) + (text[i] === "9" ? "8" : "9") + text.slice(i + 1);
  const r = decode(broken);
  assert.ok(!r.ok && r.stage === "checksum");
  assert.notEqual(fnv1a("a"), fnv1a("b"));
});

test("decode rejects garbage, foreign envelopes, newer versions and invalid states with a stage", () => {
  assert.equal((decode("{nope") as any).stage, "parse");
  assert.equal((decode(JSON.stringify({ kind: "other" })) as any).stage, "envelope");
  const s = newGameState(content, T0, { seed: 1 });
  const future = JSON.parse(encode(s, 0, T0)); future.v = STATE_VERSION + 5;
  assert.equal((decode(JSON.stringify(future)) as any).stage, "migrate");
  const bad = JSON.parse(encode(s, 0, T0)); bad.state.character.stage = 42; bad.checksum = fnv1a(canonical(bad.state));
  const r = decode(JSON.stringify(bad));
  assert.ok(!r.ok && r.stage === "validate" && r.reason.includes("character.stage"));
});

test("migrations run in sequence from an old version", () => {
  // Simulate a v1 file loaded by a client whose current version is 2 by temporarily registering a 1→2 step
  // and asking decode to target version 2.
  const s = newGameState(content, T0, { seed: 1 });
  const raw = JSON.parse(encode(s, 0, T0));
  delete raw.state.daily; raw.checksum = fnv1a(canonical(raw.state));
  migrations[1] = (st) => ({ ...st, daily: { day: "2026-01-01", counters: {} } });
  try {
    const r = decode(JSON.stringify(raw), 2);
    assert.ok(r.ok && r.migratedFrom === 1 && r.state.meta.version === 2 && r.state.daily.day === "2026-01-01");
    const same = decode(encode(s, 0, T0), 1);
    assert.ok(same.ok && same.migratedFrom === undefined);
  } finally { delete migrations[1]; }
});

test("SaveManager: save, index summary, load, delete, copy", async () => {
  const st = new MemoryStorage();
  const m = new SaveManager(st, content);
  const s = newGameState(content, T0, { seed: 2, name: "Lin" });
  await m.save(s, 1, T0 + 5000);
  const idx = await m.index();
  assert.equal(idx[1]!.name, "Lin");
  assert.equal(idx[1]!.savedAt, T0 + 5000);
  const l = await m.load(1);
  assert.ok(l.ok && !l.recoveredFromBackup && l.state.character.name === "Lin");
  assert.deepEqual(await m.load(2), { ok: false, empty: true });
  await m.copy(1, 3);
  assert.ok((await m.load(3)).ok);
  await m.delete(1);
  assert.deepEqual(await m.load(1), { ok: false, empty: true });
  assert.equal((await m.index())[1], undefined);
});

test("a corrupted main file falls back to the backup; both broken reports the reason", async () => {
  const st = new MemoryStorage();
  const m = new SaveManager(st, content);
  const s = newGameState(content, T0, { seed: 2 });
  await m.save(s, 0, T0);
  s.resources.spirit_stones += 100;
  await m.save(s, 0, T0 + 1000);
  const good = st.map.get("slot:0")!;
  st.map.set("slot:0", good.slice(0, good.length - 40));
  const l = await m.load(0);
  assert.ok(l.ok && l.recoveredFromBackup && l.state.resources.spirit_stones === content.starting.spirit_stones);
  st.map.set("slot:0:bak", "xx");
  const l2 = await m.load(0);
  assert.ok(!l2.ok && !l2.empty && l2.reason && l2.backupReason);
});

test("a crash in the middle of a save never loses the previous good save", async () => {
  const st = new MemoryStorage();
  const m = new SaveManager(st, content);
  const s = newGameState(content, T0, { seed: 2 });
  await m.save(s, 0, T0);
  const before = JSON.stringify(st.map.get("slot:0"));
  for (const failAt of [1, 2, 3]) {
    const st2 = new MemoryStorage(); st2.map.set("slot:0", st.map.get("slot:0")!);
    const m2 = new SaveManager(st2, content);
    st2.failWriteAt = failAt;
    s.resources.spirit_stones += 1;
    await assert.rejects(m2.save(s, 0, T0 + failAt));
    const l = await m2.load(0);
    assert.ok(l.ok, `failAt=${failAt}`);
    assert.ok(l.state.resources.spirit_stones === content.starting.spirit_stones || l.state.resources.spirit_stones === content.starting.spirit_stones + failAt, "either old or complete new");
  }
  assert.equal(JSON.stringify(st.map.get("slot:0")), before);
});

test("settings persist separately from slots with defaults filled in", async () => {
  const st = new MemoryStorage();
  const m = new SaveManager(st, content);
  assert.deepEqual(await m.loadSettings(), DEFAULT_SETTINGS);
  await m.saveSettings({ ...DEFAULT_SETTINGS, battleSpeed: 3 });
  st.map.set("settings", JSON.stringify({ battleSpeed: 2 }));
  assert.equal((await m.loadSettings()).battleSpeed, 2);
  assert.equal((await m.loadSettings()).musicVolume, DEFAULT_SETTINGS.musicVolume);
});

test("Autosave: saves after important actions, otherwise on the interval; serialises writes", async () => {
  const st = new MemoryStorage();
  const m = new SaveManager(st, content);
  const g = new Game(content, newGameState(content, T0, { seed: 5 }));
  const auto = new Autosave(g, m, 0, 30_000);
  g.tick(1000, T0 + 1000);
  auto.maybe(T0 + 1000);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(st.map.has("slot:0"), true, "first dirty tick saves (lastSaveAt starts at 0)");
  const first = st.map.get("slot:0");
  g.tick(1000, T0 + 2000); auto.maybe(T0 + 2000);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(st.map.get("slot:0"), first, "within the interval nothing is written");
  g.state.character.qi = qiNeeded(content.get<any>(g.state.character.realm), 1);
  g.run("bt", T0 + 3000, (s, c) => breakThrough(s, c, { now: T0 + 3000 }));
  auto.maybe(T0 + 3000); auto.maybe(T0 + 3000);
  await auto.flush(T0 + 3000);
  await new Promise((r) => setTimeout(r, 0));
  const l = await m.load(0);
  assert.ok(l.ok && l.state.character.stage === 2);
  assert.equal(auto.lastError, null);
});

test("export/import moves a slot through text", async () => {
  const st = new MemoryStorage();
  const m = new SaveManager(st, content);
  await m.save(newGameState(content, T0, { seed: 9, name: "Exported" }), 2, T0);
  const text = (await m.exportSlot(2))!;
  const st2 = new MemoryStorage();
  const m2 = new SaveManager(st2, content);
  const r = await m2.importSlot(0, text, T0 + 1);
  assert.ok(r.ok && r.state.character.name === "Exported");
  assert.ok(!(await m2.importSlot(1, "junk", T0)).ok);
});
