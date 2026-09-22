const DurableObject = await (async () => {
  try {
    return (await import("cloudflare:workers")).DurableObject;
  } catch {
    // ponytail: Node adapter only needs the queue implementation; Cloudflare supplies the real base class.
    return class {};
  }
})();

export class MatchQueue extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS waiting_submissions (
          submission_id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          version_id TEXT NOT NULL,
          queued_at INTEGER NOT NULL
        )
      `);
      ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS waiting_submissions_order ON waiting_submissions(queued_at, submission_id)");
    });
  }

  async enqueue(entry) {
    const existing = this.ctx.storage.sql.exec(
      "SELECT submission_id FROM waiting_submissions WHERE user_id = ? LIMIT 1",
      entry.userId,
    ).toArray();
    if (existing.length) throw new Error("QUEUE_ALREADY_WAITING");

    this.ctx.storage.sql.exec(
      "INSERT INTO waiting_submissions (submission_id, user_id, version_id, queued_at) VALUES (?, ?, ?, ?)",
      entry.submissionId, entry.userId, entry.versionId, entry.queuedAt,
    );

    const rows = this.ctx.storage.sql.exec(
      "SELECT submission_id, user_id, version_id, queued_at FROM waiting_submissions ORDER BY queued_at, submission_id",
    ).toArray();
    for (let index = 0; index < rows.length; index += 1) {
      const first = rows[index];
      const second = rows.slice(index + 1).find(candidate => candidate.user_id !== first.user_id);
      if (!second) continue;
      this.ctx.storage.sql.exec("DELETE FROM waiting_submissions WHERE submission_id IN (?, ?)", first.submission_id, second.submission_id);
      return { status: "matched", pair: { A: first, B: second } };
    }
    return { status: "queued", position: rows.length };
  }

  async snapshot() {
    return this.ctx.storage.sql.exec(
      "SELECT submission_id, user_id, version_id, queued_at FROM waiting_submissions ORDER BY queued_at, submission_id",
    ).toArray();
  }
}
