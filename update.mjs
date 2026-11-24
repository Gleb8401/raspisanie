// Забирает расписание группы с mstimetables.ru на 3 недели вперёд и сохраняет в data.json.
// meta.json пишется при каждом запуске (время проверки и была ли ошибка).
// Запускается GitHub Actions раз в час: node update.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const PUBLICATION = "01a00f53-d327-73b5-b396-bf3eb6f57ce2";
const GROUP_ID = 249; // 05-26.РИУПО.ОФ.9, 06-26.РИУПО.ОФ.9, 01-26.СИСА.ОФ.9

const MSK = 3 * 3600e3; // Москва, UTC+3
const msk = new Date(Date.now() + MSK);
const isoDay = d => d.toISOString().slice(0, 10);
const stamp = () => new Date(Date.now() + MSK).toISOString().slice(0, 19) + "+03:00";
const dow = (msk.getUTCDay() + 6) % 7;
const monday = new Date(Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate() - dow));
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);
const start = isoDay(monday), end = isoDay(addDays(monday, 20));
const url = `https://site.mstimetables.ru/api/publications/${PUBLICATION}/groups/${GROUP_ID}/lessons?startDate=${start}&endDate=${end}`;

const meta = { checkedAt: stamp(), ok: true, note: "" };
try {
  const r = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(40000) });
  if (!r.ok) throw new Error(`сайт ответил HTTP ${r.status}`);
  const j = await r.json();
  const list = Array.isArray(j) ? j : (j.lessons || []);

  const weeks = {};
  for (let i = 0; i < 3; i++) weeks[isoDay(addDays(monday, 7 * i))] = { type: "", lessons: [] };
  list.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  for (const l of list) {
    const d = new Date(l.date + "T00:00:00Z");
    const wk = isoDay(addDays(d, -((d.getUTCDay() + 6) % 7)));
    if (!weeks[wk]) continue;
    if (l.weekType === "Odd") weeks[wk].type = "нечётная";
    else if (l.weekType === "Even") weeks[wk].type = "чётная";
    const groups = l.unionGroups || [];
    weeks[wk].lessons.push({
      date: l.date, s: l.startTime, e: l.endTime,
      subj: l.subject?.name || "",
      type: l.typeLesson?.name || "",
      room: l.cabinet?.name || "",
      teacher: (l.teachers || []).map(t => t.fio).join(", "),
      with: groups.filter(g => g.group?.id !== GROUP_ID).map(g => g.group?.name).join("; "),
      sub: groups.filter(g => g.group?.id === GROUP_ID && g.subgroup).map(g => g.subgroup?.name ?? g.subgroup).join(", "),
      repl: l.replacementType || "none",
    });
  }

  const hash = createHash("sha256").update(JSON.stringify(weeks)).digest("hex").slice(0, 16);
  const old = existsSync("data.json") ? JSON.parse(readFileSync("data.json", "utf8")) : null;
  if (!old || old.hash !== hash) {
    writeFileSync("data.json", JSON.stringify({ hash, changedAt: stamp(), range: `${start}..${end}`, weeks }, null, 1));
    console.log(`Расписание изменилось: ${list.length} пар, ${hash}`);
  } else {
    console.log(`Без изменений: ${list.length} пар`);
  }
} catch (e) {
  meta.ok = false;
  meta.note = String(e?.message || e);
  console.log("Ошибка: " + meta.note);
}
writeFileSync("meta.json", JSON.stringify(meta, null, 1));
