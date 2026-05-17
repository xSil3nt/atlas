export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { image } = req.body ?? {};
  if (!image) return res.status(400).json({ error: "missing image" });

  const key = process.env.IMGBB_KEY;
  if (!key) return res.status(500).json({ error: "upload not configured" });

  const form = new URLSearchParams();
  form.set("key", key);
  form.set("image", image);

  try {
    const r = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body: form });
    const data = await r.json();
    if (!data.success) return res.status(502).json({ error: "imgbb error", detail: data });
    return res.status(200).json({ url: data.data.url });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
