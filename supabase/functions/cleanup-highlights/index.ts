// Deletes goal clips of tournaments that ended more than `clip_retention_days` ago (storage + rows).
// Called daily by pg_cron. Safe to call by anyone: it only removes clips that have already expired.
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async () => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await db.rpc('expired_highlights');
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  const rows = (data ?? []) as { id: string; path: string }[];
  let removed = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error: e1 } = await db.storage.from('highlights').remove(batch.map((r) => r.path));
    if (e1) continue;
    await db.rpc('forget_highlights', { p_ids: batch.map((r) => r.id) });
    removed += batch.length;
  }
  return new Response(JSON.stringify({ removed }), { headers: { 'Content-Type': 'application/json' } });
});
