import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { render, type Job } from "./render.ts";
Deno.serve(async (req) => {
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  // Gateway verifies the project JWT. Request content is ignored: recipients and
  // message data come exclusively from the private database queue.
  const user = Deno.env.get("AGENDA_SMTP_USER"),
    pass = Deno.env.get("AGENDA_SMTP_PASSWORD"),
    site = Deno.env.get("AGENDA_SITE_URL");
  if (!user || !pass || !site)
    return Response.json(
      { ready: false, reason: "Mail is not configured" },
      { status: 503 },
    );
  let siteUrl: URL;
  try {
    siteUrl = new URL(site);
    if (siteUrl.protocol !== "https:") throw Error();
  } catch {
    return Response.json({ ready: false }, { status: 503 });
  }
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await client.rpc("claim_mail");
  if (error) return Response.json({ ok: false }, { status: 500 });
  const jobs = (data || []) as Job[],
    groups = new Map<string, Job[]>();
  for (const job of jobs) {
    const key = job.recipient + "|" + job.kind;
    groups.set(key, [...(groups.get(key) || []), job]);
  }
  const transport = nodemailer.createTransport({
    host: Deno.env.get("AGENDA_SMTP_HOST") || "smtp.gmail.com",
    port: Number(Deno.env.get("AGENDA_SMTP_PORT") || 465),
    secure: (Deno.env.get("AGENDA_SMTP_PORT") || "465") === "465",
    auth: { user, pass },
    connectionTimeout: 15000,
    socketTimeout: 20000,
  });
  let sent = 0;
  for (const group of groups.values()) {
    let success = false;
    try {
      await transport.sendMail({
        from: { name: "Kiki & Marty", address: user },
        to: group[0].recipient,
        ...render(group, siteUrl.href),
      });
      success = true;
      sent += group.length;
    } catch {
      console.error("Mail delivery failed; private job will retry.");
    }
    for (const job of group) {
      const { error } = await client.rpc("finish_mail", {
        p_id: job.id,
        p_lease: job.lease,
        p_sent: success,
      });
      if (error) console.error("Mail completion failed.");
    }
  }
  transport.close();
  return Response.json({ ok: true, processed: jobs.length, sent });
});
